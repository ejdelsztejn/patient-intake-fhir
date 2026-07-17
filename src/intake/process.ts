/**
 * Intake orchestration: run parse -> normalize -> validate over a whole file.
 * Pure (no I/O) and the seam milestone 3 consumes — hands back valid rows as a
 * typed array plus a list of rejects ready to be written to CSV.
 */
import { normalizeRow } from "./normalize.js";
import { parseCsv } from "./parse.js";
import type { Gender, IntakeResult, NormalizedRow, PatientRow, RawRow, RejectEntry } from "./types.js";
import { validateRow } from "./validate.js";

/**
 * Build the typed handoff row from a normalized row that has already passed
 * validation, so the casts and optional-field assembly happen in exactly one
 * place. Only call this on rows with no validation errors.
 */
function toPatientRow(row: NormalizedRow): PatientRow {
  const patient: PatientRow = {
    mrn: row.mrn,
    firstName: row.firstName,
    lastName: row.lastName,
    dateOfBirth: row.dateOfBirth,
    gender: row.gender as Gender, // validated against the Gender set upstream
  };

  if (row.phone !== undefined) patient.phone = row.phone;
  if (row.email !== undefined) patient.email = row.email;

  if (
    row.addressLine !== undefined ||
    row.city !== undefined ||
    row.state !== undefined ||
    row.zip !== undefined
  ) {
    const address: NonNullable<PatientRow["address"]> = {};
    if (row.addressLine !== undefined) address.line = row.addressLine;
    if (row.city !== undefined) address.city = row.city;
    if (row.state !== undefined) address.state = row.state;
    if (row.zip !== undefined) address.zip = row.zip;
    patient.address = address;
  }

  return patient;
}

/** Best-effort MRN for a reject line: the normalized value, or the raw cell. */
function rejectMrn(normalized: string, raw: RawRow): string {
  return normalized !== "" ? normalized : (raw.mrn ?? "").trim();
}

export function runIntake(text: string): IntakeResult {
  const rawRows = parseCsv(text);
  const valid: PatientRow[] = [];
  const rejects: RejectEntry[] = [];

  rawRows.forEach((raw, index) => {
    const normalized = normalizeRow(raw);
    const errors = validateRow(normalized);

    if (errors.length === 0) {
      valid.push(toPatientRow(normalized));
      return;
    }

    rejects.push({
      rowNumber: index + 1,
      mrn: rejectMrn(normalized.mrn, raw),
      errors: errors.map((e) => e.message).join("; "),
      rawData: JSON.stringify(raw),
    });
  });

  return { valid, rejects };
}
