import SftpClient from "ssh2-sftp-client";
import { config } from "../config.js";

export interface RemoteFile {
  name: string;
  size: number;
  modifiedAt: Date;
}

/**
 * Thin wrapper around ssh2-sftp-client scoped to the clinic drop directory.
 * Open a connection, do the work, always close it in a finally block.
 */
export async function withSftp<T>(fn: (sftp: SftpClient) => Promise<T>): Promise<T> {
  const sftp = new SftpClient();
  await sftp.connect({
    host: config.sftp.host,
    port: config.sftp.port,
    username: config.sftp.username,
    password: config.sftp.password,
  });
  try {
    return await fn(sftp);
  } finally {
    await sftp.end();
  }
}

/** List CSV files sitting in the clinic drop directory, newest last. */
export async function listIntakeFiles(sftp: SftpClient): Promise<RemoteFile[]> {
  const entries = await sftp.list(config.sftp.remoteDir);
  return entries
    .filter((e) => e.type === "-" && e.name.toLowerCase().endsWith(".csv"))
    .map((e) => ({ name: e.name, size: e.size, modifiedAt: new Date(e.modifyTime) }))
    .sort((a, b) => a.modifiedAt.getTime() - b.modifiedAt.getTime());
}

/** Download a file's contents as UTF-8 text. */
export async function downloadIntakeFile(sftp: SftpClient, name: string): Promise<string> {
  const remotePath = `${config.sftp.remoteDir.replace(/\/$/, "")}/${name}`;
  const buffer = (await sftp.get(remotePath)) as Buffer;
  return buffer.toString("utf-8");
}
