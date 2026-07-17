/**
 * The validation schema, expressed as data the validator interprets (rather than
 * inline if-statements). Each field rule is a `required` flag plus a list of
 * checks; the validator runs *every* check and collects *all* failures, so a row
 * with several problems reports them all.
 *
 * Simple per-field rules live here. The cross-field address rule (state/zip are
 * conditionally required when any address field is present) doesn't fit a
 * per-field table cleanly, so it lives as an explicit block in validate.ts.
 */
import type { NormalizedRow } from "./types.js";

const GENDERS = new Set(["male", "female", "other", "unknown"]);
const MRN_PATTERN = /^[A-Za-z0-9]{6,10}$/;
const PHONE_PATTERN = /^\d{10}$/;
// Deliberately basic per the schema: something@something.something, no spaces.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const MIN_DATE = Date.UTC(1900, 0, 1);

/**
 * Parse an ISO date, returning null unless it is a real calendar date. Catches
 * impossible dates like 1988-13-45, whose components don't survive the round
 * trip through Date.
 */
export function parseIsoDate(value: string): number | null {
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = Date.UTC(year, month - 1, day);
  const date = new Date(utc);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return utc;
}

/** Today at UTC midnight, so a DOB of today counts as valid (not "in future"). */
function todayUtc(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

export interface FieldCheck {
  test: (value: string) => boolean;
  message: string;
}

export interface FieldRule {
  field: keyof NormalizedRow;
  label: string; // source-facing name, used in "<label> is required" messages
  required: boolean;
  checks: FieldCheck[];
}

export const FIELD_RULES: FieldRule[] = [
  {
    field: "mrn",
    label: "mrn",
    required: true,
    checks: [
      { test: (v) => MRN_PATTERN.test(v), message: "mrn must be 6-10 alphanumeric characters" },
    ],
  },
  { field: "firstName", label: "first_name", required: true, checks: [] },
  { field: "lastName", label: "last_name", required: true, checks: [] },
  {
    field: "dateOfBirth",
    label: "date_of_birth",
    required: true,
    checks: [
      // Range checks short-circuit to `true` (pass) when the date is unparseable,
      // so an impossible date reports one clear error, not a cascade.
      { test: (v) => parseIsoDate(v) !== null, message: "date_of_birth must be a valid YYYY-MM-DD date" },
      {
        test: (v) => {
          const d = parseIsoDate(v);
          return d === null || d <= todayUtc();
        },
        message: "date_of_birth cannot be in the future",
      },
      {
        test: (v) => {
          const d = parseIsoDate(v);
          return d === null || d >= MIN_DATE;
        },
        message: "date_of_birth cannot be before 1900",
      },
    ],
  },
  {
    field: "gender",
    label: "gender",
    required: true,
    checks: [
      { test: (v) => GENDERS.has(v), message: "gender must be one of male, female, other, unknown" },
    ],
  },
  {
    field: "phone",
    label: "phone",
    required: false,
    checks: [
      { test: (v) => PHONE_PATTERN.test(v), message: "phone must be 10 digits after removing formatting" },
    ],
  },
  {
    field: "email",
    label: "email",
    required: false,
    checks: [
      { test: (v) => EMAIL_PATTERN.test(v), message: "email is not a valid email address" },
    ],
  },
];

/** Address field regexes, used by the cross-field block in validate.ts. */
export const STATE_PATTERN = /^[A-Z]{2}$/;
export const ZIP_PATTERN = /^(\d{5}|\d{9})$/;
