/**
 * Milestone 4 transport: post one FHIR Patient to the server via conditional
 * create, so re-running the feed never duplicates a patient.
 *
 *   POST /Patient
 *   If-None-Exist: identifier=<mrnSystem>|<mrn>
 *
 * Server behavior (FHIR conditional create):
 *   0 matches -> creates, 201 -> "created"
 *   1 match   -> no-op,   200 -> "skipped" (already present)
 *   >1 match  -> 412            -> "failed"
 *
 * Transient failures (network error/timeout, 429, 5xx) get one bounded retry;
 * deterministic 4xx fail immediately. All failure modes are returned as a
 * PostResult, never thrown, so the batch runner can isolate them per-resource.
 */
import { config } from "../config.js";
import type { Patient, PostResult } from "./types.js";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_BACKOFF_MS = 500;
const MAX_ATTEMPTS = 2; // one initial try + one retry

// Statuses worth a retry: rate limiting and transient server errors.
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export interface ClientDeps {
  fetch?: typeof fetch;
  timeoutMs?: number;
  backoffMs?: number;
  baseUrl?: string;
  mrnSystem?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(
  doFetch: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await doFetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Pull the resource id out of a Location/Content-Location header, if present. */
function parseResourceId(response: Response): string | undefined {
  const location = response.headers.get("location") ?? response.headers.get("content-location");
  if (!location) return undefined;
  return /\/Patient\/([^/?]+)/.exec(location)?.[1];
}

async function describeError(response: Response): Promise<string> {
  let detail = "";
  try {
    detail = (await response.text()).trim().slice(0, 200);
  } catch {
    // Body already consumed or unreadable — the status alone is the message.
  }
  return `HTTP ${response.status}${detail ? `: ${detail}` : ""}`;
}

export async function conditionalCreate(patient: Patient, deps: ClientDeps = {}): Promise<PostResult> {
  const doFetch = deps.fetch ?? fetch;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const backoffMs = deps.backoffMs ?? DEFAULT_BACKOFF_MS;
  const baseUrl = (deps.baseUrl ?? config.fhir.baseUrl).replace(/\/$/, "");
  const mrnSystem = deps.mrnSystem ?? config.fhir.mrnSystem;
  const mrn = patient.identifier?.[0]?.value ?? "";

  const url = `${baseUrl}/Patient`;
  const init: RequestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/fhir+json",
      Accept: "application/fhir+json",
      "If-None-Exist": `identifier=${mrnSystem}|${mrn}`,
    },
    body: JSON.stringify(patient),
  };

  let lastError = "unknown error";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetchWithTimeout(doFetch, url, init, timeoutMs);

      if (response.status === 201) {
        return { mrn, outcome: "created", status: 201, resourceId: parseResourceId(response) };
      }
      if (response.status === 200) {
        return { mrn, outcome: "skipped", status: 200, resourceId: parseResourceId(response) };
      }

      if (RETRYABLE_STATUS.has(response.status) && attempt < MAX_ATTEMPTS) {
        lastError = `HTTP ${response.status}`;
        await sleep(backoffMs);
        continue;
      }
      return { mrn, outcome: "failed", status: response.status, error: await describeError(response) };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_ATTEMPTS) {
        await sleep(backoffMs);
        continue;
      }
    }
  }

  return { mrn, outcome: "failed", error: lastError };
}
