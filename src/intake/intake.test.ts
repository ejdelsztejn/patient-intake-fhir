import { describe, expect, it } from "vitest";
import { normalizeRow } from "./normalize.js";
import { validateRow } from "./validate.js";
import { runIntake } from "./process.js";
import { serializeRejects } from "./rejects.js";
import type { RawRow } from "./types.js";

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

/** A clean baseline row; override individual fields per test. */
function rawRow(overrides: Partial<RawRow> = {}): RawRow {
  return {
    mrn: "MRN-559361",
    first_name: "Daniel",
    last_name: "Dickinson",
    dob: "1935-02-17",
    gender: "male",
    phone: "(715) 375-0038",
    email: "JAMAR16@hotmail.com",
    address_line: "96047 Jailyn Parkways",
    city: "Wilhelmineside",
    state: "ma",
    postal_code: "79481",
    ...overrides,
  };
}

function errorsFor(overrides: Partial<RawRow> = {}): string[] {
  return validateRow(normalizeRow(rawRow(overrides))).map((e) => e.message);
}

function toCsv(rows: RawRow[]): string {
  const lines = [HEADERS.join(",")];
  for (const row of rows) lines.push(HEADERS.map((h) => row[h] ?? "").join(","));
  return lines.join("\n") + "\n";
}

describe("normalize", () => {
  it("cleans fields at the boundary", () => {
    const n = normalizeRow(rawRow());
    expect(n.mrn).toBe("MRN559361"); // hyphen stripped
    expect(n.phone).toBe("7153750038"); // formatting stripped
    expect(n.email).toBe("jamar16@hotmail.com"); // casefolded
    expect(n.state).toBe("MA"); // upper-cased
  });

  it("trims whitespace and drops a leading US country code from phone", () => {
    const n = normalizeRow(rawRow({ first_name: "  Daniel  ", phone: "1 (715) 375-0038" }));
    expect(n.firstName).toBe("Daniel");
    expect(n.phone).toBe("7153750038");
  });

  it("maps common gender spellings to the canonical set", () => {
    expect(normalizeRow(rawRow({ gender: "F" })).gender).toBe("female");
    expect(normalizeRow(rawRow({ gender: "Male" })).gender).toBe("male");
    expect(normalizeRow(rawRow({ gender: "xyz" })).gender).toBe("xyz"); // passed through to fail validation
  });

  it("distinguishes an absent phone from present-but-junk", () => {
    expect(normalizeRow(rawRow({ phone: "" })).phone).toBeUndefined();
    expect(normalizeRow(rawRow({ phone: "call me" })).phone).toBe(""); // present, no digits
  });

  it("treats blank optional cells as absent", () => {
    const n = normalizeRow(rawRow({ email: "", address_line: "", city: "", state: "", postal_code: "" }));
    expect(n.email).toBeUndefined();
    expect(n.state).toBeUndefined();
    expect(n.zip).toBeUndefined();
  });
});

describe("validate", () => {
  it("accepts a clean row", () => {
    expect(errorsFor()).toEqual([]);
  });

  it("accepts a hyphenated MRN once normalized (9 alphanumeric chars)", () => {
    expect(errorsFor({ mrn: "MRN-559361" })).toEqual([]);
  });

  it("rejects MRNs outside 6-10 alphanumeric chars", () => {
    expect(errorsFor({ mrn: "AB1" })).toContain("mrn must be 6-10 alphanumeric characters");
    expect(errorsFor({ mrn: "ABCDEFGHIJK1" })).toContain("mrn must be 6-10 alphanumeric characters");
  });

  it("requires mrn, first_name, last_name, dob, gender", () => {
    const errors = errorsFor({ mrn: "", first_name: "", last_name: "", dob: "", gender: "" });
    expect(errors).toEqual(
      expect.arrayContaining([
        "mrn is required",
        "first_name is required",
        "last_name is required",
        "date_of_birth is required",
        "gender is required",
      ]),
    );
  });

  it("reports one clear error for an impossible date, not a cascade", () => {
    const errors = errorsFor({ dob: "1988-13-45" });
    expect(errors).toEqual(["date_of_birth must be a valid YYYY-MM-DD date"]);
  });

  it("rejects future and pre-1900 dates", () => {
    expect(errorsFor({ dob: "2999-01-01" })).toContain("date_of_birth cannot be in the future");
    expect(errorsFor({ dob: "1899-12-31" })).toContain("date_of_birth cannot be before 1900");
  });

  it("rejects an unmappable gender", () => {
    expect(errorsFor({ gender: "xyz" })).toContain(
      "gender must be one of male, female, other, unknown",
    );
  });

  it("treats phone/email as optional but validates them when present", () => {
    expect(errorsFor({ phone: "", email: "" })).toEqual([]);
    expect(errorsFor({ phone: "call me" })).toContain(
      "phone must be 10 digits after removing formatting",
    );
    expect(errorsFor({ email: "not-an-email" })).toContain("email is not a valid email address");
  });

  it("requires state and zip once any address field is present", () => {
    const errors = errorsFor({ state: "", postal_code: "" });
    expect(errors).toEqual(
      expect.arrayContaining([
        "state is required when an address is provided",
        "zip is required when an address is provided",
      ]),
    );
  });

  it("accepts a 9-digit zip and rejects malformed state/zip", () => {
    expect(errorsFor({ postal_code: "79481-1234" })).toEqual([]); // 9 digits after stripping
    expect(errorsFor({ state: "Massachusetts" })).toContain("state must be a 2-letter code");
    expect(errorsFor({ postal_code: "7948" })).toContain("zip must be 5 or 9 digits");
  });

  it("reports every problem on a multi-error row", () => {
    const errors = errorsFor({ mrn: "ab1", email: "nope", gender: "zzz" });
    expect(errors).toEqual(
      expect.arrayContaining([
        "mrn must be 6-10 alphanumeric characters",
        "email is not a valid email address",
        "gender must be one of male, female, other, unknown",
      ]),
    );
  });
});

describe("runIntake", () => {
  it("splits valid rows from rejects and never halts on a bad row", () => {
    const csv = toCsv([
      rawRow(),
      rawRow({ mrn: "MRN-100002", dob: "1988-13-45" }), // bad date
      rawRow({ mrn: "MRN-100003", first_name: "", last_name: "" }), // missing name
      rawRow({ mrn: "MRN-100004" }), // clean
    ]);
    const { valid, rejects } = runIntake(csv);
    expect(valid).toHaveLength(2);
    expect(rejects).toHaveLength(2);
    expect(rejects.map((r) => r.rowNumber)).toEqual([2, 3]);
  });

  it("produces a fully typed, cleaned PatientRow for valid input", () => {
    const { valid } = runIntake(toCsv([rawRow()]));
    expect(valid[0]).toEqual({
      mrn: "MRN559361",
      firstName: "Daniel",
      lastName: "Dickinson",
      dateOfBirth: "1935-02-17",
      gender: "male",
      phone: "7153750038",
      email: "jamar16@hotmail.com",
      address: {
        line: "96047 Jailyn Parkways",
        city: "Wilhelmineside",
        state: "MA",
        zip: "79481",
      },
    });
  });

  it("captures row_number, best-effort mrn, joined errors, and raw_data", () => {
    const { rejects } = runIntake(toCsv([rawRow({ mrn: "MRN-100002", email: "nope", phone: "call me" })]));
    expect(rejects).toHaveLength(1);
    const reject = rejects[0]!;
    expect(reject.rowNumber).toBe(1);
    expect(reject.mrn).toBe("MRN100002");
    expect(reject.errors).toBe(
      "phone must be 10 digits after removing formatting; email is not a valid email address",
    );
    expect(JSON.parse(reject.rawData).email).toBe("nope"); // original preserved
  });

  it("rejects a short/malformed row rather than throwing", () => {
    const csv =
      HEADERS.join(",") + "\nMRN-100005,Only,Two\n"; // far fewer columns than the header
    const { valid, rejects } = runIntake(csv);
    expect(valid).toHaveLength(0);
    expect(rejects).toHaveLength(1);
  });
});

describe("serializeRejects", () => {
  it("escapes commas and quotes in the raw_data JSON blob", () => {
    const csv = serializeRejects([
      { rowNumber: 2, mrn: "MRN100002", errors: "a; b", rawData: '{"city":"Reston, VA"}' },
    ]);
    const [header, row] = csv.trimEnd().split("\n");
    expect(header).toBe("row_number,mrn,errors,raw_data");
    // JSON blob contains a comma and quotes, so it must be wrapped and quotes doubled.
    expect(row).toBe('2,MRN100002,a; b,"{""city"":""Reston, VA""}"');
  });
});
