/**
 * Core types for the intake stage (milestone 2): parse -> normalize -> validate.
 *
 * The important shape here is the transition from NormalizedRow (loose: cleaned
 * strings that may still be invalid) to PatientRow (narrowed: guaranteed-valid,
 * typed). Validation is the gate between them. Milestone 3's FHIR mapper only
 * ever sees PatientRow and never has to know anything about messy input.
 */

/** A row straight off the CSV parser, keyed by the file's real headers. */
export type RawRow = Record<string, string>;

/**
 * A row after per-field boundary cleanup. Types are still loose on purpose:
 * normalization trims/casefolds/strips, but cannot guarantee validity (a `dob`
 * may still be a nonsense date). Required fields are always present as strings
 * ("" when missing); optional fields are `undefined` when the source cell was
 * blank. `phone` is the exception: it stays present (possibly "") when the
 * source had non-blank junk, so validation can flag it rather than silently
 * treating "call me" as "no phone provided".
 */
export interface NormalizedRow {
  mrn: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  phone?: string;
  email?: string;
  addressLine?: string;
  city?: string;
  state?: string;
  zip?: string;
}

export type Gender = "male" | "female" | "other" | "unknown";

/** A validated, typed patient row — the handoff to the FHIR mapper. */
export interface PatientRow {
  mrn: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string; // guaranteed valid ISO YYYY-MM-DD
  gender: Gender;
  phone?: string; // guaranteed 10 digits when present
  email?: string;
  address?: {
    line?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
}

/** A single validation failure, scoped to the field it concerns. */
export interface ValidationError {
  field: string;
  message: string;
}

/** One line in the rejects CSV. */
export interface RejectEntry {
  rowNumber: number; // 1-based, counting data rows (header excluded)
  mrn: string; // best-effort, even when the row is otherwise invalid
  errors: string; // human-readable reasons, semicolon-joined
  rawData: string; // JSON blob of the original raw row
}

/** The result of running intake over a whole file. */
export interface IntakeResult {
  valid: PatientRow[];
  rejects: RejectEntry[];
}
