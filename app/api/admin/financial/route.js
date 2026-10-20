import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { writeAdminAudit } from "@/lib/audit";
import { isSameOriginRequest, readJsonBody } from "@/lib/request";
import FinancialTransaction from "@/models/FinancialTransaction";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

function csvCell(value) {
  const text = String(value ?? "");
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export async function GET(request) {
  try {
    const auth = await requireAdmin(request, "superAdmin");
    if (auth.response) return auth.response;
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "";
    const status = searchParams.get("status") || "";
    const query = searchParams.get("q")?.trim() || "";
    const fromValue = searchParams.get("from");
    const toValue = searchParams.get("to");
    const page = Number(searchParams.get("page") || 1);
    const limit = Number(searchParams.get("limit") || 25);
    const exportCsv = searchParams.get("export") === "csv";
    const types = ["packageRevenue", "payout", "withdrawalFee", "expense", "adjustment"];
    const statuses = ["pending", "completed", "rejected"];
    const from = fromValue ? new Date(fromValue) : null;
    const to = toValue ? new Date(toValue) : null;
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(toValue)) to.setUTCHours(23, 59, 59, 999);
    if (
      (type && !types.includes(type)) ||
      (status && !statuses.includes(status)) ||
      !Number.isInteger(page) || page < 1 || page > 10000 ||
      !Number.isInteger(limit) || limit < 1 || limit > 100 ||
      (from && !Number.isFinite(from.getTime())) ||
      (to && !Number.isFinite(to.getTime())) ||
      (from && to && from > to) ||
      query.length > 100
    ) {
      return NextResponse.json({ error: "Invalid financial ledger filters." }, { status: 400 });
    }

    const filter = {};
    if (type) filter.type = type;
    if (status) filter.status = status;
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = from;
      if (to) filter.createdAt.$lte = to;
    }
    if (query) {
      const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const contains = new RegExp(escapedQuery, "i");
      filter.$or = [
        { description: contains },
        { "registrationSnapshot.transactionId": contains },
        { "registrationSnapshot.senderName": contains },
        { "registrationSnapshot.packageName": contains },
      ];
    }

    if (exportCsv) {
      const columns = [
        "createdAt", "type", "status", "amountMinor", "currency", "description",
        "transactionId", "senderName", "senderAccountNumber", "packageName", "packageDescription", "packageBenefits",
        "submittedAt", "submissionIpAddress", "approvedAt", "approvalIpAddress",
      ];
      const cursor = FinancialTransaction.find(filter).sort({ createdAt: -1 }).lean().cursor({ batchSize: 500 });
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`${columns.map(csvCell).join(",")}\r\n`));
        },
        async pull(controller) {
          try {
            const item = await cursor.next();
            if (!item) {
              controller.close();
              await cursor.close();
              return;
            }
            const snapshot = item.registrationSnapshot || {};
            const row = [
              item.createdAt?.toISOString() || "", item.type, item.status, item.amountMinor,
              item.currency, item.description, snapshot.transactionId, snapshot.senderName,
              snapshot.senderAccountNumber, snapshot.packageName, snapshot.packageDescription,
              (snapshot.packageBenefits || []).join(" | "),
              snapshot.submittedAt?.toISOString() || "", snapshot.submissionIpAddress,
              snapshot.approvedAt?.toISOString() || "", snapshot.approvalIpAddress,
            ].map(csvCell).join(",");
            controller.enqueue(encoder.encode(`${row}\r\n`));
          } catch (error) {
            console.error("Streaming financial ledger export failed:", error);
            controller.error(error);
            await cursor.close();
          }
        },
        async cancel() {
          await cursor.close();
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="ratewell-financial-ledger.csv"',
          "Cache-Control": "private, no-store",
        },
      });
    }

    const [total, items] = await Promise.all([
      FinancialTransaction.countDocuments(filter),
      FinancialTransaction.find(filter)
        .populate("createdBy", "name email")
        .populate("userId", "name email")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);
    return NextResponse.json({
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      transactions: items.map((item) => ({
        id: item._id.toString(),
        type: item.type,
        status: item.status,
        amountMinor: item.amountMinor,
        currency: item.currency,
        description: item.description,
        createdAt: item.createdAt.toISOString(),
        createdBy: item.createdBy?.name || "System",
        user: item.userId ? { name: item.userId.name, email: item.userId.email } : null,
        registration: item.registrationSnapshot || {},
      })),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Loading financial ledger failed:", error);
    return NextResponse.json({ error: "Could not load financial ledger." }, { status: 500 });
  }
}

export async function POST(request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const parsed = await readJsonBody(request);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { amountMinor, description } = parsed.body;
  if (
    !Number.isSafeInteger(amountMinor) ||
    amountMinor < 1 ||
    amountMinor > 100000000 ||
    typeof description !== "string" ||
    !description.trim() ||
    description.length > 240
  ) {
    return NextResponse.json({ error: "Enter a valid expense amount and description." }, { status: 400 });
  }
  try {
    const auth = await requireAdmin(request, "superAdmin");
    if (auth.response) return auth.response;
    const rate = await consumeRateLimit(request, "admin-financial-write", {
      limit: 20,
      windowMs: 60 * 60 * 1000,
    });
    if (!rate.allowed) {
      return NextResponse.json({ error: "Too many financial updates. Please try again later." }, { status: 429 });
    }
    const item = await FinancialTransaction.create({
      type: "expense",
      amountMinor,
      currency: "PKR",
      status: "completed",
      idempotencyKey: randomUUID(),
      description: description.trim(),
      createdBy: auth.user._id,
    });
    await writeAdminAudit(request, auth, "financial.expense-recorded", {
      type: "FinancialTransaction",
      id: item._id.toString(),
      metadata: { amountMinor, currency: "PKR" },
    });
    return NextResponse.json({ message: "Expense recorded.", id: item._id.toString() }, { status: 201 });
  } catch (error) {
    console.error("Recording financial expense failed:", error);
    return NextResponse.json({ error: "Could not record the expense." }, { status: 500 });
  }
}
