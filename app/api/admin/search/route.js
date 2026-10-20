import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/admin";
import {
  ADMIN_GLOBAL_SEARCH_CATEGORIES,
  buildGlobalSearchFilter,
  validateGlobalSearch,
} from "@/lib/admin-search";
import DepositRequest from "@/models/DepositRequest";
import PaymentVerification from "@/models/PaymentVerification";
import RegistrationPackage from "@/models/RegistrationPackage";
import SupportTicket from "@/models/SupportTicket";
import WithdrawalRequest from "@/models/WithdrawalRequest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 5;

async function searchModel(model, filter, page, select, populate) {
  const query = model.find(filter).select(select).sort({ createdAt: -1 })
    .skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE);
  if (populate) query.populate("userId", "name email");
  const [items, total] = await Promise.all([query.lean(), model.countDocuments(filter)]);
  return {
    total,
    page,
    pages: Math.ceil(total / PAGE_SIZE),
    items,
  };
}

function safeUser(user) {
  return user ? { name: user.name || "", email: user.email || "" } : null;
}

function serializeSearchResult(category, item) {
  const common = {
    id: item._id.toString(),
    createdAt: item.createdAt?.toISOString() || "",
  };
  if (category === "withdrawals") {
    return { ...common, title: safeUser(item.userId)?.name || "Withdrawal request", user: safeUser(item.userId), status: item.status, detail: `${item.provider} · payout reference ${item.payoutReference || "not set"}`, target: "withdrawals" };
  }
  if (category === "registrationPayments" || category === "packageRequests") {
    return { ...common, title: safeUser(item.userId)?.name || "Payment request", user: safeUser(item.userId), status: item.status, detail: `${item.packageName || "Package"} · ${item.transactionId} · PKR ${(item.packagePriceMinor / 100).toFixed(2)}`, target: category === "packageRequests" ? "package-requests" : "payment-approvals" };
  }
  if (category === "deposits") {
    return { ...common, title: safeUser(item.userId)?.name || "Deposit request", user: safeUser(item.userId), status: item.status, detail: `${item.transactionId} · PKR ${(item.amountMinor / 100).toFixed(2)}`, target: "deposit-approvals" };
  }
  if (category === "support") {
    return { ...common, title: item.subject, user: safeUser(item.userId), status: item.status, detail: (item.message || "").slice(0, 180), target: "support" };
  }
  return { ...common, title: item.name, status: item.active ? "active" : "inactive", detail: item.description || "", target: "packages" };
}

export async function GET(request) {
  try {
    const auth = await requireStaff(request, ["superAdmin", "helpAdmin"]);
    if (auth.response) return auth.response;
    const params = new URL(request.url).searchParams;
    const search = (params.get("q") || "").trim();
    const pageText = params.get("page") || "1";
    const page = Number(pageText);
    if (!validateGlobalSearch(search) || !/^\d+$/.test(pageText) || !Number.isSafeInteger(page) || page < 1 || page > 10000) {
      return NextResponse.json({ error: "Enter at least two search characters and a valid page." }, { status: 400 });
    }

    const filter = buildGlobalSearchFilter(search);
    const categories = ADMIN_GLOBAL_SEARCH_CATEGORIES.filter((item) =>
      !item.superAdminOnly || auth.user.role === "superAdmin",
    );
    const results = await Promise.all(categories.map(async ({ id }) => {
      let found;
      if (id === "withdrawals") {
        found = await searchModel(WithdrawalRequest, filter, page, "userId amountMinor provider status payoutReference createdAt", true);
      } else if (id === "registrationPayments" || id === "packageRequests") {
        const purchaseType = id === "packageRequests" ? "renewal" : { $in: ["registration", null] };
        found = await searchModel(PaymentVerification, { ...filter, purchaseType }, page, "userId packageName packagePriceMinor transactionId status createdAt", true);
      } else if (id === "deposits") {
        found = await searchModel(DepositRequest, filter, page, "userId amountMinor transactionId status createdAt", true);
      } else if (id === "support") {
        found = await searchModel(SupportTicket, filter, page, "userId subject message status createdAt", true);
      } else {
        found = await searchModel(RegistrationPackage, filter, page, "name description active createdAt", false);
      }
      return {
        id,
        label: categories.find((category) => category.id === id)?.label || id,
        total: found.total,
        page: found.page,
        pages: found.pages,
        items: found.items.map((item) => serializeSearchResult(id, item)),
      };
    }));
    return NextResponse.json({ query: search, categories: results }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof mongoose.Error) {
      console.error("Admin global search database query failed:", error.name);
    } else {
      console.error("Admin global search failed:", error?.name || "UnknownError");
    }
    return NextResponse.json({ error: "Could not search admin records." }, { status: 500 });
  }
}
