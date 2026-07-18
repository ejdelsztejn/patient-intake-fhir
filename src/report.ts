/**
 * Milestone 5: the end-of-run report. Aggregates the counts the pipeline already
 * produces — intake valid/rejected and the FHIR PostSummary — into one summary
 * that closes every run. Pure builder + formatter; src/index.ts renders it and
 * persists the object to out/report_<file>.json.
 */
import type { PatientRow, RejectEntry } from "./intake/index.js";
import type { PostSummary } from "./fhir/index.js";

export interface RunReport {
  sourceFile: string | null; // null when the drop was empty (no file to report on)
  processed: number; // total data rows read from the CSV
  valid: number; // passed validation (== resources mapped)
  rejected: number; // failed validation, routed to the rejects CSV
  /** Post outcome — absent on a dry run (nothing was posted). */
  posted?: { created: number; skipped: number; failed: number };
}

export function buildRunReport(
  sourceFile: string | null,
  intake: { valid: PatientRow[]; rejects: RejectEntry[] },
  postSummary?: PostSummary,
): RunReport {
  const report: RunReport = {
    sourceFile,
    processed: intake.valid.length + intake.rejects.length,
    valid: intake.valid.length,
    rejected: intake.rejects.length,
  };
  if (postSummary) {
    report.posted = {
      created: postSummary.created,
      skipped: postSummary.skipped,
      failed: postSummary.failed,
    };
  }
  return report;
}

export function formatRunReport(report: RunReport): string {
  const lines = [
    `Run report — ${report.sourceFile ?? "(no intake file)"}`,
    `  processed: ${report.processed}`,
    `  valid:     ${report.valid}`,
    `  rejected:  ${report.rejected}`,
  ];
  if (report.posted) {
    lines.push(
      `  created:   ${report.posted.created}`,
      `  skipped:   ${report.posted.skipped}`,
      `  failed:    ${report.posted.failed}`,
    );
  } else {
    lines.push(`  posted:    (dry run — not posted; pass --post to write)`);
  }
  return lines.join("\n");
}
