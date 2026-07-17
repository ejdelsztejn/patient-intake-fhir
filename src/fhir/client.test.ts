import { describe, expect, it } from "vitest";
import { conditionalCreate } from "./client.js";
import type { Patient } from "./types.js";

const PATIENT: Patient = {
  resourceType: "Patient",
  identifier: [{ system: "urn:clinic:intake:mrn", value: "MRN559361" }],
  name: [{ use: "official", family: "Dickinson", given: ["Daniel"] }],
  gender: "male",
  birthDate: "1935-02-17",
};

interface Call {
  url: string;
  init: RequestInit;
}

/** A fetch stub that returns/throws the given steps in order (last repeats). */
function scriptedFetch(steps: Array<Response | Error>) {
  const calls: Call[] = [];
  let i = 0;
  const fn = (async (url: string | URL, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    const step = steps[Math.min(i, steps.length - 1)];
    i += 1;
    if (step instanceof Error) throw step;
    return step!;
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const created = (id = "123") =>
  new Response("", { status: 201, headers: { Location: `https://fhir.example/base/Patient/${id}/_history/1` } });
const matched = () => new Response("", { status: 200 });

// backoffMs: 0 so retry tests don't actually wait.
const deps = (fn: typeof fetch) => ({
  fetch: fn,
  backoffMs: 0,
  baseUrl: "https://fhir.example/base",
  mrnSystem: "urn:clinic:intake:mrn",
});

describe("conditionalCreate", () => {
  it("POSTs to /Patient with an If-None-Exist MRN search and the resource body", async () => {
    const { fn, calls } = scriptedFetch([created()]);
    await conditionalCreate(PATIENT, deps(fn));

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://fhir.example/base/Patient");
    expect(calls[0]!.init.method).toBe("POST");
    const headers = calls[0]!.init.headers as Record<string, string>;
    // System and value percent-encoded (colons -> %3A); the `|` separator is literal.
    expect(headers["If-None-Exist"]).toBe("identifier=urn%3Aclinic%3Aintake%3Amrn|MRN559361");
    expect(headers["Content-Type"]).toBe("application/fhir+json");
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual(PATIENT);
  });

  it("percent-encodes URL-special characters in the identifier search", async () => {
    const { fn, calls } = scriptedFetch([created()]);
    const patient: Patient = { resourceType: "Patient", identifier: [{ value: "AB/CD 12" }] };
    await conditionalCreate(patient, { ...deps(fn), mrnSystem: "urn:clinic:intake:mrn" });

    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers["If-None-Exist"]).toBe("identifier=urn%3Aclinic%3Aintake%3Amrn|AB%2FCD%2012");
  });

  it("classifies 201 as created and extracts the resource id from Location", async () => {
    const { fn } = scriptedFetch([created("999")]);
    expect(await conditionalCreate(PATIENT, deps(fn))).toEqual({
      mrn: "MRN559361",
      outcome: "created",
      status: 201,
      resourceId: "999",
    });
  });

  it("classifies 200 as skipped (patient already exists)", async () => {
    const { fn } = scriptedFetch([matched()]);
    const result = await conditionalCreate(PATIENT, deps(fn));
    expect(result.outcome).toBe("skipped");
    expect(result.status).toBe(200);
  });

  it("fails a deterministic 4xx without retrying", async () => {
    const { fn, calls } = scriptedFetch([new Response("bad request", { status: 400 })]);
    const result = await conditionalCreate(PATIENT, deps(fn));
    expect(result.outcome).toBe("failed");
    expect(result.status).toBe(400);
    expect(result.error).toContain("HTTP 400");
    expect(calls).toHaveLength(1); // no retry
  });

  it("retries once on a transient 5xx, then succeeds", async () => {
    const { fn, calls } = scriptedFetch([new Response("", { status: 503 }), created("777")]);
    const result = await conditionalCreate(PATIENT, deps(fn));
    expect(result.outcome).toBe("created");
    expect(result.resourceId).toBe("777");
    expect(calls).toHaveLength(2);
  });

  it("retries once on a network error, then gives up as failed", async () => {
    const { fn, calls } = scriptedFetch([new Error("ECONNRESET"), new Error("ECONNRESET")]);
    const result = await conditionalCreate(PATIENT, deps(fn));
    expect(result.outcome).toBe("failed");
    expect(result.error).toContain("ECONNRESET");
    expect(calls).toHaveLength(2);
  });

  it("recovers when a network error is followed by success", async () => {
    const { fn, calls } = scriptedFetch([new Error("socket hang up"), matched()]);
    const result = await conditionalCreate(PATIENT, deps(fn));
    expect(result.outcome).toBe("skipped");
    expect(calls).toHaveLength(2);
  });
});
