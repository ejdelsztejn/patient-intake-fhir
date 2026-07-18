/**
 * Pipeline entry point.
 *
 * Milestone 1: connect to the clinic SFTP drop, list intake files, download the
 * newest one. Milestone 2: parse, normalize, and validate that file — valid rows
 * held in memory, invalid rows written to a rejects CSV. Milestone 3: map the
 * valid rows to FHIR R4 Patient resources. Milestone 4: idempotently post them
 * via conditional create — opt-in with --post. Milestone 5 (current): close each
 * run with a processed/valid/rejected/created/skipped/failed report.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { withSftp, listIntakeFiles, downloadIntakeFile } from "./sftp/client.js";
import { runIntake, writeRejectsCsv } from "./intake/index.js";
import { mapPatients, postPatients } from "./fhir/index.js";
import type { PostSummary } from "./fhir/index.js";
import { buildRunReport, formatRunReport } from "./report.js";
import { config } from "./config.js";

async function main(): Promise<void> {
  console.log(`Connecting to SFTP ${config.sftp.host}:${config.sftp.port} as ${config.sftp.username} ...`);

  const hadPostFailures = await withSftp(async (sftp) => {
    const files = await listIntakeFiles(sftp);

    if (files.length === 0) {
      // Still leave a report: "job ran, nothing arrived" must be distinguishable
      // from "job didn't run" for anything watching for a nightly artifact.
      console.log(`No CSV files in ${config.sftp.remoteDir}. Run "npm run generate" first.`);
      const report = buildRunReport(null, { valid: [], rejects: [] });
      const reportPath = join("out", "report_no-intake.json");
      mkdirSync("out", { recursive: true });
      writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf-8");
      console.log(`\n${formatRunReport(report)}`);
      console.log(`\nReport written -> ${reportPath}`);
      return false;
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

    let summary: PostSummary | undefined;
    if (process.argv.includes("--post")) {
      console.log(`\nPosting to ${config.fhir.baseUrl} (conditional create on MRN) ...`);
      summary = await postPatients(patients);
      for (const r of summary.results.filter((x) => x.outcome === "created").slice(0, 3)) {
        console.log(`  CREATED ${r.mrn} -> Patient/${r.resourceId ?? "?"}`);
      }
      for (const r of summary.results.filter((x) => x.outcome === "failed").slice(0, 5)) {
        console.log(`  FAIL ${r.mrn}: ${r.error}`);
      }
    } else {
      console.log(`Dry run — pass --post to write to ${config.fhir.baseUrl}.`);
    }

    // Close the run with the report — always, dry run or posted alike.
    const report = buildRunReport(newest.name, { valid, rejects }, summary);
    const reportPath = join("out", `report_${newest.name.replace(/\.csv$/i, "")}.json`);
    mkdirSync("out", { recursive: true });
    writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf-8");

    console.log(`\n${formatRunReport(report)}`);
    console.log(`\nReport written -> ${reportPath}`);

    return (summary?.failed ?? 0) > 0;
  });

  if (hadPostFailures) {
    console.error("\nSome resources failed to post — exiting non-zero.");
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Pipeline failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
