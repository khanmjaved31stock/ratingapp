import { NextResponse } from "next/server";
import { readSessionToken, SESSION_COOKIE } from "@/lib/auth";

export async function proxy(request) {
  const pathname = request.nextUrl.pathname;
  const isSuperAdminArea = pathname.startsWith("/super-admin/");
  const isHelpAdminArea = pathname.startsWith("/help-admin/");
  const isModeratorArea = pathname.startsWith("/moderator/");

  if (!isSuperAdminArea && !isHelpAdminArea && !isModeratorArea) {
    return NextResponse.next();
  }

  const session = await readSessionToken(
    request.cookies.get(SESSION_COOKIE)?.value,
  );
  const expectedRole = isSuperAdminArea
    ? "superAdmin"
    : isHelpAdminArea
      ? "helpAdmin"
      : "moderator";

  if (!session || session.role !== expectedRole) {
    const destination = new URL(
      isSuperAdminArea ? "/super-admin" : isHelpAdminArea ? "/help-admin" : "/moderator",
      request.url,
    );
    return NextResponse.redirect(destination);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/super-admin/:path+", "/help-admin/:path+", "/moderator/:path+"],
};
