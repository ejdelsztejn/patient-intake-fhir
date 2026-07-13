/**
 * Pipeline entry point.
 *
 * Milestone 1 (current): connect to the clinic SFTP drop, list intake files,
 * and preview the newest one. Later milestones layer on parse/validate ->
 * FHIR mapping -> idempotent post to the HAPI sandbox.
 */
import { withSftp, listIntakeFiles, downloadIntakeFile } from "./sftp/client.js";
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
    const preview = contents.split("\n").slice(0, 4).join("\n");
    console.log(`\nPreview of ${newest.name}:\n${preview}`);
  });

  console.log("\nSFTP pickup OK. Next milestone: parse + validate.");
}

main().catch((err) => {
  console.error("Pipeline failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
