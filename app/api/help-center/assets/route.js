import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import { requireAdmin } from "@/lib/admin";
import { privateRawUrl } from "@/lib/cloudinary";
import { canAccessGuideAsset, isSafeHelpPdf } from "@/lib/help-center";
import HelpGuide from "@/models/HelpGuide";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PDF_BYTES = 8 * 1024 * 1024;

function safeDownloadName(value) {
  const safe = typeof value === "string"
    ? value.normalize("NFKC").replace(/[^A-Za-z0-9._-]/g, "-").replace(/^\.+/, "").slice(-120)
    : "";
  return safe.toLowerCase().endsWith(".pdf") ? safe : "help-guide.pdf";
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const slug = url.searchParams.get("slug") || "";
    const publicId = url.searchParams.get("publicId") || "";
    if (
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
      !/^ratewell\/help-center\/files\/[A-Za-z0-9_-]{12,80}\.pdf$/.test(publicId)
    ) return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
    await connectDB();
    const guide = await HelpGuide.findOne({ slug, "attachments.publicId": publicId }).lean();
    if (!guide) return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
    if (!canAccessGuideAsset(guide, "")) {
      const auth = await requireAdmin(request, "superAdmin");
      if (auth.response) return auth.response;
      if (!canAccessGuideAsset(guide, auth.user.role)) {
        return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
      }
    }
    const attachment = guide.attachments.find((item) => item.publicId === publicId);
    if (!attachment || attachment.sizeBytes > MAX_PDF_BYTES) {
      return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
    }
    const remote = await fetch(privateRawUrl(publicId, Math.floor(Date.now() / 1000) + 60), {
      cache: "no-store",
      redirect: "error",
    });
    if (!remote.ok) throw new Error("Private file provider returned an unavailable response.");
    const declaredLength = Number(remote.headers.get("content-length") || 0);
    if (declaredLength > MAX_PDF_BYTES) {
      return NextResponse.json({ error: "Attachment is larger than the supported size." }, { status: 413 });
    }
    if (!remote.body) throw new Error("Private file provider returned an empty response.");
    const reader = remote.body.getReader();
    const chunks = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_PDF_BYTES) {
        await reader.cancel();
        return NextResponse.json({ error: "Attachment is larger than the supported size." }, { status: 413 });
      }
      chunks.push(Buffer.from(value));
    }
    const bytes = Buffer.concat(chunks, totalBytes);
    if (!isSafeHelpPdf(bytes)) {
      return NextResponse.json({ error: "Attachment is not a supported PDF." }, { status: 415 });
    }
    return new Response(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(bytes.length),
        "Content-Disposition": `attachment; filename="${safeDownloadName(attachment.filename)}"`,
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Content-Security-Policy": "sandbox; default-src 'none'",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Downloading Help Center attachment failed:", error?.name || "UnknownError");
    return NextResponse.json({ error: "Could not download this attachment." }, { status: 500 });
  }
}
