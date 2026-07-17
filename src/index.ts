/**
 * Pipeline entry point.
 *
 * Milestone 1: connect to the clinic SFTP drop, list intake files, download the
 * newest one. Milestone 2: parse, normalize, and validate that file — valid rows
 * held in memory, invalid rows written to a rejects CSV. Milestone 3 (current):
 * map the valid rows to FHIR R4 Patient resources. Later milestones layer on the
 * idempotent post to the HAPI sandbox.
 */
import { join } from "node:path";
import { withSftp, listIntakeFiles, downloadIntakeFile } from "./sftp/client.js";
import { runIntake, writeRejectsCsv } from "./intake/index.js";
import { mapPatients } from "./fhir/index.js";
import { config } from "./config.js";

async function main(): Promise<void> {
  console.log(`Connecting to SFTP ${config.sftp.host}:${config.sftp.port} as ${config.sftp.username} ...`);

  await withSftp(async (sftp) => {
    const files = await listIntakeFiles(sftp);

    if (files.length === 0) {
      console.log(`No CSV files in ${config.sftp.remoteDir}. Run "npm run generate" first.`);
      return;
    }

    console.log(`\nFound ${files.length} intake file(s):`);
    for (const f of files) {
      console.log(`  - ${f.name}  (${f.size} bytes, modified ${f.modifiedAt.toISOString()})`);
    }

    const newest = files[files.length - 1]!;
    const contents = await downloadIntakeFile(sftp, newest.name);

    const { valid, rejects } = runIntake(contents);
    console.log(`\nParsed ${newest.name}: ${valid.length} valid, ${rejects.length} rejected.`);

    for (const row of valid.slice(0, 3)) {
      console.log(`  OK  ${row.mrn}  ${row.firstName} ${row.lastName}  ${row.dateOfBirth}  ${row.gender}`);
    }
    if (valid.length > 3) console.log(`  ... and ${valid.length - 3} more valid row(s)`);

    if (rejects.length > 0) {
      const rejectsPath = join("out", `rejects_${newest.name}`);
      writeRejectsCsv(rejects, rejectsPath);
      console.log(`\nWrote ${rejects.length} rejected row(s) -> ${rejectsPath}`);
      for (const reject of rejects.slice(0, 3)) {
        console.log(`  REJECT row ${reject.rowNumber} (${reject.mrn || "no mrn"}): ${reject.errors}`);
      }
    }

    const patients = mapPatients(valid);
    console.log(`\nMapped ${patients.length} FHIR R4 Patient resource(s).`);
    if (patients[0]) {
      console.log("Sample resource:");
      console.log(JSON.stringify(patients[0], null, 2));
    }
  });

  console.log("\nFHIR mapping OK. Next milestone: idempotent post to the HAPI sandbox.");
}

main().catch((err) => {
  console.error("Pipeline failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
