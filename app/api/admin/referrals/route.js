import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import ReferralEvent from "@/models/ReferralEvent";
import User from "@/models/User";
import WalletTransaction from "@/models/WalletTransaction";
import WithdrawalRequest from "@/models/WithdrawalRequest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const auth = await requireAdmin(request, "superAdmin");
    if (auth.response) return auth.response;
    const [users, commissions, pending, events] = await Promise.all([
      User.find({ role: "user", deletedAt: null })
        .select("name email referredBy paymentStatus active createdAt referralDirectConversions referralIndirectConversions referralTier")
        .populate("referredBy", "name email deletedAt")
        .sort({ createdAt: -1 })
        .limit(500)
        .lean(),
      WalletTransaction.aggregate([
        { $match: { type: { $in: ["referralCommission", "referralMilestone"] }, direction: "credit", status: "completed" } },
        { $group: { _id: "$userId", amountMinor: { $sum: "$amountMinor" }, count: { $sum: 1 } } },
      ]),
      WithdrawalRequest.aggregate([
        { $match: { status: { $in: ["pending", "processing"] } } },
        { $group: { _id: "$userId", amountMinor: { $sum: "$amountMinor" } } },
      ]),
      ReferralEvent.aggregate([
        { $match: { $or: [{ type: { $ne: "conversion" } }, { type: "conversion", $or: [{ level: 1 }, { level: { $exists: false } }] }] } },
        { $group: { _id: "$type", count: { $sum: 1 } } },
      ]),
    ]);
    const commissionByUser = new Map(commissions.map((item) => [item._id.toString(), item]));
    const pendingByUser = new Map(pending.map((item) => [item._id.toString(), item.amountMinor]));
    return NextResponse.json({
      totals: Object.fromEntries(events.map((item) => [item._id, item.count])),
      users: users.map((user) => {
        const id = user._id.toString();
        const earned = commissionByUser.get(id);
        return {
          id,
          name: user.name,
          email: user.email,
          active: user.active,
          converted: user.paymentStatus === "approved",
          directConversions: user.referralDirectConversions || 0,
          indirectConversions: user.referralIndirectConversions || 0,
          tier: user.referralTier || "",
          referredBy: user.referredBy && !user.referredBy.deletedAt
            ? { id: user.referredBy._id.toString(), name: user.referredBy.name, email: user.referredBy.email }
            : null,
          earningsMinor: earned?.amountMinor || 0,
          commissionCount: earned?.count || 0,
          pendingWithdrawalMinor: pendingByUser.get(id) || 0,
          createdAt: user.createdAt.toISOString(),
        };
      }),
    });
  } catch (error) {
    console.error("Loading referral oversight failed:", error);
    return NextResponse.json({ error: "Could not load referral oversight." }, { status: 500 });
  }
}
