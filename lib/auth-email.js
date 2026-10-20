import { createHmac, timingSafeEqual } from "node:crypto";
import nodemailer from "nodemailer";

export function isEmailDeliveryConfigured() {
  return Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASSWORD &&
    process.env.SMTP_FROM,
  );
}

export function hashEmailCode(userId, code) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must be configured.");
  return createHmac("sha256", secret).update(`${userId}:${code}`).digest("hex");
}

export function matchesEmailCode(expectedHash, userId, code) {
  const expected = Buffer.from(expectedHash, "hex");
  const supplied = Buffer.from(hashEmailCode(userId, code), "hex");
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export async function sendAccountEmail({ to, subject, text }) {
  if (!isEmailDeliveryConfigured()) throw new Error("Email delivery is not configured.");
  const port = Number(process.env.SMTP_PORT || 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("SMTP_PORT must be a valid port number.");
  }
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  });
  await transport.sendMail({ from: process.env.SMTP_FROM, to, subject, text });
}
