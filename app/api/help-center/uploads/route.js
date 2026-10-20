import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { writeAdminAudit } from "@/lib/audit";
import { privateImageUrl, uploadPrivateImage, uploadPrivateRaw } from "@/lib/cloudinary";
import { isSafeHelpPdf } from "@/lib/help-center";
import { isSameOriginRequest } from "@/lib/request";
import { readPaymentProof } from "@/lib/payment-proof";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PDF_BYTES = 8 * 1024 * 1024;

export async function POST(request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  let uploaded;
  try {
    const auth = await requireAdmin(request, "superAdmin");
    if (auth.response) return auth.response;
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data;")) {
      return NextResponse.json({ error: "Upload an image or PDF using multipart form data." }, { status: 415 });
    }
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > MAX_PDF_BYTES + 256 * 1024) {
      return NextResponse.json({ error: "The attachment is larger than 8 MB." }, { status: 413 });
    }
    const formData = await request.formData();
    const kind = formData.get("kind");
    if (kind === "image") {
      const image = await readPaymentProof(formData);
      if (image.error) return NextResponse.json({ error: image.error.replace("Payment proof", "Help Center image") }, { status: 400 });
      uploaded = await uploadPrivateImage(image.bytes, { folder: "ratewell/help-center/images" });
      await writeAdminAudit(request, auth, "help-guide.image-uploaded", {
        type: "HelpGuideMedia",
        id: uploaded.publicId,
        metadata: { kind: "image", bytes: image.bytes.length },
      });
      return NextResponse.json({
        image: {
          publicId: uploaded.publicId,
          alt: "",
          type: "image",
          url: privateImageUrl(uploaded.publicId, Math.floor(Date.now() / 1000) + 300),
        },
      }, { status: 201 });
    }
    if (kind !== "pdf") return NextResponse.json({ error: "Choose an image or PDF upload." }, { status: 400 });
    const file = formData.get("file");
    if (
      typeof File === "undefined" ||
      !(file instanceof File) ||
      file.size <= 0 ||
      file.size > MAX_PDF_BYTES ||
      !file.name.toLowerCase().endsWith(".pdf")
    ) return NextResponse.json({ error: "Choose a PDF no larger than 8 MB." }, { status: 400 });
    const bytes = Buffer.from(await file.arrayBuffer());
    if (!isSafeHelpPdf(bytes)) return NextResponse.json({ error: "The file is not a safe, supported PDF." }, { status: 400 });
    const cloudName = `${randomUUID().replace(/-/g, "")}.pdf`;
    uploaded = await uploadPrivateRaw(bytes, {
      folder: "ratewell/help-center/files",
      filename: cloudName.toLowerCase().endsWith(".pdf") ? cloudName : `${cloudName}.pdf`,
    });
    await writeAdminAudit(request, auth, "help-guide.pdf-uploaded", {
      type: "HelpGuideMedia",
      id: uploaded.publicId,
      metadata: { kind: "pdf", bytes: bytes.length },
    });
    return NextResponse.json({
      attachment: {
        publicId: uploaded.publicId,
        filename: file.name.normalize("NFKC").replace(/[^\p{L}\p{N} ._()-]/gu, "").trim().slice(0, 120) || "guide.pdf",
        sizeBytes: bytes.length,
        type: "pdf",
      },
    }, { status: 201 });
  } catch (error) {
    console.error("Uploading Help Center media failed:", error?.name || "UnknownError");
    return NextResponse.json({ error: "Could not upload Help Center media." }, { status: 500 });
  }
}
