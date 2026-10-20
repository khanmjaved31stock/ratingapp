import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/admin";
import { isSameOriginRequest, readJsonBody } from "@/lib/request";
import { ADMIN_REQUEST_CATEGORIES, getUnreadCount, isDuplicateOnlyBulkWriteError } from "@/lib/admin-request-notifications";
import AdminRequestRead from "@/models/AdminRequestRead";
import DepositRequest from "@/models/DepositRequest";
import PaymentVerification from "@/models/PaymentVerification";
import ReviewTaskAssignment from "@/models/ReviewTaskAssignment";
import SupportTicket from "@/models/SupportTicket";
import User from "@/models/User";
import WithdrawalRequest from "@/models/WithdrawalRequest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 5;
const READ_BATCH_SIZE = 250;

async function ensureReadModel() {
  await AdminRequestRead.init();
}

async function getCategoryFilters() {
  const usersWithPendingProof = await PaymentVerification.distinct("userId", { status: "pending" });
  return {
    registration: {
      role: "user",
      active: false,
      paymentStatus: "pending",
      deletedAt: null,
      _id: { $nin: usersWithPendingProof },
    },
    payment: {
      status: "pending",
      $or: [
        { purchaseType: "registration" },
        { purchaseType: { $exists: false } },
        { purchaseType: null },
      ],
    },
    package: { status: "pending", purchaseType: "renewal" },
    deposit: { status: "pending" },
    withdrawal: { status: "pending" },
    task: { status: "submitted" },
    support: { status: { $in: ["open", "inProgress"] } },
  };
}

function getCategoryModels() {
  return {
    registration: User,
    payment: PaymentVerification,
    package: PaymentVerification,
    deposit: DepositRequest,
    withdrawal: WithdrawalRequest,
    task: ReviewTaskAssignment,
    support: SupportTicket,
  };
}

async function getCategoryPreview(category, model, filter, adminId) {
  const [stats] = await model.aggregate([
    { $match: filter },
    {
      $lookup: {
        from: AdminRequestRead.collection.name,
        let: { sourceRequestId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$adminId", adminId] },
                  { $eq: ["$category", category] },
                  { $eq: ["$requestId", "$$sourceRequestId"] },
                ],
              },
            },
          },
          { $limit: 1 },
          { $project: { _id: 1 } },
        ],
        as: "readMark",
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        unread: {
          $sum: { $cond: [{ $eq: [{ $size: "$readMark" }, 0] }, 1, 0] },
        },
      },
    },
  ]);

  let query = model.find(filter).sort({ createdAt: -1 }).limit(PAGE_SIZE);
  if (category === "registration") {
    query = query.select("name email createdAt paymentStatus");
  } else if (category === "payment" || category === "package") {
    query = query.select("userId packageName packagePriceMinor transactionId purchaseType status createdAt")
      .populate("userId", "name email");
  } else if (category === "deposit") {
    query = query.select("userId amountMinor transactionId status createdAt").populate("userId", "name email");
  } else if (category === "withdrawal") {
    query = query.select("userId amountMinor provider status createdAt").populate("userId", "name email");
  } else if (category === "task") {
    query = query.select("userId ratingId rewardMinor status createdAt").populate("userId", "name email");
  } else {
    query = query.select("userId subject message status createdAt").populate("userId", "name email");
  }
  const items = await query.lean();
  const readIds = await AdminRequestRead.find({
    adminId,
    category,
    requestId: { $in: items.map((item) => item._id) },
  }).distinct("requestId");
  const readSet = new Set(readIds.map((id) => id.toString()));
  const total = stats?.total || 0;
  const unread = getUnreadCount(total, total - (stats?.unread || 0));

  return {
    total,
    unread,
    previews: items.map((item) => ({
      id: item._id.toString(),
      isRead: readSet.has(item._id.toString()),
      createdAt: item.createdAt.toISOString(),
      user: item.userId
        ? { name: item.userId.name, email: item.userId.email }
        : category === "registration" ? { name: item.name, email: item.email } : null,
      ...(category === "registration" ? { status: "pendingPayment" } : {}),
      ...(["payment", "package"].includes(category)
        ? {
            status: item.status,
            packageName: item.packageName,
            amountMinor: item.packagePriceMinor,
            transactionId: item.transactionId,
          }
        : {}),
      ...(category === "deposit"
        ? { status: item.status, amountMinor: item.amountMinor, reference: item.transactionId }
        : {}),
      ...(category === "withdrawal"
        ? { status: item.status, amountMinor: item.amountMinor, provider: item.provider }
        : {}),
      ...(category === "task"
        ? { status: item.status, amountMinor: item.rewardMinor, ratingId: item.ratingId?.toString() || "" }
        : {}),
      ...(category === "support"
        ? { status: item.status, subject: item.subject, message: item.message }
        : {}),
    })),
  };
}

export async function GET(request) {
  try {
    const auth = await requireStaff(request, ["superAdmin", "helpAdmin"]);
    if (auth.response) return auth.response;
    await ensureReadModel();
    const filters = await getCategoryFilters();
    const models = getCategoryModels();
    const entries = await Promise.all(
      ADMIN_REQUEST_CATEGORIES.map(async ({ id, label, target }) => ({
        id,
        label,
        target,
        ...(await getCategoryPreview(id, models[id], filters[id], auth.user._id)),
      })),
    );
    return NextResponse.json(
      { categories: entries, updatedAt: new Date().toISOString() },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Loading admin request notifications failed:", error);
    return NextResponse.json({ error: "Could not load request notifications." }, { status: 500 });
  }
}

export async function POST(request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const parsed = await readJsonBody(request);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const category = parsed.body.category;
  if (!ADMIN_REQUEST_CATEGORIES.some((item) => item.id === category)) {
    return NextResponse.json({ error: "Choose a valid request category." }, { status: 400 });
  }
  try {
    const auth = await requireStaff(request, ["superAdmin", "helpAdmin"]);
    if (auth.response) return auth.response;
    await ensureReadModel();
    const filters = await getCategoryFilters();
    const model = getCategoryModels()[category];
    const readAt = new Date();
    const cursor = model.find({
      ...filters[category],
      createdAt: { $lte: readAt },
    }).select("_id").lean().cursor();
    let operations = [];
    for await (const item of cursor) {
      operations.push({
        updateOne: {
          filter: { adminId: auth.user._id, category, requestId: item._id },
          update: { $setOnInsert: { adminId: auth.user._id, category, requestId: item._id, readAt } },
          upsert: true,
        },
      });
      if (operations.length >= READ_BATCH_SIZE) {
        try {
          await AdminRequestRead.bulkWrite(operations, { ordered: false });
        } catch (error) {
          if (!isDuplicateOnlyBulkWriteError(error)) throw error;
        }
        operations = [];
      }
    }
    if (operations.length) {
      try {
        await AdminRequestRead.bulkWrite(operations, { ordered: false });
      } catch (error) {
        if (!isDuplicateOnlyBulkWriteError(error)) throw error;
      }
    }
    return NextResponse.json({ message: "Request notifications marked as read.", readAt: readAt.toISOString() });
  } catch (error) {
    console.error("Marking admin request notifications read failed:", error);
    return NextResponse.json({ error: "Could not update request notification status." }, { status: 500 });
  }
}
