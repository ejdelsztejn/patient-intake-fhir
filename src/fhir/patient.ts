/**
 * Milestone 3: map validated intake rows to FHIR R4 Patient resources.
 *
 * Pure and total — every PatientRow that passed validation produces a well-formed
 * Patient (per our R4 subset; validation against an actual FHIR server is
 * milestone 4). The MRN becomes the resource identifier, which is what milestone 4's
 * conditional create keys on (Patient?identifier=<system>|<mrn>) to stay
 * idempotent. Optional telecom/address are omitted entirely when absent rather
 * than emitted as empty arrays.
 */
import { config } from "../config.js";
import type { PatientRow } from "../intake/index.js";
import type { Address, ContactPoint, CodeableConcept, Patient } from "./types.js";

/**
 * HL7 v2-0203 "MR" = Medical Record Number. Tags the identifier as an MRN so
 * the FHIR server (and any consumer) knows what kind of id it is.
 */
const MRN_TYPE: CodeableConcept = {
  coding: [
    {
      system: "http://terminology.hl7.org/CodeSystem/v2-0203",
      code: "MR",
      display: "Medical record number",
    },
  ],
};

/**
 * Emit phone numbers in E.164 (+17153750038), the interoperable convention, so
 * another system can dial them unambiguously. `phone` is guaranteed 10 national
 * digits by validation; we assume the US country code (+1), consistent with the
 * pipeline's other US assumptions (2-letter state, 5/9-digit ZIP).
 */
function toE164(nationalDigits: string): string {
  return `+1${nationalDigits}`;
}

export function mapPatient(row: PatientRow): Patient {
  const patient: Patient = {
    resourceType: "Patient",
    identifier: [{ type: MRN_TYPE, system: config.fhir.mrnSystem, value: row.mrn }],
    // Single-token given name: real feeds occasionally pack multiple given names
    // ("Mary Jane") into first_name, which FHIR would ideally split into
    // given: ["Mary", "Jane"]. Not handled here — a known simplification.
    name: [{ use: "official", family: row.lastName, given: [row.firstName] }],
    gender: row.gender,
    birthDate: row.dateOfBirth,
  };

  const telecom: ContactPoint[] = [];
  if (row.phone !== undefined) telecom.push({ system: "phone", value: toE164(row.phone) });
  if (row.email !== undefined) telecom.push({ system: "email", value: row.email });
  if (telecom.length > 0) patient.telecom = telecom;

  if (row.address !== undefined) {
    const address: Address = {};
    if (row.address.line !== undefined) address.line = [row.address.line];
    if (row.address.city !== undefined) address.city = row.address.city;
    if (row.address.state !== undefined) address.state = row.address.state;
    if (row.address.zip !== undefined) address.postalCode = row.address.zip;
    patient.address = [address];
  }

  return patient;
}

export function mapPatients(rows: PatientRow[]): Patient[] {
  return rows.map(mapPatient);
}
