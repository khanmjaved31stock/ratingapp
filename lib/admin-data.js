import mongoose from "mongoose";
import User from "@/models/User";
import WalletBalance from "@/models/WalletBalance";
import RegistrationPackage from "@/models/RegistrationPackage";
import { buildAdminUserSearchFilter } from "@/lib/admin-search";

const PAGE_SIZE = 50;
const ADMIN_MANAGED_ROLES = ["user", "helpAdmin", "moderator"];

export function isValidUserCursor(cursor) {
  return (
    !cursor ||
    (mongoose.isValidObjectId(cursor) &&
      new mongoose.Types.ObjectId(cursor).toString() === cursor)
  );
}

export async function getAdminUsersPage({
  cursor = null,
  search = "",
  role = "",
  status = "",
  sort = "newest",
} = {}) {
  const filter = {
    role: role && ADMIN_MANAGED_ROLES.includes(role)
      ? role
      : { $in: ADMIN_MANAGED_ROLES },
    deletedAt: null,
  };
  if (status === "active") filter.active = true;
  if (status === "disabled") filter.active = false;
  const searchFilter = buildAdminUserSearchFilter(search);
  if (searchFilter) {
    if (searchFilter._id) filter._id = searchFilter._id;
    else filter.$or = searchFilter.$or;
  }
  if (cursor) {
    filter._id = {
      [sort === "oldest" ? "$gt" : "$lt"]: new mongoose.Types.ObjectId(cursor),
    };
  }

  const sortOrder = sort === "oldest" ? 1 : -1;
  const results = await User.find(filter)
    .select("name email whatsappPhone role active suspended emailVerified createdAt paymentStatus packageId packageActivatedAt packageExpiresAt")
    .sort({ _id: sortOrder })
    .limit(PAGE_SIZE + 1)
    .lean();
  const hasMore = results.length > PAGE_SIZE;
  const users = results.slice(0, PAGE_SIZE);
  const userIds = users.map((user) => user._id);
  const packageIds = [...new Set(users.map((user) => user.packageId?.toString()).filter(Boolean))];
  const [balances, packages] = await Promise.all([
    WalletBalance.find({ userId: { $in: userIds } }).select("userId balanceMinor").lean(),
    RegistrationPackage.find({ _id: { $in: packageIds } }).select("name").lean(),
  ]);
  const balancesByUser = new Map(balances.map((item) => [item.userId.toString(), item.balanceMinor]));
  const packageNames = new Map(packages.map((item) => [item._id.toString(), item.name]));

  return {
    users: users.map((user) => ({
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      whatsappPhone: user.whatsappPhone || "",
      role: user.role,
      active: user.active,
      suspended: user.suspended,
      emailVerified: user.emailVerified,
      paymentStatus: user.paymentStatus,
      packageName: packageNames.get(user.packageId?.toString()) || "",
      balanceMinor: balancesByUser.get(user._id.toString()) || 0,
      packageActivatedAt: user.packageActivatedAt?.toISOString() || null,
      packageExpiresAt: user.packageExpiresAt?.toISOString() || null,
      createdAt: user.createdAt.toISOString(),
    })),
    hasMore,
    nextCursor: hasMore ? users.at(-1)._id.toString() : null,
  };
}
