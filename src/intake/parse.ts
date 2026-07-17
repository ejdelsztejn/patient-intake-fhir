/**
 * Stage 1: parse. CSV text -> raw rows keyed by the file's real headers.
 *
 * Rows are kept faithful to the source here (no trimming/cleanup — that's
 * normalize's job) so a rejected row's raw_data blob reflects exactly what
 * arrived. Column-count mismatches are tolerated rather than fatal: a short or
 * long row still becomes an object (missing cells simply absent), so a single
 * malformed row can never halt the run — it falls through to validation and is
 * rejected there.
 */
import { parse } from "csv-parse/sync";
import type { RawRow } from "./types.js";

export function parseCsv(text: string): RawRow[] {
  const records = parse(text, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    bom: true,
  }) as Record<string, string>[];

  return records.map((record) => ({ ...record }));
}
