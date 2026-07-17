/**
 * Stage 2: normalize. Per-field cleanup at the boundary, so nothing downstream
 * has to know anything about messy input. Reads the CSV's real column names
 * (dob, postal_code, ...) and emits internal camelCase field names.
 *
 * Normalization never decides validity — it only cleans. A value that cleans to
 * something still-wrong (a nonsense date, a phone with no digits) is passed
 * along for the validator to reject.
 */
import type { Gender, NormalizedRow, RawRow } from "./types.js";

function clean(value: string | undefined): string {
  return (value ?? "").trim();
}

/** For optional fields: a blank source cell becomes `undefined` (truly absent). */
function optional(value: string): string | undefined {
  return value === "" ? undefined : value;
}

/**
 * Common gender spellings mapped to the canonical set. Unmapped input is passed
 * through lowercased so the validator rejects it (rather than being coerced to
 * a wrong-but-valid value).
 */
const GENDER_MAP: Record<string, Gender> = {
  male: "male",
  m: "male",
  female: "female",
  f: "female",
  other: "other",
  o: "other",
  unknown: "unknown",
  u: "unknown",
  unk: "unknown",
};

function normalizeGender(raw: string): string {
  const lowered = clean(raw).toLowerCase();
  return GENDER_MAP[lowered] ?? lowered;
}

/**
 * Strip formatting to bare digits; drop a leading US country code so an
 * 11-digit "1..." number becomes the 10-digit local number.
 *
 * Returns `undefined` only when the source cell was blank. A non-blank cell with
 * no usable digits ("call me") returns "" — present but invalid — so validation
 * flags it instead of mistaking junk for "no phone provided".
 */
function normalizePhone(raw: string): string | undefined {
  const trimmed = clean(raw);
  if (trimmed === "") return undefined;
  const digits = trimmed.replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

/**
 * Accepted input date formats, in priority order. ISO-only for now, which
 * matches the current feed; when a real source's format is known (e.g. US
 * MM/DD/YYYY), add a parser to this list. Anything unrecognized is returned
 * unchanged for the validator to reject — we never guess ambiguous dates.
 */
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function coerceDate(raw: string): string {
  const trimmed = clean(raw);
  if (ISO_DATE.test(trimmed)) return trimmed;
  // Additional format coercions go here (e.g. MM/DD/YYYY -> ISO).
  return trimmed;
}

export function normalizeRow(raw: RawRow): NormalizedRow {
  const state = clean(raw.state).toUpperCase();
  const zip = clean(raw.postal_code).replace(/\D/g, "");

  return {
    mrn: clean(raw.mrn).replace(/[^A-Za-z0-9]/g, ""),
    firstName: clean(raw.first_name),
    lastName: clean(raw.last_name),
    dateOfBirth: coerceDate(raw.dob ?? ""),
    gender: normalizeGender(raw.gender ?? ""),
    phone: normalizePhone(raw.phone ?? ""),
    email: optional(clean(raw.email).toLowerCase()),
    addressLine: optional(clean(raw.address_line)),
    city: optional(clean(raw.city)),
    state: optional(state),
    zip: optional(zip),
  };
}
