import { randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import ActiveSession from "@/models/ActiveSession";

export const SESSION_COOKIE = "rating_portal_session";
const SESSION_DURATION_SECONDS = 60 * 60;
const REMEMBERED_SESSION_DURATION_SECONDS = 30 * 24 * 60 * 60;

function getSessionKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 characters.");
  }
  return new TextEncoder().encode(secret);
}

export async function createSession(user, { ipAddress = "", userAgent = "", rememberMe = false } = {}) {
  const durationSeconds = rememberMe
    ? REMEMBERED_SESSION_DURATION_SECONDS
    : SESSION_DURATION_SECONDS;
  const jti = randomUUID();
  const expiresAt = new Date(Date.now() + durationSeconds * 1000);
  await ActiveSession.create({
    jti,
    userId: user._id,
    ipAddress,
    userAgent,
    expiresAt,
    lastSeenAt: new Date(),
  });

  const token = await new SignJWT({
    email: user.email,
    role: user.role,
    version: user.sessionVersion || 0,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(`${durationSeconds}s`)
    .sign(getSessionKey());

  return token;
}

export async function readSessionToken(token) {
  if (!token) return null;
  const key = getSessionKey();
  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ["HS256"],
    });
    if (
      typeof payload.sub !== "string" ||
      typeof payload.jti !== "string" ||
      typeof payload.email !== "string" ||
      !Number.isInteger(payload.version) ||
      !["user", "superAdmin", "helpAdmin", "moderator"].includes(payload.role)
    ) {
      return null;
    }
    return {
      id: payload.sub,
      jti: payload.jti,
      email: payload.email,
      role: payload.role,
      version: payload.version,
    };
  } catch {
    return null;
  }
}

export async function getSession() {
  const cookieStore = await cookies();
  return readSessionToken(cookieStore.get(SESSION_COOKIE)?.value);
}

export function sessionCookieOptions(rememberMe = false) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: rememberMe ? REMEMBERED_SESSION_DURATION_SECONDS : SESSION_DURATION_SECONDS,
  };
}
