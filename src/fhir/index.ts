/**
 * Milestone 3 FHIR mapping stage: validated intake rows -> FHIR R4 Patient
 * resources. `mapPatients` is the entry point milestone 4 (post + idempotency)
 * consumes.
 */
export type {
  Address,
  AdministrativeGender,
  CodeableConcept,
  Coding,
  ContactPoint,
  ContactPointSystem,
  HumanName,
  Identifier,
  Patient,
} from "./types.js";
export { mapPatient, mapPatients } from "./patient.js";
