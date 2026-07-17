import { describe, expect, it } from "vitest";
import { config } from "../config.js";
import type { PatientRow } from "../intake/index.js";
import { mapPatient, mapPatients } from "./patient.js";

function patientRow(overrides: Partial<PatientRow> = {}): PatientRow {
  return {
    mrn: "MRN559361",
    firstName: "Daniel",
    lastName: "Dickinson",
    dateOfBirth: "1935-02-17",
    gender: "male",
    phone: "7153750038",
    email: "jamar16@hotmail.com",
    address: { line: "96047 Jailyn Parkways", city: "Wilhelmineside", state: "MA", zip: "79481" },
    ...overrides,
  };
}

// The complete-shape assertion (identifier typing, ordering, no surprise fields)
// lives in the CSV->FHIR integration test in pipeline.test.ts. These units cover
// the individual mapping decisions and give precise failure messages.
describe("mapPatient", () => {
  it("uses the MRN as the identifier value under the configured system", () => {
    const patient = mapPatient(patientRow({ mrn: "ABC123" }));
    expect(patient.identifier?.[0]?.system).toBe(config.fhir.mrnSystem);
    expect(patient.identifier?.[0]?.value).toBe("ABC123");
  });

  it("passes gender straight through to the FHIR administrative-gender code", () => {
    for (const gender of ["male", "female", "other", "unknown"] as const) {
      expect(mapPatient(patientRow({ gender })).gender).toBe(gender);
    }
  });

  it("omits telecom entirely when neither phone nor email is present", () => {
    const patient = mapPatient(patientRow({ phone: undefined, email: undefined }));
    expect(patient.telecom).toBeUndefined();
  });

  it("includes only the contact points that are present", () => {
    expect(mapPatient(patientRow({ email: undefined })).telecom).toEqual([
      { system: "phone", value: "+17153750038" }, // E.164
    ]);
    expect(mapPatient(patientRow({ phone: undefined })).telecom).toEqual([
      { system: "email", value: "jamar16@hotmail.com" },
    ]);
  });

  it("omits address entirely when absent", () => {
    const patient = mapPatient(patientRow({ address: undefined }));
    expect(patient.address).toBeUndefined();
  });

  it("maps only the address sub-fields that are present", () => {
    const patient = mapPatient(patientRow({ address: { state: "NY", zip: "10001" } }));
    expect(patient.address).toEqual([{ state: "NY", postalCode: "10001" }]);
  });
});

describe("mapPatients", () => {
  it("maps each row to a Patient, preserving order", () => {
    const patients = mapPatients([
      patientRow({ mrn: "A11111" }),
      patientRow({ mrn: "B22222" }),
    ]);
    expect(patients.map((p) => p.identifier?.[0]?.value)).toEqual(["A11111", "B22222"]);
    expect(patients.every((p) => p.resourceType === "Patient")).toBe(true);
  });

  it("returns an empty array for no input", () => {
    expect(mapPatients([])).toEqual([]);
  });
});
