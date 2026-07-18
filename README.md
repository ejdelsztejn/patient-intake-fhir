# patient-intake-fhir

A simulated **clinic patient-intake integration** — the bread-and-butter of a
healthcare integration platform. A clinic drops a nightly CSV of patient intake
records onto an SFTP server; this pipeline picks it up, parses and validates it,
maps each record to **FHIR R4** resources, and posts them to the public
[HAPI FHIR sandbox](https://hapi.fhir.org/baseR4).

Built in TypeScript, with Claude Code.

> **Synthetic data only, always.** Every patient in this repo is fabricated by
> [faker](https://fakerjs.dev/). The HAPI sandbox is public; nothing here ever
> touches anything resembling real PHI.

## What this demonstrates

- **SFTP file integration** — the transport clinics actually use for batch data
  drops (`ssh2-sftp-client` against a Dockerized server).
- **Defensive data mapping** — normalize at the boundary, then validate;
  malformed rows (bad dates, missing names, junk contact, duplicate IDs) route
  to a rejects file with per-field reasons instead of sinking the batch.
- **FHIR R4 modeling** — flat records → `Patient` resources with properly typed
  identifiers (HL7 v2-0203 `MR`), E.164 phone, and administrative-gender codes.
- **Idempotent writes** — conditional create keyed on the MRN identifier, so
  re-running the nightly feed never duplicates a patient.
- **Production-minded reliability** — per-record failure isolation, bounded
  retries with a request timeout on transient errors, opt-in posting to avoid
  surprise writes to a shared sandbox, and a non-zero exit code on failure so a
  scheduler can alert.
- **Types as guarantees** — validation narrows `NormalizedRow → PatientRow`, so
  downstream stages are structurally unable to see unvalidated data.
- **Tested** — 46 unit + integration tests; the network and filesystem seams are
  injected, so the suite runs offline and deterministically (`npm test`).

## Architecture

```
  clinic (nightly)                    this pipeline
 ┌──────────────┐   SFTP   ┌────────────────────────────────────────────┐
 │ intake_*.csv │ ───────► │  pickup → parse → normalize → validate      │
 └──────────────┘          └──────────────────────┬───────────┬─────────┘
                                       valid rows  │           │  invalid rows
                                                   ▼           ▼
                                          map → FHIR R4   out/rejects_*.csv
                                             Patient      (per-field reasons)
                                                   │
                                POST (idempotent   │
                                  on MRN identity) ▼
                                        HAPI FHIR R4 sandbox

  Every run closes with a report → console + out/report_*.json
```

Design principles (carried over from prior integration work): **normalize at the
boundary**, route bad records to a rejects file with reasons instead of crashing,
and make writes **idempotent** so re-running never duplicates a patient.

## Milestones

- [x] **0 — Scaffold + Docker.** Local SFTP server, TypeScript project, synthetic
      CSV generator, connection smoke test.
- [x] **1 — SFTP pickup.** List and download the nightly drop.
- [x] **2 — Parse + validate.** Normalize at the boundary; invalid rows → rejects file with reasons.
- [x] **3 — FHIR mapping.** Valid rows → FHIR R4 `Patient` (name, date, phone, gender codes).
- [x] **4 — Post + idempotency.** Conditional create keyed on MRN so re-runs don't duplicate.
- [x] **5 — Run report.** Each run logs processed / created / skipped / rejected counts.

## Quick start

Requires Node 20+ and Docker.

```bash
npm install
cp .env.example .env

npm run sftp:up      # start the local SFTP server (Docker)
npm run generate     # write a synthetic intake CSV into the drop folder
npm start            # SFTP pickup -> parse/validate -> map to FHIR (dry run)
npm start -- --post  # ...and POST to the FHIR server (idempotent conditional create)
```

`npm start` stops at mapping and previews a resource. Add `--post` to actually
write to `FHIR_BASE_URL` — conditional create keyed on the MRN identifier, so
re-runs skip patients that already exist instead of duplicating them.

Poke at the SFTP server directly:

```bash
sftp -P 2222 clinic@127.0.0.1     # password: clinicpass
```

Run the tests (offline — no server needed):

```bash
npm test         # 46 unit + integration tests
npm run typecheck
```

Tear it down when you're done:

```bash
npm run sftp:down
```

## Sample run

A dry run picks up the newest drop, validates it, and maps the good rows —
routing the deliberately-malformed ones to a rejects file with reasons:

```
$ npm start

Parsed intake_2026-07-18.csv: 17 valid, 3 rejected.

Wrote 3 rejected row(s) -> out/rejects_intake_2026-07-18.csv
  REJECT row 2 (MRN611049): date_of_birth must be a valid YYYY-MM-DD date
  REJECT row 3 (MRN803337): first_name is required; last_name is required
  REJECT row 4 (MRN176792): phone must be 10 digits after removing formatting; email is not a valid email address

Mapped 17 FHIR R4 Patient resource(s).

Run report — intake_2026-07-18.csv
  processed: 20
  valid:     17
  rejected:  3
  posted:    (dry run — not posted; pass --post to write)
```

**The idempotency guarantee.** `--post` writes to the FHIR server via a
conditional create keyed on the MRN. Post the file once, then post the *same
file* again — every create becomes a skip, and nothing is duplicated. Captured
against the live HAPI sandbox:

```
$ npm start -- --post            # first run — creates
  CREATED MRN741645 -> Patient/137198137
  ...
  created:   16
  skipped:   1                   # in-batch duplicate MRN collapsed to one Patient
  failed:    0

$ npm start -- --post            # same file again — nothing new
  created:   0
  skipped:   17                  # every patient already exists
  failed:    0
```

## Layout

```
docker-compose.yml     local atmoz/sftp server (the "clinic" drop endpoint)
sftp/upload/           drop folder, mounted into the container
src/
  config.ts            env-backed config (SFTP creds, FHIR base URL + MRN system)
  csv.ts               shared CSV escaping helper
  data/generate.ts     synthetic intake CSV generator (faker)
  sftp/client.ts       ssh2-sftp-client wrapper: list + download
  intake/              parse → normalize → validate; valid rows + rejects
  fhir/                map validated rows → FHIR R4 Patient + idempotent post
  report.ts            end-of-run summary (counts → console + out/report_*.json)
  index.ts             pipeline entry point
```
