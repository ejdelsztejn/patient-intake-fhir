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

## Architecture

```
  clinic (nightly)                 this pipeline
 ┌──────────────┐   SFTP    ┌──────────────────────────────────────────────┐
 │ intake_*.csv │ ───────►  │ pickup → parse → validate → map(FHIR) → POST  │
 └──────────────┘           └──────────────────────────────────────────────┘
                                                                    │
                                                                    ▼
                                                      HAPI FHIR R4 sandbox
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
- [ ] **4 — Post + idempotency.** Conditional create keyed on MRN so re-runs don't duplicate.
- [ ] **5 — Run report.** Each run logs processed / created / skipped / rejected counts.

## Quick start

Requires Node 20+ and Docker.

```bash
npm install
cp .env.example .env

npm run sftp:up      # start the local SFTP server (Docker)
npm run generate     # write a synthetic intake CSV into the drop folder
npm start            # connect over SFTP, list + preview the newest file
```

Poke at the SFTP server directly:

```bash
sftp -P 2222 clinic@127.0.0.1     # password: clinicpass
```

Tear it down when you're done:

```bash
npm run sftp:down
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
  fhir/                map validated rows → FHIR R4 Patient resources
  index.ts             pipeline entry point
```
