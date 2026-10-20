import { NextResponse } from "next/server";
import { readSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { isSameOriginRequest } from "@/lib/request";
import connectDB from "@/lib/mongodb";
import ActiveSession from "@/models/ActiveSession";

export async function POST(request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  try {
    const session = await readSessionToken(
      request.cookies.get(SESSION_COOKIE)?.value,
    );
    if (session) {
      await connectDB();
      await ActiveSession.updateOne(
        { jti: session.jti, userId: session.id, revokedAt: null },
        { $set: { revokedAt: new Date() } },
      );
    }
  } catch (error) {
    console.error("Revoking sign-in session failed:", error?.name || "UnknownError");
    return NextResponse.json({ error: "Could not securely sign out." }, { status: 500 });
  }

  const response = NextResponse.json({ message: "Signed out." });
  response.cookies.set(SESSION_COOKIE, "", {
    ...sessionCookieOptions(),
    maxAge: 0,
  });
  return response;
}
