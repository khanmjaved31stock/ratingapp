import ActiveSession from "@/models/ActiveSession";
import AdminAuditLog from "@/models/AdminAuditLog";
import FinancialTransaction from "@/models/FinancialTransaction";
import PaymentVerification from "@/models/PaymentVerification";
import Rating from "@/models/Rating";
import RegistrationPackage from "@/models/RegistrationPackage";
import SecurityEvent from "@/models/SecurityEvent";
import SupportTicket from "@/models/SupportTicket";
import TrafficEvent from "@/models/TrafficEvent";
import User from "@/models/User";
import WalletTransaction from "@/models/WalletTransaction";
import WithdrawalRequest from "@/models/WithdrawalRequest";
import PortalSettings from "@/models/PortalSettings";

export async function getAdminOverview() {
  const since = new Date(Date.now() - 13 * 24 * 60 * 60 * 1000);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const [
    totalUsers,
    approvedAccounts,
    activeUsers,
    disabledUsers,
    activeSessions,
    totalRatings,
    approvedPayments,
    pendingPayments,
    openTickets,
    flaggedRatings,
    activePackages,
    financial,
    wallet,
    pendingWithdrawals,
    securityEvents,
    audits,
    traffic,
    financialLogs,
    userDays,
    ratingDays,
    financeDays,
    weeklyFinance,
    settings,
    activeUsers30d,
    ratingsThisMonth,
    revenueThisMonth,
    expiredPackages,
    expiringPackages,
    expiredPackageUsers,
    expiringPackageUsers,
    packageUserCounts,
    packageRevenueTotals,
    renewalPaymentStats,
  ] = await Promise.all([
    User.countDocuments({ deletedAt: null, role: "user" }),
    User.countDocuments({ deletedAt: null, role: "user", paymentStatus: "approved" }),
    User.countDocuments({ deletedAt: null, role: "user", active: true }),
    User.countDocuments({ deletedAt: null, role: "user", active: false }),
    ActiveSession.distinct("userId", {
      revokedAt: null,
      expiresAt: { $gt: now },
      lastSeenAt: { $gte: new Date(now.getTime() - 5 * 60 * 1000) },
    }).then((ids) => ids.length),
    Rating.countDocuments({ moderationStatus: { $ne: "removed" } }),
    PaymentVerification.countDocuments({ status: "approved" }),
    PaymentVerification.countDocuments({ status: "pending" }),
    SupportTicket.countDocuments({ status: { $in: ["open", "inProgress"] } }),
    Rating.countDocuments({ flagged: true, moderationStatus: { $ne: "removed" } }),
    RegistrationPackage.countDocuments({ active: true }),
    FinancialTransaction.aggregate([
      { $match: { status: "completed" } },
      { $group: { _id: "$type", amountMinor: { $sum: "$amountMinor" }, count: { $sum: 1 } } },
    ]),
    WalletTransaction.aggregate([
      { $match: { status: "completed" } },
      { $group: { _id: { type: "$type", direction: "$direction" }, amountMinor: { $sum: "$amountMinor" } } },
    ]),
    WithdrawalRequest.countDocuments({ status: "pending" }),
    SecurityEvent.find().sort({ createdAt: -1 }).limit(12).select("type email ipAddress details createdAt").lean(),
    AdminAuditLog.find().populate("actorId", "name email").sort({ createdAt: -1 }).limit(15).lean(),
    TrafficEvent.countDocuments({ type: "pageView", createdAt: { $gte: since } }),
    FinancialTransaction.find()
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 })
      .limit(50)
      .lean(),
    User.aggregate([
      { $match: { deletedAt: null, createdAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
    ]),
    Rating.aggregate([
      { $match: { createdAt: { $gte: since }, moderationStatus: { $ne: "removed" } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
    ]),
    FinancialTransaction.aggregate([
      { $match: { status: "completed", createdAt: { $gte: since } } },
      { $group: { _id: { day: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, type: "$type" }, amountMinor: { $sum: "$amountMinor" } } },
    ]),
    FinancialTransaction.aggregate([
      { $match: { status: "completed", createdAt: { $gte: new Date(now.getTime() - 56 * 24 * 60 * 60 * 1000) } } },
      { $group: { _id: { week: { $dateToString: { format: "%G-W%V", date: "$createdAt" } }, type: "$type" }, amountMinor: { $sum: "$amountMinor" } } },
      { $sort: { "_id.week": 1 } },
    ]),
    PortalSettings.findOne({ key: "global" }).select("goals packagePolicy").lean(),
    User.countDocuments({
      role: "user",
      active: true,
      deletedAt: null,
      lastReviewAt: { $gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) },
    }),
    Rating.countDocuments({ createdAt: { $gte: monthStart }, moderationStatus: { $ne: "removed" } }),
    FinancialTransaction.aggregate([
      { $match: { type: { $in: ["packageRevenue", "withdrawalFee"] }, status: "completed", createdAt: { $gte: monthStart } } },
      { $group: { _id: null, amountMinor: { $sum: "$amountMinor" } } },
    ]),
    User.countDocuments({ role: "user", paymentStatus: "approved", packageExpiresAt: { $lte: now } }),
    User.countDocuments({
      role: "user",
      paymentStatus: "approved",
      packageExpiresAt: { $gt: now, $lte: sevenDaysFromNow },
    }),
    User.find({ role: "user", paymentStatus: "approved", packageExpiresAt: { $lte: now } })
      .select("name email packageExpiresAt")
      .sort({ packageExpiresAt: 1 })
      .limit(20)
      .lean(),
    User.find({
      role: "user",
      paymentStatus: "approved",
      packageExpiresAt: { $gt: now, $lte: sevenDaysFromNow },
    })
      .select("name email packageExpiresAt")
      .sort({ packageExpiresAt: 1 })
      .limit(20)
      .lean(),
    User.aggregate([
      { $match: { role: "user", paymentStatus: "approved", active: true, deletedAt: null, packageExpiresAt: { $gt: now }, packageId: { $ne: null } } },
      { $group: { _id: "$packageId", count: { $sum: 1 } } },
    ]),
    FinancialTransaction.aggregate([
      { $match: { type: "packageRevenue", status: "completed", "registrationSnapshot.packageId": { $ne: null } } },
      { $group: { _id: "$registrationSnapshot.packageId", revenueMinor: { $sum: "$amountMinor" }, purchaseCount: { $sum: 1 } } },
    ]),
    PaymentVerification.aggregate([
      { $match: { purchaseType: "renewal" } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
  ]);

  const dayMap = new Map();
  for (let offset = 13; offset >= 0; offset -= 1) {
    const date = new Date(now);
    date.setDate(date.getDate() - offset);
    const key = date.toISOString().slice(0, 10);
    dayMap.set(key, { date: key, users: 0, ratings: 0, revenueMinor: 0, payoutMinor: 0 });
  }
  for (const item of userDays) {
    const row = dayMap.get(item._id);
    if (row) row.users = item.count;
  }
  for (const item of ratingDays) {
    const row = dayMap.get(item._id);
    if (row) row.ratings = item.count;
  }
  for (const item of financeDays) {
    const row = dayMap.get(item._id.day);
    if (!row) continue;
    if (item._id.type === "packageRevenue" || item._id.type === "withdrawalFee") row.revenueMinor += item.amountMinor;
    if (item._id.type === "payout") row.payoutMinor = item.amountMinor;
  }
  const weeklyMap = new Map();
  for (const item of weeklyFinance) {
    const row = weeklyMap.get(item._id.week) || { week: item._id.week, revenueMinor: 0, payoutMinor: 0, expenseMinor: 0 };
    if (item._id.type === "packageRevenue" || item._id.type === "withdrawalFee") row.revenueMinor += item.amountMinor;
    if (item._id.type === "payout") row.payoutMinor = item.amountMinor;
    if (item._id.type === "expense") row.expenseMinor = item.amountMinor;
    weeklyMap.set(item._id.week, row);
  }

  const financialTotals = Object.fromEntries(
    financial.map((item) => [item._id, item.amountMinor]),
  );
  const walletTotals = wallet.map((item) => ({
    type: item._id.type,
    direction: item._id.direction,
    amountMinor: item.amountMinor,
  }));
  const earnedMinor = walletTotals
    .filter((item) => item.direction === "credit")
    .reduce((sum, item) => sum + item.amountMinor, 0);
  const goals = settings?.goals || {};
  const revenueGoal = goals.monthlyRevenueMinor || 0;
  const activeUserGoal = goals.activeUsers || 0;
  const monthlyRatingGoal = goals.monthlyRatings || 0;
  const conversionGoal = goals.conversionPercent || 0;
  const monthRevenueMinor = revenueThisMonth[0]?.amountMinor || 0;
  const conversionRate = totalUsers > 0 ? Math.round((approvedAccounts / totalUsers) * 10000) / 100 : 0;
  const packageCatalog = await RegistrationPackage.find()
    .select("name priceMinor active")
    .sort({ sortOrder: 1, priceMinor: 1 })
    .lean();
  const activeUsersByPackage = new Map(packageUserCounts.map((item) => [item._id.toString(), item.count]));
  const revenueByPackage = new Map(packageRevenueTotals.map((item) => [item._id.toString(), item]));
  const renewalStats = Object.fromEntries(renewalPaymentStats.map((item) => [item._id, item.count]));
  const renewalTotal = Object.values(renewalStats).reduce((sum, count) => sum + count, 0);

  return {
    users: {
      total: totalUsers,
      active: activeUsers,
      disabled: disabledUsers,
      activeLoggedIn: activeSessions,
    },
    ratings: { total: totalRatings, flagged: flaggedRatings },
    payments: { approved: approvedPayments, pending: pendingPayments },
    withdrawals: { pending: pendingWithdrawals },
    support: { open: openTickets },
    packages: { active: activePackages },
    packageInsights: {
      validityDays: settings?.packagePolicy?.validityDays || 30,
      renewalCooldownDays: settings?.packagePolicy?.renewalCooldownDays ?? 2,
      renewal: {
        approved: renewalStats.approved || 0,
        pending: renewalStats.pending || 0,
        rejected: renewalStats.rejected || 0,
        conversionPercent: renewalTotal
          ? Math.round(((renewalStats.approved || 0) / renewalTotal) * 10000) / 100
          : 0,
      },
      distribution: packageCatalog.map((item) => ({
        id: item._id.toString(),
        name: item.name,
        active: item.active,
        activeUsers: activeUsersByPackage.get(item._id.toString()) || 0,
        revenueMinor: revenueByPackage.get(item._id.toString())?.revenueMinor || 0,
        purchases: revenueByPackage.get(item._id.toString())?.purchaseCount || 0,
      })),
    },
    packageValidity: {
      expired: expiredPackages,
      expiringInSevenDays: expiringPackages,
      expiredUsers: expiredPackageUsers.map((user) => ({
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        expiresAt: user.packageExpiresAt.toISOString(),
      })),
      expiringUsers: expiringPackageUsers.map((user) => ({
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        expiresAt: user.packageExpiresAt.toISOString(),
      })),
    },
    finances: {
      revenueMinor: (financialTotals.packageRevenue || 0) + (financialTotals.withdrawalFee || 0),
      depositsMinor: financialTotals.deposit || 0,
      payoutsMinor: financialTotals.payout || 0,
      expensesMinor: financialTotals.expense || 0,
      netRevenueMinor:
        (financialTotals.packageRevenue || 0) +
        (financialTotals.withdrawalFee || 0) -
        (financialTotals.payout || 0) -
        (financialTotals.expense || 0),
      earnedWalletMinor: earnedMinor,
      currency: "PKR",
    },
    financialLogs: financialLogs.map((item) => ({
      id: item._id.toString(),
      type: item.type,
      amountMinor: item.amountMinor,
      currency: item.currency,
      status: item.status,
      description: item.description,
      createdBy: item.createdBy?.name || "System",
      createdAt: item.createdAt.toISOString(),
    })),
    conversionRate,
    funnel: {
      registered: totalUsers,
      packageApproved: approvedAccounts,
      activeLast30Days: activeUsers30d,
      ratingsLast30Days: ratingsThisMonth,
    },
    taskCompletions14d: ratingDays.reduce((sum, item) => sum + item.count, 0),
    goals: {
      current: {
        revenueMinor: monthRevenueMinor,
        activeUsers: activeUsers30d,
        monthlyRatings: ratingsThisMonth,
        conversionPercent: conversionRate,
      },
      target: {
        revenueMinor: revenueGoal,
        activeUsers: activeUserGoal,
        monthlyRatings: monthlyRatingGoal,
        conversionPercent: conversionGoal,
      },
      progress: {
        revenue: revenueGoal > 0 ? Math.min(100, Math.round((monthRevenueMinor / revenueGoal) * 100)) : 0,
        activeUsers: activeUserGoal > 0 ? Math.min(100, Math.round((activeUsers30d / activeUserGoal) * 100)) : 0,
        monthlyRatings: monthlyRatingGoal > 0 ? Math.min(100, Math.round((ratingsThisMonth / monthlyRatingGoal) * 100)) : 0,
        conversion: conversionGoal > 0 ? Math.min(100, Math.round((conversionRate / conversionGoal) * 100)) : 0,
      },
    },
    traffic: { pageViews14d: traffic },
    performance: {
      database: "connected",
      uptimeSeconds: Math.floor(process.uptime()),
      heapUsedBytes: process.memoryUsage().heapUsed,
    },
    daily: [...dayMap.values()],
    weekly: [...weeklyMap.values()],
    securityEvents: securityEvents.map((event) => ({
      id: event._id.toString(),
      type: event.type,
      email: event.email,
      ipAddress: event.ipAddress,
      details: event.details,
      createdAt: event.createdAt.toISOString(),
    })),
    audits: audits.map((item) => ({
      id: item._id.toString(),
      actor: item.actorId?.name || "Former administrator",
      actorRole: item.actorRole,
      action: item.action,
      targetType: item.targetType,
      targetId: item.targetId,
      createdAt: item.createdAt.toISOString(),
    })),
    computedAt: now.toISOString(),
  };
}
