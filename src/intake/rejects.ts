/**
 * The one piece of I/O in the intake module: write rejected rows to a CSV with
 * columns row_number, mrn, errors, raw_data. Serialization is split out from the
 * file write so it can be unit-tested without touching disk.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { csvEscape } from "../csv.js";
import type { RejectEntry } from "./types.js";

const REJECT_HEADERS = ["row_number", "mrn", "errors", "raw_data"] as const;

export function serializeRejects(entries: RejectEntry[]): string {
  const lines = [REJECT_HEADERS.join(",")];
  for (const entry of entries) {
    lines.push(
      [
        String(entry.rowNumber),
        csvEscape(entry.mrn),
        csvEscape(entry.errors),
        csvEscape(entry.rawData),
      ].join(","),
    );
  }
  return lines.join("\n") + "\n";
}

export function writeRejectsCsv(entries: RejectEntry[], path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, serializeRejects(entries), "utf-8");
}
