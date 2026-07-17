import { describe, expect, it } from "vitest";
import { config } from "./config.js";
import { runIntake } from "./intake/index.js";
import { mapPatients } from "./fhir/index.js";

/**
 * The one integration test for the intake -> FHIR seam. It starts from raw CSV
 * text (messy on purpose: hyphenated MRN, formatted phone, upper-case email,
 * lower-case state) and asserts the complete Patient resource that comes out the
 * other end. This owns the whole-shape check — accidental extra fields, wrong
 * nesting, telecom ordering, and the dob->birthDate / gender passthrough
 * assumptions the mapper makes about normalized input all break here if they
 * drift. The mapper unit tests (fhir/patient.test.ts) cover the branches.
 */
const CSV = [
  "mrn,first_name,last_name,dob,gender,phone,email,address_line,city,state,postal_code",
  "MRN-559361,Daniel,Dickinson,1935-02-17,male,(715) 375-0038,JAMAR16@hotmail.com,96047 Jailyn Parkways,Wilhelmineside,ma,79481",
].join("\n");

describe("CSV -> FHIR pipeline", () => {
  it("maps a raw CSV row through validation into a complete FHIR R4 Patient", () => {
    const { valid, rejects } = runIntake(CSV);
    expect(rejects).toHaveLength(0);

    const patients = mapPatients(valid);
    expect(patients).toEqual([
      {
        resourceType: "Patient",
        identifier: [
          {
            type: {
              coding: [
                {
                  system: "http://terminology.hl7.org/CodeSystem/v2-0203",
                  code: "MR",
                  display: "Medical record number",
                },
              ],
            },
            system: config.fhir.mrnSystem,
            value: "MRN559361", // hyphen stripped at the boundary
          },
        ],
        name: [{ use: "official", family: "Dickinson", given: ["Daniel"] }],
        gender: "male",
        birthDate: "1935-02-17",
        telecom: [
          { system: "phone", value: "+17153750038" }, // stripped to 10 digits, emitted as E.164
          { system: "email", value: "jamar16@hotmail.com" }, // casefolded
        ],
        address: [
          {
            line: ["96047 Jailyn Parkways"],
            city: "Wilhelmineside",
            state: "MA", // upper-cased
            postalCode: "79481",
          },
        ],
      },
    ]);
  });
});
