import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

/**
 * AES-256-GCM for calendar links. A private ICS link is effectively a password to your calendar,
 * so it is encrypted with a server-only key before it reaches the database.
 */
function key(): Buffer {
  const raw = process.env.ICS_ENCRYPTION_KEY;
  if (!raw) throw new Error("ICS_ENCRYPTION_KEY is not set");
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("ICS_ENCRYPTION_KEY must be 32 bytes, base64-encoded (npm run gen:key)");
  return buf;
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64")}.${tag.toString("base64")}.${data.toString("base64")}`;
}

export function decrypt(payload: string): string {
  const [v, iv, tag, data] = payload.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Unknown ciphertext format");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}
