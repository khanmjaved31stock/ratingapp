import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function getEncryptionKey() {
  const configured = process.env.ENCRYPTION_KEY?.trim();
  if (!configured) {
    const error = new Error("Payout encryption is not configured.");
    error.code = "ENCRYPTION_KEY_MISSING";
    throw error;
  }

  const key = Buffer.from(configured, "base64");
  if (key.length !== 32 || key.toString("base64") !== configured) {
    const error = new Error("Payout encryption configuration is invalid.");
    error.code = "ENCRYPTION_KEY_INVALID";
    throw error;
  }
  return key;
}

export function encryptJson(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptJson(value) {
  if (typeof value !== "string") {
    throw new Error("Encrypted account data is invalid.");
  }
  const [version, ivValue, tagValue, encryptedValue] = value.split(".");
  if (!version || version !== "v1" || !ivValue || !tagValue || !encryptedValue) {
    throw new Error("Encrypted account data has an unsupported format.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString("utf8"));
}
