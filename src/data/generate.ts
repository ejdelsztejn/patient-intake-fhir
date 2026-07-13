/**
 * Generate a synthetic nightly intake CSV and drop it into the local SFTP
 * folder (./sftp/upload, mounted into the atmoz/sftp container).
 *
 * SYNTHETIC DATA ONLY. Every value here is fabricated by faker — nothing in
 * this pipeline should ever touch anything resembling real PHI.
 *
 *   npm run generate            # ~20 clean-ish rows
 *   npm run generate -- 50      # custom row count
 *
 * A handful of rows are intentionally messy (missing fields, bad dates,
 * duplicate ids) so the validation + dedup milestones have something to chew on.
 */
import { faker } from "@faker-js/faker";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HEADERS = [
  "mrn",
  "first_name",
  "last_name",
  "dob",
  "gender",
  "phone",
  "email",
  "address_line",
  "city",
  "state",
  "postal_code",
] as const;

type Row = Record<(typeof HEADERS)[number], string>;

function cleanRow(): Row {
  const sex = faker.helpers.arrayElement(["male", "female"] as const);
  return {
    mrn: `MRN-${faker.string.numeric(6)}`,
    first_name: faker.person.firstName(sex),
    last_name: faker.person.lastName(),
    dob: faker.date.birthdate({ min: 1, max: 95, mode: "age" }).toISOString().slice(0, 10),
    gender: faker.helpers.arrayElement([sex, sex, "other", "unknown"]),
    phone: faker.phone.number({ style: "national" }),
    email: faker.internet.email().toLowerCase(),
    address_line: faker.location.streetAddress(),
    city: faker.location.city(),
    state: faker.location.state({ abbreviated: true }),
    postal_code: faker.location.zipCode("#####"),
  };
}

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function toCsv(rows: Row[]): string {
  const lines = [HEADERS.join(",")];
  for (const row of rows) {
    lines.push(HEADERS.map((h) => csvEscape(row[h] ?? "")).join(","));
  }
  return lines.join("\n") + "\n";
}

function main(): void {
  const count = Number(process.argv[2] ?? 20);
  faker.seed(Date.now() % 100000);

  const rows: Row[] = Array.from({ length: count }, cleanRow);

  // Inject deliberate edge cases for downstream validation to catch.
  if (rows.length >= 5) {
    rows[1] = { ...rows[1]!, dob: "1988-13-45" }; // impossible date
    rows[2] = { ...rows[2]!, first_name: "", last_name: "" }; // missing name
    rows[3] = { ...rows[3]!, email: "not-an-email", phone: "call me" }; // junk contact
    rows[4] = { ...rows[0]! }; // exact duplicate of row 0 (same MRN)
  }

  const csv = toCsv(rows);
  const here = dirname(fileURLToPath(import.meta.url));
  const uploadDir = join(here, "..", "..", "sftp", "upload");
  mkdirSync(uploadDir, { recursive: true });

  const stamp = new Date().toISOString().slice(0, 10);
  const file = join(uploadDir, `intake_${stamp}.csv`);
  writeFileSync(file, csv, "utf-8");

  console.log(`Wrote ${rows.length} rows -> ${file}`);
  console.log("(includes intentional edge cases: bad date, missing name, junk contact, duplicate MRN)");
}

main();
