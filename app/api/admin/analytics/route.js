import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/admin";
import { getAdminOverview } from "@/lib/admin-overview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const auth = await requireStaff(request, ["superAdmin", "helpAdmin"]);
    if (auth.response) return auth.response;
    return NextResponse.json(await getAdminOverview(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("Loading admin analytics failed:", error);
    return NextResponse.json({ error: "Analytics are temporarily unavailable." }, { status: 500 });
  }
}
