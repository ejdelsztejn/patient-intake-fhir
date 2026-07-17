/**
 * Milestone 2 intake stage: parse -> normalize -> validate a clinic intake CSV.
 * `runIntake` is the entry point; the rest is exported for testing and reuse.
 */
export type {
  Gender,
  IntakeResult,
  NormalizedRow,
  PatientRow,
  RawRow,
  RejectEntry,
  ValidationError,
} from "./types.js";
export { parseCsv } from "./parse.js";
export { normalizeRow } from "./normalize.js";
export { validateRow } from "./validate.js";
export { runIntake } from "./process.js";
export { serializeRejects, writeRejectsCsv } from "./rejects.js";
