import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { writeAdminAudit } from "@/lib/audit";
import { formatContactCsvRow } from "@/lib/contact-export";
import User from "@/models/User";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const auth = await requireAdmin(request, "superAdmin");
    if (auth.response) return auth.response;

    const filter = { role: "user", deletedAt: null };
    const recordCount = await User.countDocuments(filter);
    await writeAdminAudit(request, auth, "user.contact-exported", {
      type: "User",
      metadata: {
        recordCount,
        fields: ["name", "email", "whatsappPhone"],
        format: "csv",
      },
    });

    const cursor = User.find(filter)
      .select("name email whatsappPhone")
      .sort({ _id: 1 })
      .lean()
      .cursor();
    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(new TextEncoder().encode(formatContactCsvRow(["Name", "Email", "WhatsApp phone"])));
        try {
          for await (const user of cursor) {
            controller.enqueue(new TextEncoder().encode(formatContactCsvRow([
              user.name,
              user.email,
              user.whatsappPhone || "",
            ])));
          }
          controller.close();
        } catch (error) {
          console.error("Streaming user contact export failed:", error?.name || "UnknownError");
          controller.error(new Error("Could not complete the user contact export."));
        } finally {
          await cursor.close();
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="ratewell-user-contacts.csv"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Preparing user contact export failed:", error?.name || "UnknownError");
    return NextResponse.json({ error: "Could not export user contacts." }, { status: 500 });
  }
}
