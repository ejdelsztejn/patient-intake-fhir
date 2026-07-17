/**
 * Stage 3: validate. A normalized row -> the list of everything wrong with it
 * (empty list == valid). Each row is checked independently and exhaustively:
 * one bad row never halts the run, and a row with multiple problems reports all
 * of them.
 */
import { FIELD_RULES, STATE_PATTERN, ZIP_PATTERN } from "./schema.js";
import type { NormalizedRow, ValidationError } from "./types.js";

/**
 * Cross-field address rule: address_line/city/state/zip are individually
 * optional, but once *any* of them is present the row is claiming to have an
 * address, so state and zip must be present and well-formed to be usable.
 */
function validateAddress(row: NormalizedRow): ValidationError[] {
  const present =
    row.addressLine !== undefined ||
    row.city !== undefined ||
    row.state !== undefined ||
    row.zip !== undefined;
  if (!present) return [];

  const errors: ValidationError[] = [];

  if (row.state === undefined) {
    errors.push({ field: "state", message: "state is required when an address is provided" });
  } else if (!STATE_PATTERN.test(row.state)) {
    errors.push({ field: "state", message: "state must be a 2-letter code" });
  }

  if (row.zip === undefined) {
    errors.push({ field: "zip", message: "zip is required when an address is provided" });
  } else if (!ZIP_PATTERN.test(row.zip)) {
    errors.push({ field: "zip", message: "zip must be 5 or 9 digits" });
  }

  return errors;
}

export function validateRow(row: NormalizedRow): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const rule of FIELD_RULES) {
    const value = row[rule.field];

    if (rule.required) {
      if (value === undefined || value === "") {
        errors.push({ field: rule.field, message: `${rule.label} is required` });
        continue;
      }
    } else if (value === undefined) {
      // Optional and absent — nothing to check. (A present-but-junk value like a
      // phone that stripped to "" is not undefined, so it still gets checked.)
      continue;
    }

    for (const check of rule.checks) {
      if (!check.test(value)) {
        errors.push({ field: rule.field, message: check.message });
      }
    }
  }

  errors.push(...validateAddress(row));

  return errors;
}
