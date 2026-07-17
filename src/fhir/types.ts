/**
 * A minimal, hand-rolled subset of the FHIR R4 Patient resource — only the
 * elements this pipeline actually populates. Kept deliberately small (over the
 * full @types/fhir surface) so the shape we emit is visible at a glance; every
 * field here maps to something in the intake data.
 *
 * Spec: https://hl7.org/fhir/R4/patient.html
 */

export type AdministrativeGender = "male" | "female" | "other" | "unknown";

export interface Coding {
  system?: string;
  code?: string;
  display?: string;
}

export interface CodeableConcept {
  coding?: Coding[];
  text?: string;
}

export interface Identifier {
  use?: "usual" | "official" | "temp" | "secondary" | "old";
  type?: CodeableConcept;
  system?: string;
  value?: string;
}

export interface HumanName {
  use?: "usual" | "official" | "temp" | "nickname" | "anonymous" | "old" | "maiden";
  family?: string;
  given?: string[];
}

export type ContactPointSystem = "phone" | "fax" | "email" | "pager" | "url" | "sms" | "other";

export interface ContactPoint {
  system?: ContactPointSystem;
  value?: string;
  use?: "home" | "work" | "temp" | "old" | "mobile";
}

export interface Address {
  use?: "home" | "work" | "temp" | "old" | "billing";
  line?: string[];
  city?: string;
  state?: string;
  postalCode?: string;
}

export interface Patient {
  resourceType: "Patient";
  identifier?: Identifier[];
  name?: HumanName[];
  gender?: AdministrativeGender;
  birthDate?: string;
  telecom?: ContactPoint[];
  address?: Address[];
}
