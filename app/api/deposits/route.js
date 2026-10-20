import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { getActiveRequestUser } from "@/lib/request-auth";
import { isSameOriginRequest } from "@/lib/request";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestIp } from "@/lib/request-ip";
import { readPaymentProof } from "@/lib/payment-proof";
import { uploadPrivateImage, deleteCloudinaryAsset } from "@/lib/cloudinary";
import PaymentAccount from "@/models/PaymentAccount";
import DepositRequest from "@/models/DepositRequest";
import PaymentVerification from "@/models/PaymentVerification";
import PaymentReference from "@/models/PaymentReference";
import { currentTermsRequiredMessage, requiresCurrentTermsAcceptance } from "@/lib/legal-terms";
import { privateImageUrl } from "@/lib/cloudinary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const auth = await getActiveRequestUser(request);
    if (!auth || auth.user.role !== "user" || auth.user.paymentStatus !== "approved") {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const [accounts, deposits] = await Promise.all([
      PaymentAccount.find({ active: true, archivedAt: null })
        .select("provider displayName accountTitle accountNumber bankName instructions qrPublicId sortOrder")
        .sort({ sortOrder: 1, provider: 1 })
        .lean(),
      DepositRequest.find({ userId: auth.user._id }).sort({ createdAt: -1 }).limit(30).lean(),
    ]);
    return NextResponse.json({
      paymentAccounts: accounts.map((account) => ({
        id: account._id.toString(),
        provider: account.provider,
        displayName: account.displayName,
        accountTitle: account.accountTitle,
        accountNumber: account.accountNumber,
        bankName: account.bankName,
        instructions: account.instructions || "",
        qrUrl: account.qrPublicId
          ? privateImageUrl(account.qrPublicId, Math.floor(Date.now() / 1000) + 3600)
          : "",
      })),
      deposits: deposits.map((item) => ({
        id: item._id.toString(),
        amountMinor: item.amountMinor,
        transactionId: item.transactionId,
        status: item.status,
        reviewNote: item.reviewNote,
        createdAt: item.createdAt.toISOString(),
      })),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Loading deposit options failed:", error);
    return NextResponse.json({ error: "Deposit options are temporarily unavailable." }, { status: 500 });
  }
}

export async function POST(request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  let uploaded;
  try {
    const auth = await getActiveRequestUser(request);
    if (!auth || auth.user.role !== "user" || auth.user.paymentStatus !== "approved") {
      return NextResponse.json({ error: "Only active users can submit a deposit." }, { status: 401 });
    }
    if (await requiresCurrentTermsAcceptance(auth.user)) {
      return NextResponse.json(
        { error: currentTermsRequiredMessage(), termsRequired: true },
        { status: 428 },
      );
    }
    const rate = await consumeRateLimit(request, "deposit-proof", { limit: 5, windowMs: 60 * 60 * 1000 });
    if (!rate.allowed) return NextResponse.json({ error: "Too many deposit submissions. Try again later." }, { status: 429 });
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data;")) {
      return NextResponse.json({ error: "Submit the deposit as multipart form data with a proof image." }, { status: 415 });
    }
    const form = await request.formData();
    const amountMinor = Number(form.get("amountMinor"));
    const paymentAccountId = form.get("paymentAccountId");
    const transactionId = typeof form.get("transactionId") === "string" ? form.get("transactionId").trim() : "";
    const senderName = typeof form.get("senderName") === "string" ? form.get("senderName").trim() : "";
    const senderAccountNumber = typeof form.get("senderAccountNumber") === "string" ? form.get("senderAccountNumber").trim() : "";
    if (!Number.isSafeInteger(amountMinor) || amountMinor < 100 || amountMinor > 100000000 ||
      typeof paymentAccountId !== "string" || !/^[a-f\d]{24}$/i.test(paymentAccountId) ||
      !transactionId || transactionId.length > 120 || !senderName || senderName.length > 120 ||
      !senderAccountNumber || senderAccountNumber.length > 64) {
      return NextResponse.json({ error: "Enter a valid amount, payment account, transaction ID, sender name, and sender account number." }, { status: 400 });
    }
    const proof = await readPaymentProof(form);
    if (proof.error) return NextResponse.json({ error: proof.error }, { status: 400 });
    const account = await PaymentAccount.exists({ _id: paymentAccountId, active: true, archivedAt: null });
    if (!account) return NextResponse.json({ error: "Choose an active company payment account." }, { status: 400 });
    const transactionIdKey = transactionId.toLowerCase();
    await PaymentReference.init();
    const [duplicatePayment, duplicateDeposit, duplicateReference] = await Promise.all([
      PaymentVerification.findOne({ transactionId })
        .collation({ locale: "en", strength: 2 })
        .select("_id")
        .lean(),
      DepositRequest.findOne({ transactionId })
        .collation({ locale: "en", strength: 2 })
        .select("_id")
        .lean(),
      PaymentReference.exists({ transactionIdKey }),
    ]);
    if (duplicatePayment || duplicateDeposit || duplicateReference) return NextResponse.json({ error: "This transaction ID has already been submitted." }, { status: 409 });
    const pending = await DepositRequest.exists({ userId: auth.user._id, status: "pending" });
    if (pending) return NextResponse.json({ error: "A deposit proof is already awaiting review." }, { status: 409 });
    uploaded = await uploadPrivateImage(proof.bytes, { folder: "ratewell/deposit-proofs" });
    const session = await mongoose.startSession();
    let deposit;
    try {
      await session.withTransaction(async () => {
        [deposit] = await DepositRequest.create([{
          userId: auth.user._id,
          paymentAccountId,
          amountMinor,
          transactionId,
          senderName,
          senderAccountNumber,
          submissionIpAddress: getRequestIp(request) || "",
          proofUrl: uploaded.secureUrl,
          proofPublicId: uploaded.publicId,
        }], { session });
        await PaymentReference.create([{
          transactionIdKey,
          sourceType: "deposit",
          sourceId: deposit._id,
        }], { session });
      });
    } finally {
      await session.endSession();
    }
    return NextResponse.json({ message: "Deposit proof submitted for verification.", depositId: deposit._id.toString() }, { status: 201 });
  } catch (error) {
    if (uploaded?.publicId) {
      try { await deleteCloudinaryAsset(uploaded.publicId); }
      catch (cleanupError) {
        console.error("Cleaning orphaned deposit proof failed:", {
          name: cleanupError?.name,
          code: cleanupError?.http_code || cleanupError?.code,
        });
      }
    }
    if (error?.code === 11000) return NextResponse.json({ error: "This transaction ID has already been submitted." }, { status: 409 });
    console.error("Submitting deposit proof failed:", {
      name: error?.name,
      code: error?.code,
    });
    return NextResponse.json({ error: "Could not submit deposit proof." }, { status: 500 });
  }
}
