import { NextResponse } from "next/server";
import { getActiveRequestUser } from "@/lib/request-auth";
import { hasRequiredRole } from "@/lib/role-permissions";

export async function requireStaff(request, requiredRoles) {
  const auth = await getActiveRequestUser(request);
  if (!auth || !hasRequiredRole(auth.session.role, requiredRoles)) {
    return {
      response: NextResponse.json({ error: "Unauthorized." }, { status: 401 }),
    };
  }

  return auth;
}

export async function requireAdmin(request, requiredRole) {
  return requireStaff(request, [requiredRole]);
}
