import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") {
    throw new Error(`Missing required env var: ${name} (copy .env.example to .env)`);
  }
  return value;
}

export const config = {
  sftp: {
    host: required("SFTP_HOST", "127.0.0.1"),
    port: Number(required("SFTP_PORT", "2222")),
    username: required("SFTP_USER", "clinic"),
    password: required("SFTP_PASSWORD", "clinicpass"),
    remoteDir: required("SFTP_REMOTE_DIR", "/upload"),
  },
  fhir: {
    baseUrl: required("FHIR_BASE_URL", "https://hapi.fhir.org/baseR4"),
  },
} as const;
