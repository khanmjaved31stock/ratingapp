import { NextResponse } from "next/server";
import { getActiveRequestUser } from "@/lib/request-auth";
import ReferralEvent from "@/models/ReferralEvent";
import WalletTransaction from "@/models/WalletTransaction";
import WithdrawalRequest from "@/models/WithdrawalRequest";
import User from "@/models/User";
import PortalSettings from "@/models/PortalSettings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const auth = await getActiveRequestUser(request);
    if (!auth || auth.user.role !== "user" || auth.user.paymentStatus !== "approved") {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const levels = [];
    let parentIds = [auth.user._id];
    for (let level = 1; level <= 5 && parentIds.length; level += 1) {
      const referrals = await User.find({
        referredBy: { $in: parentIds },
        role: "user",
        deletedAt: null,
      })
        .select("name email active paymentStatus referredBy createdAt")
        .sort({ createdAt: -1 })
        .limit(200)
        .lean();
      levels.push({
        level,
        users: referrals.map((user) => ({
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          active: user.active,
          converted: user.paymentStatus === "approved",
          joinedAt: user.createdAt.toISOString(),
        })),
      });
      parentIds = referrals.map((user) => user._id);
    }

    const [earnings, pending, events, currentUser, portalSettings] = await Promise.all([
      WalletTransaction.aggregate([
        {
          $match: {
            userId: auth.user._id,
            type: { $in: ["referralCommission", "referralMilestone"] },
            status: "completed",
          },
        },
        { $group: { _id: null, totalMinor: { $sum: "$amountMinor" }, count: { $sum: 1 } } },
      ]),
      WithdrawalRequest.aggregate([
        { $match: { userId: auth.user._id, status: { $in: ["pending", "processing"] } } },
        { $group: { _id: null, totalMinor: { $sum: "$amountMinor" } } },
      ]),
      ReferralEvent.aggregate([
        { $match: { referrerId: auth.user._id } },
        { $group: { _id: "$type", count: { $sum: 1 } } },
      ]),
      User.findById(auth.user._id).select("referralDirectConversions referralIndirectConversions referralTier unlockedReferralMilestones").lean(),
      PortalSettings.findOne({ key: "global" }).select("referralMilestones").lean(),
    ]);

    const origin =
      process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
    return NextResponse.json({
      referralCode: auth.user.referralCode,
      referralUrl: `${origin.replace(/\/$/, "")}/r/${encodeURIComponent(auth.user.referralCode)}`,
      levels,
      earningsMinor: earnings[0]?.totalMinor || 0,
      commissionCount: earnings[0]?.count || 0,
      pendingWithdrawalsMinor: pending[0]?.totalMinor || 0,
      events: Object.fromEntries(events.map((event) => [event._id, event.count])),
      directConversions: currentUser?.referralDirectConversions || 0,
      indirectConversions: currentUser?.referralIndirectConversions || 0,
      tier: currentUser?.referralTier || "",
      milestones: (portalSettings?.referralMilestones || []).map((milestone) => ({
        id: milestone.id,
        title: milestone.title,
        requiredDirect: milestone.directConversions,
        requiredIndirect: milestone.indirectConversions,
        rewardMinor: milestone.rewardMinor,
        windowSeconds: milestone.windowSeconds || 0,
        tier: milestone.tier,
        unlocked: currentUser?.unlockedReferralMilestones?.includes(milestone.id) || false,
      })),
    });
  } catch (error) {
    console.error("Loading referral network failed:", error);
    return NextResponse.json({ error: "Referral network is temporarily unavailable." }, { status: 500 });
  }
}
