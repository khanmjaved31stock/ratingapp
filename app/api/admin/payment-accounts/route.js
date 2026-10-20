import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { writeAdminAudit } from "@/lib/audit";
import { isSameOriginRequest, readJsonBody } from "@/lib/request";
import { deleteCloudinaryAsset, privateImageUrl, uploadPrivateImage } from "@/lib/cloudinary";
import { readPaymentProof } from "@/lib/payment-proof";
import PaymentAccount from "@/models/PaymentAccount";

export const runtime = "nodejs";

function parseAccount(body) {
  const provider = body.provider;
  const displayName =
    typeof body.displayName === "string" ? body.displayName.trim() : "";
  const accountTitle =
    typeof body.accountTitle === "string" ? body.accountTitle.trim() : "";
  const accountNumber =
    typeof body.accountNumber === "string" ? body.accountNumber.trim() : "";
  const bankName = typeof body.bankName === "string" ? body.bankName.trim() : "";
  const instructions = typeof body.instructions === "string" ? body.instructions.trim() : "";
  const sortOrder = body.sortOrder === undefined ? 0 : Number(body.sortOrder);
  if (
    !["easypaisa", "jazzcash", "bank"].includes(provider) ||
    !displayName ||
    displayName.length > 100 ||
    !accountTitle ||
    accountTitle.length > 120 ||
    !accountNumber ||
    accountNumber.length > 64 ||
    bankName.length > 100 ||
    instructions.length > 1000 ||
    !Number.isSafeInteger(sortOrder) ||
    sortOrder < 0 ||
    sortOrder > 100000 ||
    (body.active !== undefined && typeof body.active !== "boolean")
  ) {
    return null;
  }
  return {
    provider,
    displayName,
    accountTitle,
    accountNumber,
    bankName,
    instructions,
    sortOrder,
    active: body.active === undefined ? true : body.active === true || body.active === "true",
  };
}

async function readAccountPayload(request) {
  if (request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data;")) {
    let formData;
    try {
      formData = await request.formData();
    } catch {
      return { error: "Could not read the payment account form." };
    }
    const body = Object.fromEntries(
      [...formData.entries()].filter(([, value]) => typeof value === "string"),
    );
    if (body.active !== undefined) body.active = body.active === "true";
    if (body.sortOrder !== undefined) body.sortOrder = Number(body.sortOrder);
    return { body, formData };
  }
  const parsed = await readJsonBody(request);
  return parsed.error ? parsed : { body: parsed.body, formData: null };
}

async function readQrUpload(formData) {
  if (!formData) return { bytes: null };
  const qr = formData.get("proof");
  if (typeof File === "undefined" || !(qr instanceof File) || qr.size === 0) {
    return { bytes: null };
  }
  return readPaymentProof(formData);
}

export async function GET(request) {
  try {
    const auth = await requireAdmin(request, "superAdmin");
    if (auth.response) return auth.response;
    const accounts = await PaymentAccount.find().sort({ archivedAt: 1, sortOrder: 1, createdAt: -1 }).lean();
    return NextResponse.json({
      accounts: accounts.map((item) => ({
        id: item._id.toString(),
        provider: item.provider,
        displayName: item.displayName,
        accountTitle: item.accountTitle,
        accountNumber: item.accountNumber,
        bankName: item.bankName,
        instructions: item.instructions || "",
        sortOrder: item.sortOrder || 0,
        qrUrl: item.qrPublicId
          ? privateImageUrl(item.qrPublicId, Math.floor(Date.now() / 1000) + 3600)
          : "",
        active: item.active,
        archivedAt: item.archivedAt?.toISOString() || null,
      })),
    });
  } catch (error) {
    console.error("Loading payment accounts failed:", error);
    return NextResponse.json({ error: "Could not load payment accounts." }, { status: 500 });
  }
}

export async function POST(request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  try {
    const auth = await requireAdmin(request, "superAdmin");
    if (auth.response) return auth.response;
    const parsed = await readAccountPayload(request);
    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const data = parseAccount(parsed.body);
    if (!data) return NextResponse.json({ error: "Invalid payment account details." }, { status: 400 });
    const qr = await readQrUpload(parsed.formData);
    if (qr.error) return NextResponse.json({ error: qr.error }, { status: 400 });
    let uploaded;
    const session = await mongoose.startSession();
    try {
      if (qr.bytes) uploaded = await uploadPrivateImage(qr.bytes, { folder: "ratewell/payment-account-qr" });
      let account;
      await session.withTransaction(async () => {
        [account] = await PaymentAccount.create(
          [{ ...data, qrPublicId: uploaded?.publicId || "" }],
          { session },
        );
        await writeAdminAudit(request, auth, "payment-account.created", {
          type: "PaymentAccount",
          id: account._id.toString(),
          metadata: { provider: account.provider, hasQr: Boolean(account.qrPublicId) },
          session,
        });
      });
      return NextResponse.json({ id: account._id.toString() }, { status: 201 });
    } catch (error) {
      if (uploaded?.publicId) {
        try { await deleteCloudinaryAsset(uploaded.publicId); }
        catch (cleanupError) { console.error("Cleaning orphaned payment QR failed:", cleanupError?.name || "UnknownError"); }
      }
      throw error;
    } finally {
      await session.endSession();
    }
  } catch (error) {
    console.error("Creating payment account failed:", error);
    return NextResponse.json({ error: "Could not create payment account." }, { status: 500 });
  }
}

export async function PATCH(request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  try {
    const auth = await requireAdmin(request, "superAdmin");
    if (auth.response) return auth.response;
    const parsed = await readAccountPayload(request);
    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const data = parseAccount(parsed.body);
    const { id } = parsed.body;
    if (
      !data ||
      typeof id !== "string" ||
      !mongoose.isValidObjectId(id) ||
      new mongoose.Types.ObjectId(id).toString() !== id
    ) {
      return NextResponse.json({ error: "Invalid payment account update." }, { status: 400 });
    }
    const qr = await readQrUpload(parsed.formData);
    if (qr.error) return NextResponse.json({ error: qr.error }, { status: 400 });
    const removeQr = parsed.body.removeQr === true || parsed.body.removeQr === "true";
    let uploaded;
    const session = await mongoose.startSession();
    let oldQrPublicId = "";
    try {
      if (qr.bytes) uploaded = await uploadPrivateImage(qr.bytes, { folder: "ratewell/payment-account-qr" });
      let account;
      await session.withTransaction(async () => {
        const existing = await PaymentAccount.findOne({ _id: id, archivedAt: null }).session(session);
        if (!existing) {
          const error = new Error("Payment account not found or archived.");
          error.statusCode = 404;
          throw error;
        }
        oldQrPublicId = existing.qrPublicId || "";
        const update = {
          ...data,
          ...(uploaded ? { qrPublicId: uploaded.publicId } : removeQr ? { qrPublicId: "" } : {}),
        };
        account = await PaymentAccount.findOneAndUpdate(
          { _id: id, archivedAt: null },
          { $set: update },
          { new: true, runValidators: true, session },
        );
        if (!account) {
          const error = new Error("Payment account not found or archived.");
          error.statusCode = 404;
          throw error;
        }
        await writeAdminAudit(request, auth, "payment-account.updated", {
          type: "PaymentAccount",
          id,
          metadata: { provider: account.provider, hasQr: Boolean(account.qrPublicId) },
          session,
        });
      });
      if ((uploaded || removeQr) && oldQrPublicId) {
        try { await deleteCloudinaryAsset(oldQrPublicId); }
        catch (cleanupError) { console.error("Removing replaced payment QR failed:", cleanupError?.name || "UnknownError"); }
      }
      return NextResponse.json({ id: account._id.toString() });
    } catch (error) {
      if (uploaded?.publicId) {
        try { await deleteCloudinaryAsset(uploaded.publicId); }
        catch (cleanupError) { console.error("Cleaning orphaned payment QR failed:", cleanupError?.name || "UnknownError"); }
      }
      throw error;
    } finally {
      await session.endSession();
    }
  } catch (error) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Updating payment account failed:", error);
    return NextResponse.json({ error: "Could not update payment account." }, { status: 500 });
  }
}

export async function DELETE(request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  try {
    const auth = await requireAdmin(request, "superAdmin");
    if (auth.response) return auth.response;
    const parsed = await readJsonBody(request);
    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const id = parsed.body.id;
    if (
      typeof id !== "string" ||
      !mongoose.isValidObjectId(id) ||
      new mongoose.Types.ObjectId(id).toString() !== id
    ) {
      return NextResponse.json({ error: "Invalid payment account identifier." }, { status: 400 });
    }
    const session = await mongoose.startSession();
    let account;
    try {
      await session.withTransaction(async () => {
        account = await PaymentAccount.findOneAndUpdate(
          { _id: id, archivedAt: null },
          { $set: { active: false, archivedAt: new Date() } },
          { new: true, session },
        );
        if (!account) {
          const error = new Error("Payment account not found or already archived.");
          error.statusCode = 404;
          throw error;
        }
        await writeAdminAudit(request, auth, "payment-account.archived", {
          type: "PaymentAccount",
          id,
          metadata: { archivedAt: account.archivedAt.toISOString() },
          session,
        });
      });
    } finally {
      await session.endSession();
    }
    return NextResponse.json({ message: "Payment account archived. Existing payment history was preserved." });
  } catch (error) {
    if (error?.statusCode) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("Deleting payment account failed:", error);
    return NextResponse.json({ error: "Could not delete payment account." }, { status: 500 });
  }
}
