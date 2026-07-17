/**
 * Minimal CSV serialization helpers shared across the pipeline (intake rejects,
 * synthetic data generation). Parsing is handled by csv-parse; this covers the
 * write side, where the rules are simple enough not to warrant a dependency.
 */

/** Quote a field if it contains a comma, quote, or newline; double interior quotes. */
export function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
