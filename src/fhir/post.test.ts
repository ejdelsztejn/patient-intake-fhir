import { describe, expect, it } from "vitest";
import { postPatients } from "./post.js";
import type { Patient, PostResult } from "./types.js";

function patient(mrn: string): Patient {
  return { resourceType: "Patient", identifier: [{ system: "urn:clinic:intake:mrn", value: mrn }] };
}

describe("postPatients", () => {
  it("tallies created / skipped / failed and preserves per-resource results", async () => {
    const outcomes: Record<string, PostResult["outcome"]> = {
      A11111: "created",
      B22222: "skipped",
      C33333: "failed",
      D44444: "created",
    };
    const summary = await postPatients(
      Object.keys(outcomes).map(patient),
      { post: async (p) => ({ mrn: p.identifier![0]!.value!, outcome: outcomes[p.identifier![0]!.value!]! }) },
    );

    expect(summary.created).toBe(2);
    expect(summary.skipped).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.results.map((r) => r.mrn)).toEqual(["A11111", "B22222", "C33333", "D44444"]);
  });

  it("isolates a thrown error to one resource and keeps going", async () => {
    const summary = await postPatients([patient("A11111"), patient("B22222"), patient("C33333")], {
      post: async (p) => {
        const mrn = p.identifier![0]!.value!;
        if (mrn === "B22222") throw new Error("boom");
        return { mrn, outcome: "created" };
      },
    });

    expect(summary.created).toBe(2);
    expect(summary.failed).toBe(1);
    const failed = summary.results.find((r) => r.outcome === "failed");
    expect(failed?.mrn).toBe("B22222");
    expect(failed?.error).toContain("boom");
  });

  it("returns an all-zero summary for no patients", async () => {
    expect(await postPatients([])).toEqual({ created: 0, skipped: 0, failed: 0, results: [] });
  });
});
