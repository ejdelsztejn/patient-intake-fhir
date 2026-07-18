import { describe, expect, it } from "vitest";
import { buildRunReport, formatRunReport } from "./report.js";
import type { PatientRow, RejectEntry } from "./intake/index.js";
import type { PostSummary } from "./fhir/index.js";

function valid(n: number): PatientRow[] {
  return Array.from({ length: n }, (_, i) => ({
    mrn: `MRN${100000 + i}`,
    firstName: "A",
    lastName: "B",
    dateOfBirth: "1990-01-01",
    gender: "unknown",
  }));
}

function rejects(n: number): RejectEntry[] {
  return Array.from({ length: n }, (_, i) => ({
    rowNumber: i + 1,
    mrn: `BAD${i}`,
    errors: "some reason",
    rawData: "{}",
  }));
}

const summary = (created: number, skipped: number, failed: number): PostSummary => ({
  created,
  skipped,
  failed,
  results: [],
});

describe("buildRunReport", () => {
  it("computes processed = valid + rejected and threads post counts", () => {
    const report = buildRunReport("intake_2026-07-14.csv", { valid: valid(15), rejects: rejects(3) }, summary(12, 3, 0));
    expect(report).toEqual({
      sourceFile: "intake_2026-07-14.csv",
      processed: 18,
      valid: 15,
      rejected: 3,
      posted: { created: 12, skipped: 3, failed: 0 },
    });
  });

  it("omits `posted` on a dry run (no PostSummary)", () => {
    const report = buildRunReport("intake_2026-07-14.csv", { valid: valid(2), rejects: rejects(1) });
    expect(report.posted).toBeUndefined();
    expect(report).toEqual({ sourceFile: "intake_2026-07-14.csv", processed: 3, valid: 2, rejected: 1 });
  });

  it("distinguishes a run that posted zero from a dry run", () => {
    expect(buildRunReport("f.csv", { valid: [], rejects: [] }, summary(0, 0, 0)).posted).toEqual({
      created: 0,
      skipped: 0,
      failed: 0,
    });
    expect(buildRunReport("f.csv", { valid: [], rejects: [] }).posted).toBeUndefined();
  });
});

describe("formatRunReport", () => {
  it("renders the posted-run block", () => {
    const text = formatRunReport(buildRunReport("intake_2026-07-14.csv", { valid: valid(15), rejects: rejects(3) }, summary(12, 3, 0)));
    expect(text).toBe(
      [
        "Run report — intake_2026-07-14.csv",
        "  processed: 18",
        "  valid:     15",
        "  rejected:  3",
        "  created:   12",
        "  skipped:   3",
        "  failed:    0",
      ].join("\n"),
    );
  });

  it("renders the dry-run block with a not-posted note", () => {
    const text = formatRunReport(buildRunReport("intake_2026-07-14.csv", { valid: valid(2), rejects: rejects(1) }));
    expect(text).toBe(
      [
        "Run report — intake_2026-07-14.csv",
        "  processed: 3",
        "  valid:     2",
        "  rejected:  1",
        "  posted:    (dry run — not posted; pass --post to write)",
      ].join("\n"),
    );
  });
});
