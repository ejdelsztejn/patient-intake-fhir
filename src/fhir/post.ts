/**
 * Milestone 4 orchestration: post a batch of Patient resources, idempotently and
 * sequentially. Sequential is intentional — it's gentle on the shared public
 * sandbox and lets conditional create collapse in-batch duplicate MRNs (the
 * second row's search finds the first's just-created Patient).
 *
 * Every post is isolated: a failure is recorded and the run continues, so one
 * bad resource never halts the batch (the same per-record isolation as the
 * intake stage). Returns a PostSummary for the milestone 5 run report.
 */
import { conditionalCreate } from "./client.js";
import type { Patient, PostResult, PostSummary } from "./types.js";

export interface PostDeps {
  /** Post a single Patient. Injectable so the batch runner is testable without a network. */
  post?: (patient: Patient) => Promise<PostResult>;
}

function summarize(results: PostResult[]): PostSummary {
  const summary: PostSummary = { created: 0, skipped: 0, failed: 0, results };
  for (const result of results) {
    if (result.outcome === "created") summary.created++;
    else if (result.outcome === "skipped") summary.skipped++;
    else summary.failed++;
  }
  return summary;
}

export async function postPatients(patients: Patient[], deps: PostDeps = {}): Promise<PostSummary> {
  const post = deps.post ?? ((patient: Patient) => conditionalCreate(patient));
  const results: PostResult[] = [];

  for (const patient of patients) {
    try {
      results.push(await post(patient));
    } catch (err) {
      // conditionalCreate returns failures rather than throwing, but guard the
      // seam so even a throwing injected client can't halt the batch.
      const mrn = patient.identifier?.[0]?.value ?? "";
      results.push({ mrn, outcome: "failed", error: err instanceof Error ? err.message : String(err) });
    }
  }

  return summarize(results);
}
