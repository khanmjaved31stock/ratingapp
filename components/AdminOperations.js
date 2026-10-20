"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const card = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7";
const field = "w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm";
const money = (value = 0) =>
  new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR" }).format(value / 100);

async function request(path, method = "GET", body) {
  const response = await fetch(path, {
    method,
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "The request could not be completed.");
  return result;
}

function Metric({ label, value, detail }) {
  return <article className="rounded-2xl border border-white/60 bg-white/85 p-5 shadow-sm backdrop-blur"><p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold tracking-tight text-forest">{value}</p>{detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}</article>;
}

function GoalMetric({ label, current, target, percent, format = (value) => value }) {
  return (
    <article className="flex items-center gap-4 rounded-xl border border-slate-200 p-4">
      <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full p-1" style={{ background: `conic-gradient(#0f766e ${percent}%, #e2e8f0 ${percent}% 100%)` }}>
        <div className="grid h-full w-full place-items-center rounded-full bg-white text-xs font-bold text-forest">{percent}%</div>
      </div>
      <div><p className="text-sm font-semibold">{label}</p><p className="mt-1 text-sm text-slate-600">{format(current)} / {target ? format(target) : "No goal"}</p></div>
    </article>
  );
}

function QueueItem({ title, subline, amount, status, children }) {
  return <article className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap justify-between gap-3"><div><h3 className="font-semibold">{title}</h3><p className="mt-1 break-all text-sm text-slate-500">{subline}</p></div><div className="text-right"><p className="font-semibold">{amount}</p><p className="mt-1 text-xs capitalize text-slate-500">{status}</p></div></div>{children}</article>;
}

function localDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function getWithdrawalQueueUrl(filters, page) {
  const params = new URLSearchParams({ page: String(page), limit: "25" });
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  return `/api/admin/withdrawals?${params}`;
}

export default function AdminOperations({ role }) {
  const isSuper = role === "superAdmin";
  const [overview, setOverview] = useState(null);
  const [payments, setPayments] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [withdrawalPagination, setWithdrawalPagination] = useState({ page: 1, pages: 0, total: 0 });
  const [withdrawalPage, setWithdrawalPage] = useState(1);
  const [withdrawalFilters, setWithdrawalFilters] = useState({ q: "", status: "all", provider: "", from: "", to: "" });
  const [revealedWithdrawalDetails, setRevealedWithdrawalDetails] = useState({});
  const [tickets, setTickets] = useState([]);
  const [requestNotifications, setRequestNotifications] = useState(null);
  const [requestNotificationsLoading, setRequestNotificationsLoading] = useState(true);
  const [requestNotificationsError, setRequestNotificationsError] = useState("");
  const [openingRequestCategory, setOpeningRequestCategory] = useState("");
  const [packages, setPackages] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [settings, setSettings] = useState(null);
  const [security, setSecurity] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [banners, setBanners] = useState([]);
  const [branding, setBranding] = useState({ userLogoUrl: "", adminLogoUrl: "" });
  const [referralNetwork, setReferralNetwork] = useState(null);
  const [ledger, setLedger] = useState({ transactions: [], pages: 0, total: 0 });
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerFilters, setLedgerFilters] = useState({ q: "", type: "", status: "", from: "", to: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [packageForm, setPackageForm] = useState({ name: "", description: "", price: "", validityDays: "30", dailyEarningLimit: "0", dailyTaskQuota: "0", perTaskEarnings: "1.00", minimumWithdrawal: "1.00", maximumWithdrawal: "", withdrawalFeeBracketsJson: '[{"minimumAmountMinor":100,"maximumAmountMinor":null,"basisPoints":0}]', benefits: "", recommendedPackageId: "", eligibleReferralTiers: "", sortOrder: "0" });
  const [accountForm, setAccountForm] = useState({ provider: "easypaisa", displayName: "", accountTitle: "", accountNumber: "", bankName: "", instructions: "", sortOrder: "0" });
  const [accountQr, setAccountQr] = useState(null);
  const [blockForm, setBlockForm] = useState({ address: "", reason: "" });
  const [bannerForm, setBannerForm] = useState({ title: "", slot: "header", href: "", startsAt: "", endsAt: "" });
  const [bannerImage, setBannerImage] = useState(null);
  const [expenseForm, setExpenseForm] = useState({ amount: "", description: "" });
  const [taskImageUploading, setTaskImageUploading] = useState(false);

  const reload = useCallback(async () => {
    try {
      if (role === "moderator") {
        const support = await request("/api/support");
        setTickets(support.tickets || []);
        return;
      }
      const [analytics, paymentQueue, payoutQueue, support] = await Promise.all([
        request("/api/admin/analytics"),
        request("/api/admin/payments"),
        request(getWithdrawalQueueUrl(withdrawalFilters, withdrawalPage)),
        request("/api/support"),
      ]);
      setOverview(analytics);
      setPayments(paymentQueue.payments || []);
      setWithdrawals(payoutQueue.withdrawals || []);
      setWithdrawalPagination(payoutQueue);
      setTickets(support.tickets || []);
      const depositQueue = await request("/api/admin/deposits");
      setDeposits(depositQueue.deposits || []);
      if (isSuper) {
        const [packageResult, accountResult, settingResult, securityResult, sessionResult, bannerResult, referralResult, brandingResult] = await Promise.all([
          request("/api/admin/packages"),
          request("/api/admin/payment-accounts"),
          request("/api/admin/settings"),
          request("/api/admin/security"),
          request("/api/admin/sessions"),
          request("/api/admin/banners"),
          request("/api/admin/referrals"),
          request("/api/admin/branding"),
        ]);
        setPackages(packageResult.packages || []);
        setAccounts(accountResult.accounts || []);
        setSettings(settingResult.settings);
        setSecurity(securityResult);
        setSessions(sessionResult.sessions || []);
        setBanners(bannerResult.banners || []);
        setReferralNetwork(referralResult);
        setBranding(brandingResult);
      }
    } catch (loadError) {
      setError(loadError.message || "Could not load the operations console.");
    }
  }, [isSuper, role, withdrawalFilters, withdrawalPage]);
  useEffect(() => {
    let cancelled = false;
    const staffRequests = isSuper || role === "helpAdmin"
      ? Promise.all([
          request("/api/admin/analytics"),
          request("/api/admin/payments"),
          request("/api/admin/withdrawals"),
          request("/api/support"),
        ]).then(([analytics, paymentQueue, payoutQueue, support]) => ({
          analytics,
          paymentQueue,
          payoutQueue,
          support,
        }))
      : request("/api/support").then((support) => ({ support }));
    staffRequests
      .then(async ({ analytics, paymentQueue, payoutQueue, support }) => {
        if (cancelled) return;
        if (analytics) setOverview(analytics);
        if (paymentQueue) setPayments(paymentQueue.payments || []);
        if (payoutQueue) {
          setWithdrawals(payoutQueue.withdrawals || []);
          setWithdrawalPagination(payoutQueue);
        }
        setTickets(support.tickets || []);
        if (isSuper || role === "helpAdmin") {
          const depositQueue = await request("/api/admin/deposits");
          if (cancelled) return;
          setDeposits(depositQueue.deposits || []);
        }
        if (isSuper) {
          const [packageResult, accountResult, settingResult, securityResult, sessionResult, bannerResult, referralResult, brandingResult] = await Promise.all([
            request("/api/admin/packages"),
            request("/api/admin/payment-accounts"),
            request("/api/admin/settings"),
            request("/api/admin/security"),
            request("/api/admin/sessions"),
            request("/api/admin/banners"),
            request("/api/admin/referrals"),
            request("/api/admin/branding"),
          ]);
          if (cancelled) return;
          setPackages(packageResult.packages || []);
          setAccounts(accountResult.accounts || []);
          setSettings(settingResult.settings);
          setSecurity(securityResult);
          setSessions(sessionResult.sessions || []);
          setBanners(bannerResult.banners || []);
          setReferralNetwork(referralResult);
          setBranding(brandingResult);
        }
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError.message || "Could not load the operations console.");
      });
    return () => { cancelled = true; };
  }, [role, isSuper]);
  useEffect(() => {
    if (!isSuper && role !== "helpAdmin") return undefined;
    let cancelled = false;
    const loadNotifications = async () => {
      try {
        const result = await request("/api/admin/request-notifications");
        if (!cancelled) {
          setRequestNotifications(result.categories || []);
          setRequestNotificationsError("");
        }
      } catch (loadError) {
        if (!cancelled) setRequestNotificationsError(loadError.message || "Could not load request notifications.");
      } finally {
        if (!cancelled) setRequestNotificationsLoading(false);
      }
    };
    loadNotifications();
    const interval = window.setInterval(loadNotifications, 30000);
    window.addEventListener("ratewell:admin-requests-changed", loadNotifications);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("ratewell:admin-requests-changed", loadNotifications);
    };
  }, [isSuper, role]);
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const result = await request(getWithdrawalQueueUrl(withdrawalFilters, withdrawalPage));
        if (!cancelled) {
          setWithdrawals(result.withdrawals || []);
          setWithdrawalPagination(result);
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError.message || "Could not load withdrawals.");
      }
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [withdrawalFilters, withdrawalPage]);
  useEffect(() => {
    if (!isSuper) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLedgerLoading(true);
      try {
        const params = new URLSearchParams({ page: String(ledgerPage), limit: "25" });
        for (const [key, value] of Object.entries(ledgerFilters)) {
          if (value) params.set(key, value);
        }
        const result = await request(`/api/admin/financial?${params}`);
        if (!cancelled) setLedger(result);
      } catch (loadError) {
        if (!cancelled) setError(loadError.message || "Could not load financial ledger.");
      } finally {
        if (!cancelled) setLedgerLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isSuper, ledgerFilters, ledgerPage]);

  function exportLedger() {
    const params = new URLSearchParams({ export: "csv" });
    for (const [key, value] of Object.entries(ledgerFilters)) {
      if (value) params.set(key, value);
    }
    window.location.assign(`/api/admin/financial?${params}`);
  }
  useEffect(() => {
    if (!error && !notice) return;
    const timer = window.setTimeout(() => {
      setError("");
      setNotice("");
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [error, notice]);

  async function mutate(path, method, body, successMessage) {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const result = await request(path, method, body);
      setNotice(result.message || successMessage);
      await reload();
      return true;
    } catch (mutationError) {
      setError(mutationError.message || "The requested change failed.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function openRequestCategory(category) {
    setOpeningRequestCategory(category);
    setRequestNotificationsError("");
    try {
      await request("/api/admin/request-notifications", "POST", { category });
      const result = await request("/api/admin/request-notifications");
      setRequestNotifications(result.categories || []);
      const target = result.categories?.find((item) => item.id === category)?.target;
      if (target) document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
      setNotice(`${result.categories?.find((item) => item.id === category)?.label || "Requests"} marked as read.`);
    } catch (loadError) {
      setRequestNotificationsError(loadError.message || "Could not open request notifications.");
    } finally {
      setOpeningRequestCategory("");
    }
  }

  async function reviewPayment(payment, decision) {
    const note = decision === "rejected" ? window.prompt("Reason for rejection (shown to the applicant):", "") : "";
    if (decision === "rejected" && note === null) return;
    await mutate("/api/admin/payments", "PATCH", { id: payment.id, decision, reviewNote: note || "" }, `Payment ${decision}.`);
  }
  async function reviewDeposit(item, decision) {
    const note = decision === "rejected" ? window.prompt("Reason for rejection (shown to the user):", "") : "";
    if (decision === "rejected" && note === null) return;
    await mutate("/api/admin/deposits", "PATCH", { id: item.id, decision, reviewNote: note || "" }, `Deposit ${decision}.`);
  }
  async function reviewWithdrawal(item, decision) {
    const reference = decision === "paid" ? window.prompt("Optional payout transaction/reference ID:", "") : "";
    if (decision === "paid" && reference === null) return;
    const reviewNote = window.prompt(
      decision === "rejected" ? "Reason for rejection (required):" : "Admin note (optional):",
      "",
    );
    if (reviewNote === null) return;
    if (decision === "rejected" && !reviewNote.trim()) {
      setError("Enter a rejection reason before rejecting this withdrawal.");
      return;
    }
    const saved = await mutate("/api/admin/withdrawals", "PATCH", { id: item.id, decision, payoutReference: reference || "", reviewNote: reviewNote || "" }, `Withdrawal marked ${decision}.`);
    if (saved) {
      setRevealedWithdrawalDetails((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
    }
  }
  async function revealWithdrawalDetails(item) {
    setError("");
    try {
      const result = await request(`/api/admin/withdrawals?revealId=${encodeURIComponent(item.id)}`);
      setRevealedWithdrawalDetails((current) => ({ ...current, [item.id]: result.payoutDetails }));
    } catch (revealError) {
      setError(revealError.message || "Could not reveal payout details.");
    }
  }
  async function createPackage(event) {
    event.preventDefault();
    if (!Number.isFinite(Number(packageForm.perTaskEarnings)) || Number(packageForm.perTaskEarnings) < 0.01) {
      setError("Per-task earnings must be at least PKR 0.01.");
      return;
    }
    let withdrawalFeeBrackets;
    try {
      withdrawalFeeBrackets = JSON.parse(packageForm.withdrawalFeeBracketsJson);
    } catch {
      setError("Withdrawal fee brackets must be valid JSON.");
      return;
    }
    const body = {
      name: packageForm.name,
      description: packageForm.description,
      priceMinor: Math.round(Number(packageForm.price) * 100),
      validityDays: Number(packageForm.validityDays),
      dailyEarningLimitMinor: Math.round(Number(packageForm.dailyEarningLimit) * 100),
      dailyTaskQuota: Number(packageForm.dailyTaskQuota),
      dailyTaskLimit: Number(packageForm.dailyTaskQuota),
      perTaskEarningsMinor: Math.round(Number(packageForm.perTaskEarnings) * 100),
      minimumWithdrawalMinor: Math.round(Number(packageForm.minimumWithdrawal) * 100),
      maximumWithdrawalMinor: packageForm.maximumWithdrawal === ""
        ? null
        : Math.round(Number(packageForm.maximumWithdrawal) * 100),
      withdrawalFeeBrackets,
      sortOrder: Number(packageForm.sortOrder),
      benefits: packageForm.benefits.split("\n").map((item) => item.trim()).filter(Boolean),
      recommendedPackageId: packageForm.recommendedPackageId || "",
      eligibleReferralTiers: packageForm.eligibleReferralTiers.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean),
    };
    const saved = await mutate("/api/admin/packages", "POST", body, "Registration package created.");
    if (saved) setPackageForm({ name: "", description: "", price: "", validityDays: "30", dailyEarningLimit: "0", dailyTaskQuota: "0", perTaskEarnings: "1.00", minimumWithdrawal: "1.00", maximumWithdrawal: "", withdrawalFeeBracketsJson: '[{"minimumAmountMinor":100,"maximumAmountMinor":null,"basisPoints":0}]', benefits: "", recommendedPackageId: "", eligibleReferralTiers: "", sortOrder: "0" });
  }
  async function createAccount(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const formData = new FormData();
      Object.entries(accountForm).forEach(([key, value]) => formData.set(key, value));
      if (accountQr) formData.set("proof", accountQr);
      const response = await fetch("/api/admin/payment-accounts", { method: "POST", body: formData });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not create payment account.");
      setNotice("Payment account created.");
      setAccountForm({ provider: "easypaisa", displayName: "", accountTitle: "", accountNumber: "", bankName: "", instructions: "", sortOrder: "0" });
      setAccountQr(null);
      await reload();
    } catch (accountError) {
      setError(accountError.message || "Could not create payment account.");
    } finally {
      setBusy(false);
    }
  }
  async function uploadAccountQr(item, file) {
    if (!file) return;
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const formData = new FormData();
      for (const key of ["id", "provider", "displayName", "accountTitle", "accountNumber", "bankName", "instructions", "sortOrder", "active"]) {
        formData.set(key, String(item[key] ?? ""));
      }
      formData.set("proof", file);
      const response = await fetch("/api/admin/payment-accounts", { method: "PATCH", body: formData });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not upload QR image.");
      setNotice("Payment QR image updated.");
      await reload();
    } catch (uploadError) {
      setError(uploadError.message || "Could not upload QR image.");
    } finally {
      setBusy(false);
    }
  }
  async function createBanner(event) {
    event.preventDefault();
    if (!bannerImage) {
      setError("Choose an image for the banner.");
      return;
    }
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const formData = new FormData();
      formData.set("title", bannerForm.title);
      formData.set("slot", bannerForm.slot);
      formData.set("href", bannerForm.href);
      if (bannerForm.startsAt) formData.set("startsAt", new Date(bannerForm.startsAt).toISOString());
      if (bannerForm.endsAt) formData.set("endsAt", new Date(bannerForm.endsAt).toISOString());
      formData.set("proof", bannerImage);
      const response = await fetch("/api/admin/banners", { method: "POST", body: formData });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not create banner.");
      setNotice(result.message);
      setBannerForm({ title: "", slot: "header", href: "", startsAt: "", endsAt: "" });
      setBannerImage(null);
      await reload();
    } catch (uploadError) {
      setError(uploadError.message || "Could not upload banner.");
    } finally {
      setBusy(false);
    }
  }
  async function editPackage(item) {
    const name = window.prompt("Package name:", item.name);
    if (name === null) return;
    const price = window.prompt("Price in PKR:", String(item.priceMinor / 100));
    if (price === null) return;
    const validityDays = window.prompt("Package validity in days (1-365):", String(item.validityDays || 30));
    if (validityDays === null) return;
    const dailyEarningLimit = window.prompt("Daily earning limit in PKR (0 = unlimited):", String((item.dailyEarningLimitMinor || 0) / 100));
    if (dailyEarningLimit === null) return;
    const dailyTaskQuota = window.prompt("Daily task quota (0 = unlimited):", String(item.dailyTaskQuota || 0));
    if (dailyTaskQuota === null) return;
    const perTaskEarnings = window.prompt("Per-task earnings in PKR:", String((item.perTaskEarningsMinor || 0) / 100));
    if (perTaskEarnings === null) return;
    const minimumWithdrawal = window.prompt("Minimum withdrawal in PKR:", String((item.minimumWithdrawalMinor ?? 100) / 100));
    if (minimumWithdrawal === null) return;
    const maximumWithdrawal = window.prompt("Maximum withdrawal in PKR (blank = unlimited):", item.maximumWithdrawalMinor === null ? "" : String(item.maximumWithdrawalMinor / 100));
    if (maximumWithdrawal === null) return;
    const withdrawalFeeBracketsJson = window.prompt(
      "Withdrawal fee brackets JSON (amounts in paisa; 100 basis points = 1%):",
      JSON.stringify(item.withdrawalFeeBrackets || [{ minimumAmountMinor: 100, maximumAmountMinor: null, basisPoints: 0 }]),
    );
    if (withdrawalFeeBracketsJson === null) return;
    let withdrawalFeeBrackets;
    try {
      withdrawalFeeBrackets = JSON.parse(withdrawalFeeBracketsJson);
    } catch {
      setError("Withdrawal fee brackets must be valid JSON.");
      return;
    }
    const description = window.prompt("Package description:", item.description);
    if (description === null) return;
    const benefits = window.prompt("Benefits, one per line:", item.benefits.join("\n"));
    if (benefits === null) return;
    const candidates = packages.filter((pkg) => pkg.id !== item.id && pkg.active);
    const recommendationPrompt = candidates.map((pkg) => `${pkg.id} = ${pkg.name}`).join("\n");
    const recommendedPackageId = window.prompt(
      `Recommended renewal package ID (blank for none):\n${recommendationPrompt}`,
      item.recommendedPackageId || "",
    );
    if (recommendedPackageId === null) return;
    const eligibleReferralTiers = window.prompt(
      "Eligible referral tiers, comma-separated (blank = all tiers):",
      (item.eligibleReferralTiers || []).join(", "),
    );
    if (eligibleReferralTiers === null) return;
    const sortOrder = window.prompt("Display order (0 or greater):", String(item.sortOrder || 0));
    if (sortOrder === null) return;
    await mutate("/api/admin/packages", "PATCH", {
      ...item,
      name,
      description,
      priceMinor: Math.round(Number(price) * 100),
      validityDays: Number(validityDays),
      dailyEarningLimitMinor: Math.round(Number(dailyEarningLimit) * 100),
      dailyTaskQuota: Number(dailyTaskQuota),
      dailyTaskLimit: Number(dailyTaskQuota),
      perTaskEarningsMinor: Math.round(Number(perTaskEarnings) * 100),
      minimumWithdrawalMinor: Math.round(Number(minimumWithdrawal) * 100),
      maximumWithdrawalMinor: maximumWithdrawal.trim() === ""
        ? null
        : Math.round(Number(maximumWithdrawal) * 100),
      withdrawalFeeBrackets,
      benefits: benefits.split("\n").map((value) => value.trim()).filter(Boolean),
      recommendedPackageId: recommendedPackageId.trim(),
      eligibleReferralTiers: eligibleReferralTiers.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean),
      sortOrder: Number(sortOrder),
    }, "Package updated.");
  }
  async function editAccount(item) {
    const accountNumber = window.prompt("Payment account number:", item.accountNumber);
    if (accountNumber === null) return;
    const accountTitle = window.prompt("Account title:", item.accountTitle);
    if (accountTitle === null) return;
    const bankName = window.prompt("Bank name (if applicable):", item.bankName || "");
    if (bankName === null) return;
    const instructions = window.prompt("Payment instructions:", item.instructions || "");
    if (instructions === null) return;
    const sortOrder = window.prompt("Display order (0 or greater):", String(item.sortOrder || 0));
    if (sortOrder === null) return;
    await mutate("/api/admin/payment-accounts", "PATCH", {
      ...item,
      accountNumber,
      accountTitle,
      bankName,
      instructions,
      sortOrder: Number(sortOrder),
    }, "Payment account updated.");
  }
  async function editBanner(item) {
    const title = window.prompt("Banner title:", item.title);
    if (title === null) return;
    const href = window.prompt("Destination URL (HTTPS or relative):", item.href);
    if (href === null) return;
    await mutate("/api/admin/banners", "PATCH", { ...item, title, href }, "Banner updated.");
  }
  async function saveSettings(event) {
    event.preventDefault();
    await mutate("/api/admin/settings", "PATCH", {
      ...settings,
      ratingRewardMinor: Math.round(Number(settings.ratingRewardMinor)),
      minimumWithdrawalMinor: Math.round(Number(settings.minimumWithdrawalMinor)),
      withdrawalFeeFixedMinor: Math.round(Number(settings.withdrawalFeeFixedMinor || 0)),
      withdrawalFeeBasisPoints: Number(settings.withdrawalFeeBasisPoints || 0),
      referralLevels: settings.referralLevels.map((item) => ({ level: Number(item.level), basisPoints: Number(item.basisPoints) })),
      reviewTasks: {
        ...settings.reviewTasks,
        rewardMinor: Math.round(Number(settings.reviewTasks.rewardMinor)),
        minimumSeconds: Number(settings.reviewTasks.minimumSeconds),
        cooldownSeconds: Number(settings.reviewTasks.cooldownSeconds),
        dailyLimit: Number(settings.reviewTasks.dailyLimit),
        userTotalLimit: Number(settings.reviewTasks.userTotalLimit),
        totalLimit: Number(settings.reviewTasks.totalLimit),
      },
      goals: {
        monthlyRevenueMinor: Number(settings.goals.monthlyRevenueMinor),
        activeUsers: Number(settings.goals.activeUsers),
        monthlyRatings: Number(settings.goals.monthlyRatings),
        conversionPercent: Number(settings.goals.conversionPercent),
      },
      packagePolicy: {
        validityDays: Number(settings.packagePolicy.validityDays),
        renewalCooldownDays: Number(settings.packagePolicy.renewalCooldownDays),
        requireRecommendedDuringCooldown: settings.packagePolicy.requireRecommendedDuringCooldown,
      },
      marqueeNews: {
        ...settings.marqueeNews,
        startsAt: settings.marqueeNews.startsAt ? new Date(settings.marqueeNews.startsAt).toISOString() : null,
        endsAt: settings.marqueeNews.endsAt ? new Date(settings.marqueeNews.endsAt).toISOString() : null,
      },
      referralMilestones: settings.referralMilestones.map((item) => ({
        ...item,
        directConversions: Number(item.directConversions),
        indirectConversions: Number(item.indirectConversions),
        rewardMinor: Number(item.rewardMinor),
        windowSeconds: Number(item.windowSeconds || 0),
      })),
    }, "Portal settings saved.");
  }
  async function uploadReviewTaskImage(file) {
    if (!file) return;
    setError("");
    setNotice("");
    setTaskImageUploading(true);
    try {
      const formData = new FormData();
      formData.set("proof", file);
      const response = await fetch("/api/admin/review-task-media", { method: "POST", body: formData });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not upload task image.");
      setSettings((current) => ({
        ...current,
        reviewTasks: {
          ...current.reviewTasks,
          mediaImageUrl: result.imageUrl,
        },
      }));
      setNotice(result.message);
    } catch (uploadError) {
      setError(uploadError.message || "Could not upload task image.");
    } finally {
      setTaskImageUploading(false);
    }
  }
  async function uploadLogo(type, file) {
    if (!file) return;
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const form = new FormData();
      form.set("type", type);
      form.set("logo", file);
      const response = await fetch("/api/admin/branding", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not update logo.");
      setBranding((current) => ({ ...current, [type === "user" ? "userLogoUrl" : "adminLogoUrl"]: result.imageUrl }));
      setNotice(result.message);
    } catch (uploadError) {
      setError(uploadError.message || "Could not update logo.");
    } finally {
      setBusy(false);
    }
  }
  function addMilestone() {
    const title = window.prompt("Milestone name:");
    if (!title?.trim()) return;
    const directConversions = Number(window.prompt("Required approved direct referrals:", "1"));
    const indirectConversions = Number(window.prompt("Required approved indirect referrals:", "0"));
    const windowSeconds = Number(window.prompt("Time window in seconds (0 = lifetime):", "0"));
    const rewardMinor = Math.round(Number(window.prompt("Cash reward in paisa (0 for no cash reward):", "0")));
    const tier = window.prompt("Tier name (optional):", "");
    if (![directConversions, indirectConversions, windowSeconds, rewardMinor].every(Number.isSafeInteger) ||
      directConversions < 0 || indirectConversions < 0 || windowSeconds < 0 || windowSeconds > 2592000 || rewardMinor < 0 || !tier && rewardMinor === 0) {
      setError("Enter valid referral milestone thresholds and a cash reward or tier.");
      return;
    }
    const slug = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 26);
    setSettings((current) => ({
      ...current,
      referralMilestones: [...current.referralMilestones, {
        id: `${slug || "milestone"}-${Date.now().toString(36)}`,
        title: title.trim(),
        directConversions,
        indirectConversions,
        windowSeconds,
        rewardMinor,
        tier: tier?.trim() || "",
      }],
    }));
  }
  async function recordExpense(event) {
    event.preventDefault();
    const result = await mutate("/api/admin/financial", "POST", {
      amountMinor: Math.round(Number(expenseForm.amount) * 100),
      description: expenseForm.description,
    }, "Expense recorded.");
    if (result) setExpenseForm({ amount: "", description: "" });
  }
  const pendingPayments = payments.filter((item) => item.status === "pending");
  const pendingRegistrationPayments = pendingPayments.filter((item) => !item.purchaseType || item.purchaseType === "registration");
  const pendingRenewals = pendingPayments.filter((item) => item.purchaseType === "renewal");
  const openWithdrawals = withdrawals.filter((item) => ["pending", "processing"].includes(item.status));
  const openTickets = tickets.filter((ticket) => ["open", "inProgress"].includes(ticket.status));
  const notificationDetail = (category, item) => {
    if (category === "payment" || category === "package") return `${item.packageName || "Package"} · ${item.transactionId || "No reference"}`;
    if (category === "deposit") return `${money(item.amountMinor)} · ${item.reference || "No reference"}`;
    if (category === "withdrawal") return `${money(item.amountMinor)} · ${item.provider || "Payout"}`;
    if (category === "task") return `Reward ${money(item.amountMinor)} · awaiting task review`;
    if (category === "support") return `${item.subject || "Support message"} · ${(item.message || "").slice(0, 90)}`;
    return "Registration details submitted; awaiting payment proof.";
  };
  async function refreshRequestNotifications() {
    try {
      const result = await request("/api/admin/request-notifications");
      setRequestNotifications(result.categories || []);
      setRequestNotificationsError("");
    } catch (loadError) {
      setRequestNotificationsError(loadError.message || "Could not refresh request notifications.");
    }
  }

  return <div className="space-y-7">
    {(error || notice) && <div className="fixed right-4 top-4 z-[120] grid w-[min(26rem,calc(100vw-2rem))] gap-2" aria-live="polite">
      {error && <div role="alert" className="flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-white p-4 text-sm text-red-800 shadow-xl"><span>{error}</span><button type="button" aria-label="Dismiss error" onClick={() => setError("")} className="font-bold">×</button></div>}
      {notice && <div role="status" className="flex items-start justify-between gap-3 rounded-xl border border-emerald-200 bg-white p-4 text-sm text-emerald-900 shadow-xl"><span>{notice}</span><button type="button" aria-label="Dismiss notification" onClick={() => setNotice("")} className="font-bold">×</button></div>}
    </div>}

    {(isSuper || role === "helpAdmin") && <section aria-labelledby="request-notifications-title" className={card}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div><h2 id="request-notifications-title" className="text-xl font-semibold">New user requests</h2><p className="mt-1 text-sm text-slate-500">Unread counts are personal to your admin account. Pending business status remains separate.</p></div>
        <button type="button" onClick={refreshRequestNotifications} className="text-sm font-semibold text-forest underline">Refresh</button>
      </div>
      {requestNotificationsError && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{requestNotificationsError}</p>}
      {requestNotificationsLoading && !requestNotifications ? <p role="status" className="text-sm text-slate-500">Loading request notifications…</p> : requestNotifications?.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {requestNotifications.map((category) => <a href={`#${category.target}`} key={category.id} onClick={(event) => { event.preventDefault(); if (!openingRequestCategory) openRequestCategory(category.id); }} aria-disabled={Boolean(openingRequestCategory)} className="block rounded-xl border border-slate-200 p-4 text-left transition hover:border-forest focus:outline-none focus:ring-2 focus:ring-forest">
          <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">{category.label}</h3><span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800">{category.unread} unread</span></div>
          {openingRequestCategory === category.id && <span role="status" className="mt-1 block text-xs text-slate-500">Opening request list…</span>}
          <p className="mt-1 text-xs text-slate-500">{category.total} pending</p>
          <ul className="mt-3 space-y-2">{category.previews.length ? category.previews.slice(0, 3).map((item) => <li key={item.id} className="border-t border-slate-100 pt-2 text-xs">
            <span className={`block font-medium ${item.isRead ? "text-slate-600" : "text-slate-900"}`}>{item.user?.name || "User"}{!item.isRead && <span className="ml-2 font-normal text-amber-700">Unread</span>}</span>
            <span className="block truncate text-slate-500">{notificationDetail(category.id, item)}</span>
            <span className="block text-slate-400">{new Date(item.createdAt).toLocaleString()}</span>
          </li>) : <li className="border-t border-slate-100 pt-2 text-xs text-slate-500">No pending requests.</li>}</ul>
        </a>)}
      </div> : <p className="text-sm text-slate-500">No request categories are available.</p>}
    </section>}

    {overview && <>
      <section id="analytics" className="scroll-mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Registered users" value={overview.users.total} detail={`${overview.users.active} active · ${overview.users.disabled} disabled`} />
        <Metric label="Online in last 5 min" value={overview.users.activeLoggedIn} detail="Tracked, unexpired sessions" />
        <Metric label="Ratings and reviews" value={overview.ratings.total} detail={`${overview.ratings.flagged} flagged for review`} />
        <Metric label="Traffic · 14 days" value={overview.traffic.pageViews14d} detail={`${overview.conversionRate}% payment approval ratio`} />
        <Metric label="Task submissions · 14 days" value={overview.taskCompletions14d} detail={`${overview.funnel.activeLast30Days} active reviewing users in 30 days`} />
        <Metric label="Package income" value={money(overview.finances.revenueMinor)} />
        <Metric label="Approved deposits" value={money(overview.finances.depositsMinor)} detail="Deposit Wallet inflows; separate from package revenue" />
        <Metric label="Paid payouts" value={money(overview.finances.payoutsMinor)} />
        <Metric label="Net revenue" value={money(overview.finances.netRevenueMinor)} detail="Revenue less paid payouts and expenses" />
        <Metric label="Needs attention" value={`${overview.payments.pending + overview.withdrawals.pending + overview.support.open}`} detail={`${overview.payments.pending} payments · ${overview.withdrawals.pending} withdrawals · ${overview.support.open} tickets`} />
        <Metric label="System health" value={overview.performance.database} detail={`${Math.round(overview.performance.uptimeSeconds / 60)} min uptime · ${Math.round(overview.performance.heapUsedBytes / 1024 / 1024)} MB heap`} />
      </section>
      {(isSuper || role === "helpAdmin") && <section id="analytics-trends" className={card}>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-semibold">Activity and revenue · 14 days</h2><p className="mt-1 text-sm text-slate-500">Daily user registrations, reviews, package income, and completed payouts.</p></div><p className="text-xs text-slate-400">Updated {new Date(overview.computedAt).toLocaleTimeString()}</p></div>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%"><BarChart data={overview.daily}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" tickFormatter={(value) => value.slice(5)} /><YAxis /><Tooltip /><Bar dataKey="users" fill="#0f766e" name="Users" /><Bar dataKey="ratings" fill="#60a5fa" name="Ratings" /></BarChart></ResponsiveContainer>
        </div>
        <div className="h-64 w-full pt-5">
          <ResponsiveContainer width="100%" height="100%"><BarChart data={overview.daily}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" tickFormatter={(value) => value.slice(5)} /><YAxis tickFormatter={(value) => `PKR ${Math.round(value / 100)}`} /><Tooltip formatter={(value) => money(value)} /><Bar dataKey="revenueMinor" fill="#16a34a" name="Revenue" /><Bar dataKey="payoutMinor" fill="#f97316" name="Payouts" /></BarChart></ResponsiveContainer>
        </div>
        <div className="mt-5">
          <h3 className="mb-3 font-semibold">Weekly financial trends · last 8 weeks</h3>
          <div className="h-64 w-full"><ResponsiveContainer width="100%" height="100%"><LineChart data={overview.weekly}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="week" /><YAxis tickFormatter={(value) => `PKR ${Math.round(value / 100)}`} /><Tooltip formatter={(value) => money(value)} /><Line type="monotone" dataKey="revenueMinor" stroke="#16a34a" name="Revenue" /><Line type="monotone" dataKey="payoutMinor" stroke="#f97316" name="Payouts" /><Line type="monotone" dataKey="expenseMinor" stroke="#8b5cf6" name="Expenses" /></LineChart></ResponsiveContainer></div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <GoalMetric label="Monthly revenue" current={overview.goals.current.revenueMinor} target={overview.goals.target.revenueMinor} percent={overview.goals.progress.revenue} format={money} />
          <GoalMetric label="Active users · 30 days" current={overview.goals.current.activeUsers} target={overview.goals.target.activeUsers} percent={overview.goals.progress.activeUsers} />
          <GoalMetric label="Monthly ratings" current={overview.goals.current.monthlyRatings} target={overview.goals.target.monthlyRatings} percent={overview.goals.progress.monthlyRatings} />
          <GoalMetric label="Payment conversion" current={overview.goals.current.conversionPercent} target={overview.goals.target.conversionPercent} percent={overview.goals.progress.conversion} format={(value) => `${value}%`} />
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          {Object.entries(overview.funnel).map(([name, value]) => <div key={name} className="rounded-xl bg-slate-50 p-3"><p className="text-xs capitalize text-slate-500">{name.replace(/([A-Z])/g, " $1")}</p><p className="mt-1 text-lg font-semibold">{value}</p></div>)}
        </div>
      </section>}
    </>}

    {(isSuper || role === "helpAdmin") && overview?.packageValidity && <section id="package-expiry" className={card}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-semibold">Package validity monitor</h2><p className="mt-1 text-sm text-slate-500">Expired users cannot submit review tasks or earn. Renewal access is available from their dashboard.</p></div><p className="text-sm text-slate-600">{overview.packageValidity.expired} expired · {overview.packageValidity.expiringInSevenDays} expiring within 7 days</p></div>
      <div className="grid gap-5 md:grid-cols-2">
        {[["Expired packages", overview.packageValidity.expiredUsers], ["Expiring soon", overview.packageValidity.expiringUsers]].map(([title, list]) => <div key={title}><h3 className="font-semibold">{title}</h3>{list.length ? <ul className="mt-2 divide-y">{list.map((item) => <li key={item.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm"><span>{item.name}<span className="block text-xs text-slate-500">{item.email}</span></span><span className="text-slate-500">{new Date(item.expiresAt).toLocaleDateString()}</span></li>)}</ul> : <p className="mt-2 text-sm text-slate-500">None</p>}</div>)}
      </div>
      <div className="mt-6">
        <div className="mb-3 flex flex-wrap justify-between gap-3"><h3 className="font-semibold">Package tier performance</h3><p className="text-sm text-slate-500">{overview.packageInsights.validityDays}-day terms · {overview.packageInsights.renewalCooldownDays}-day renewal cooldown · {overview.packageInsights.renewal.conversionPercent}% renewal approval rate</p></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead><tr className="border-b text-slate-500"><th className="py-2">Package</th><th>Active users</th><th>Historical purchases</th><th>Gross revenue</th><th>Status</th></tr></thead><tbody>{overview.packageInsights.distribution.map((item) => <tr key={item.id} className="border-b last:border-0"><td className="py-2 font-medium">{item.name}</td><td>{item.activeUsers}</td><td>{item.purchases}</td><td>{money(item.revenueMinor)}</td><td>{item.active ? "Available" : "Inactive"}</td></tr>)}</tbody></table></div>
      </div>
    </section>}
    {(isSuper || role === "helpAdmin") && <section id="registration-requests" className={`${card} scroll-mt-6`}>
      <div className="mb-5 flex flex-wrap justify-between gap-3"><div><h2 className="text-xl font-semibold">Accounts awaiting registration payment</h2><p className="mt-1 text-sm text-slate-500">These are inactive accounts awaiting their payment proof. Registration itself is not an admin approval workflow.</p></div><span className="rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-800">{requestNotifications?.find((item) => item.id === "registration")?.total || 0} awaiting payment</span></div>
      <ul className="divide-y">{(requestNotifications?.find((item) => item.id === "registration")?.previews || []).length ? requestNotifications.find((item) => item.id === "registration").previews.map((item) => <li key={item.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span><b>{item.user?.name || "User"}</b><span className="block text-xs text-slate-500">{item.user?.email || "No email"}</span></span><span className="text-xs text-slate-500">{new Date(item.createdAt).toLocaleString()}</span></li>) : <li className="py-3 text-sm text-slate-500">No accounts are awaiting registration payment.</li>}</ul>
    </section>}

    {(isSuper || role === "helpAdmin") && <section id="payment-approvals" className={`${card} scroll-mt-6`}>
      <div className="mb-5 flex flex-wrap justify-between gap-3"><div><h2 className="text-xl font-semibold">Registration payment verification</h2><p className="mt-1 text-sm text-slate-500">Inspect transaction details and private proof screenshots before activation.</p></div><span className="rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-800">{pendingRegistrationPayments.length} pending</span></div>
      <div className="space-y-3">{pendingRegistrationPayments.length ? pendingRegistrationPayments.map((item) => <QueueItem key={item.id} title={item.user?.name || "Removed account"} subline={`${item.user?.email || "No account"} · Registration · ${item.packageName} · TID ${item.transactionId}`} amount={money(item.amountMinor)} status={item.status}>
        <p className="mt-3 text-sm text-slate-600">Sent by {item.senderName} · {item.senderAccountNumber} via {item.paymentAccount?.displayName || "payment account"}</p>
        <p className="mt-1 text-xs text-slate-500">Submitted {new Date(item.createdAt).toLocaleString()} · IP {item.submissionIpAddress || "unavailable"}</p>
        {item.proofUrl && <a className="mt-3 inline-block font-semibold text-forest underline" href={item.proofUrl} target="_blank" rel="noreferrer">Open payment proof</a>}
        <div className="mt-4 flex flex-wrap gap-2"><button disabled={busy} onClick={() => reviewPayment(item, "approved")} className="rounded-lg bg-forest px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Approve & activate</button><button disabled={busy} onClick={() => reviewPayment(item, "rejected")} className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50">Reject proof</button></div>
      </QueueItem>) : <p className="text-sm text-slate-500">No registration payment proofs are awaiting review.</p>}</div>
    </section>}

    {(isSuper || role === "helpAdmin") && <section id="package-requests" className={`${card} scroll-mt-6`}>
      <div className="mb-5 flex flex-wrap justify-between gap-3"><div><h2 className="text-xl font-semibold">Package activation and renewal requests</h2><p className="mt-1 text-sm text-slate-500">Review renewal payment proofs before package activation.</p></div><span className="rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-800">{pendingRenewals.length} pending</span></div>
      <div className="space-y-3">{pendingRenewals.length ? pendingRenewals.map((item) => <QueueItem key={item.id} title={item.user?.name || "Removed account"} subline={`${item.user?.email || "No account"} · Renewal · ${item.packageName} · TID ${item.transactionId}`} amount={money(item.amountMinor)} status={item.status}>
        <p className="mt-3 text-sm text-slate-600">Sent by {item.senderName} · {item.senderAccountNumber} via {item.paymentAccount?.displayName || "payment account"}</p>
        <p className="mt-1 text-xs text-slate-500">Submitted {new Date(item.createdAt).toLocaleString()} · IP {item.submissionIpAddress || "unavailable"}</p>
        {item.proofUrl && <a className="mt-3 inline-block font-semibold text-forest underline" href={item.proofUrl} target="_blank" rel="noreferrer">Open payment proof</a>}
        <div className="mt-4 flex flex-wrap gap-2"><button disabled={busy} onClick={() => reviewPayment(item, "approved")} className="rounded-lg bg-forest px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Approve & activate</button><button disabled={busy} onClick={() => reviewPayment(item, "rejected")} className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50">Reject proof</button></div>
      </QueueItem>) : <p className="text-sm text-slate-500">No package activation or renewal proofs are awaiting review.</p>}</div>
    </section>}

    {(isSuper || role === "helpAdmin") && <section id="deposit-approvals" className={card}>
      <div className="mb-5 flex flex-wrap justify-between gap-3"><div><h2 className="text-xl font-semibold">Deposit Wallet verification</h2><p className="mt-1 text-sm text-slate-500">Approval credits the separate Deposit Wallet; users then choose and purchase a package.</p></div><span className="rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-800">{deposits.filter((item) => item.status === "pending").length} pending</span></div>
      <div className="space-y-3">{deposits.filter((item) => item.status === "pending").length ? deposits.filter((item) => item.status === "pending").map((item) => <QueueItem key={item.id} title={item.user?.name || "Removed account"} subline={`${item.user?.email || "No account"} · TID ${item.transactionId}`} amount={money(item.amountMinor)} status={item.status}>
        <p className="mt-3 text-sm text-slate-600">Sent by {item.senderName} · {item.senderAccountNumber} via {item.paymentAccount?.displayName || "payment account"}</p>
        <p className="mt-1 text-xs text-slate-500">Submitted {new Date(item.createdAt).toLocaleString()} · IP {item.submissionIpAddress || "unavailable"}</p>
        {item.proofUrl && <a className="mt-3 inline-block font-semibold text-forest underline" href={item.proofUrl} target="_blank" rel="noreferrer">Open deposit proof</a>}
        <div className="mt-4 flex flex-wrap gap-2"><button disabled={busy} onClick={() => reviewDeposit(item, "approved")} className="rounded-lg bg-forest px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Approve & credit Deposit Wallet</button><button disabled={busy} onClick={() => reviewDeposit(item, "rejected")} className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50">Reject proof</button></div>
      </QueueItem>) : <p className="text-sm text-slate-500">No deposit proofs are awaiting review.</p>}</div>
    </section>}

    {referralNetwork && <section id="referrals" className={card}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-semibold">Global referral network</h2><p className="mt-1 text-sm text-slate-500">Showing the latest 500 accounts and their direct inviter, earned commission, and pending withdrawal totals.</p></div><p className="text-sm text-slate-500">Invitations {referralNetwork.totals.registration || 0} · conversions {referralNetwork.totals.conversion || 0}</p></div>
      <div className="max-h-96 overflow-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="sticky top-0 bg-white text-slate-500"><tr className="border-b"><th className="py-3">Account</th><th>Invited by</th><th>Package</th><th>Earned</th><th>Pending payout</th><th>Joined</th></tr></thead><tbody>{referralNetwork.users.map((item) => <tr key={item.id} className="border-b last:border-0"><td className="py-3"><b>{item.name}</b><p className="text-xs text-slate-500">{item.email}</p></td><td>{item.referredBy?.name || "Direct"}{item.referredBy?.email && <p className="text-xs text-slate-500">{item.referredBy.email}</p>}</td><td>{item.converted ? "Approved" : "Pending"}</td><td>{money(item.earningsMinor)} · {item.commissionCount}</td><td>{money(item.pendingWithdrawalMinor)}</td><td>{new Date(item.createdAt).toLocaleDateString()}</td></tr>)}</tbody></table></div>
    </section>}

    {(isSuper || role === "helpAdmin") && <section id="withdrawals" className={card}>
      <div className="mb-5 flex flex-wrap justify-between gap-3"><div><h2 className="text-xl font-semibold">Withdrawal requests</h2><p className="mt-1 text-sm text-slate-500">Search and review historical requests. Full payout details are revealed only on explicit, audited action.</p></div><span className="rounded-full bg-sky-50 px-3 py-1 text-sm font-semibold text-sky-800">{openWithdrawals.length} open on this page · {withdrawalPagination.total || 0} matching</span></div>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-xs font-semibold">User, request ID, or payout reference<input className={`${field} mt-1`} value={withdrawalFilters.q} onChange={(event) => { setWithdrawalFilters({ ...withdrawalFilters, q: event.target.value }); setWithdrawalPage(1); }} placeholder="Search" /></label>
        <label className="text-xs font-semibold">Status<select className={`${field} mt-1`} value={withdrawalFilters.status} onChange={(event) => { setWithdrawalFilters({ ...withdrawalFilters, status: event.target.value }); setWithdrawalPage(1); }}><option value="all">All statuses</option>{["pending", "processing", "paid", "rejected"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label className="text-xs font-semibold">Payout method<select className={`${field} mt-1`} value={withdrawalFilters.provider} onChange={(event) => { setWithdrawalFilters({ ...withdrawalFilters, provider: event.target.value }); setWithdrawalPage(1); }}><option value="">All methods</option>{["easypaisa", "jazzcash", "bank", "usdtBep20", "usdtTrc20"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label className="text-xs font-semibold">From<input className={`${field} mt-1`} type="date" value={withdrawalFilters.from} onChange={(event) => { setWithdrawalFilters({ ...withdrawalFilters, from: event.target.value }); setWithdrawalPage(1); }} /></label>
        <label className="text-xs font-semibold">To<input className={`${field} mt-1`} type="date" value={withdrawalFilters.to} onChange={(event) => { setWithdrawalFilters({ ...withdrawalFilters, to: event.target.value }); setWithdrawalPage(1); }} /></label>
      </div>
      <div className="space-y-3">{withdrawals.length ? withdrawals.map((item) => {
        const revealed = revealedWithdrawalDetails[item.id];
        return <QueueItem key={item.id} title={`${item.user?.name || "Deleted account"} · ${item.provider}`} subline={`${item.user?.email || "No email"} · ${item.payoutDetails?.accountTitle || ""} · ${item.payoutDetails?.walletAddress || item.payoutDetails?.accountNumber || item.payoutDetails?.iban || ""} ${item.payoutDetails?.bankName || ""} · Fee ${money(item.feeMinor || 0)}`} amount={`${money(item.payoutMinor || item.amountMinor)} payout`} status={item.status}>
        <p className="mt-2 break-all text-xs text-slate-500">Request {item.id} · {new Date(item.createdAt).toLocaleString()}{item.payoutReference ? ` · Payment ref ${item.payoutReference}` : ""}{item.reviewedBy ? ` · Reviewed by ${item.reviewedBy.name} (${item.reviewedBy.email})` : ""}{item.reviewedAt ? ` · ${new Date(item.reviewedAt).toLocaleString()}` : ""}</p>
        {item.reviewNote && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">Admin note / rejection reason: {item.reviewNote}</p>}
        {revealed && <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm" aria-live="polite">
          <p><b>{revealed.accountTitle}</b> · {revealed.walletAddress || revealed.accountNumber || ""} {revealed.iban ? `· IBAN ${revealed.iban}` : ""}</p>
          {revealed.bankName && <p className="mt-1">{revealed.bankName}</p>}
          <button type="button" onClick={() => setRevealedWithdrawalDetails((current) => { const next = { ...current }; delete next[item.id]; return next; })} className="mt-2 text-xs font-semibold underline">Hide full payout details</button>
        </div>}
        {["pending", "processing"].includes(item.status) && <div className="mt-4 flex flex-wrap gap-2"><button disabled={busy} onClick={() => revealWithdrawalDetails(item)} className="rounded-lg border border-amber-300 px-3 py-2 text-sm font-semibold">Reveal payout details</button>{item.status === "pending" && <button disabled={busy} onClick={() => reviewWithdrawal(item, "processing")} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">Mark processing</button>}<button disabled={busy} onClick={() => reviewWithdrawal(item, "paid")} className="rounded-lg bg-forest px-3 py-2 text-sm font-semibold text-white">Mark paid</button><button disabled={busy} onClick={() => reviewWithdrawal(item, "rejected")} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700">Reject & refund</button></div>}
      </QueueItem>;
      }) : <p className="text-sm text-slate-500">No withdrawal requests match these filters.</p>}</div>
      <div className="mt-5 flex items-center justify-between gap-3 text-sm"><span>Page {withdrawalPagination.page || 1} of {Math.max(1, withdrawalPagination.pages || 0)}</span><div className="flex gap-2"><button type="button" disabled={withdrawalPage <= 1} onClick={() => setWithdrawalPage((page) => Math.max(1, page - 1))} className="rounded-lg border px-3 py-2 disabled:opacity-40">Previous</button><button type="button" disabled={withdrawalPage >= (withdrawalPagination.pages || 1)} onClick={() => setWithdrawalPage((page) => page + 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Next</button></div></div>
    </section>}

    <section id="support" className={card}>
      <div className="mb-5 flex flex-wrap justify-between gap-3"><div><h2 className="text-xl font-semibold">Support ticket queue</h2><p className="mt-1 text-sm text-slate-500">Review and resolve user requests. Every staff update is audited.</p></div><span className="rounded-full bg-violet-50 px-3 py-1 text-sm font-semibold text-violet-800">{openTickets.length} open</span></div>
      <div className="space-y-3">{openTickets.length ? openTickets.map((ticket) => <QueueItem key={ticket.id} title={ticket.subject} subline={`${ticket.user?.name || "Former user"} · ${ticket.user?.email || ""}`} status={ticket.priority}>
        <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{ticket.message}</p>
        <div className="mt-4 flex flex-wrap gap-2"><button disabled={busy} onClick={() => mutate("/api/support", "PATCH", { id: ticket.id, status: "inProgress", priority: ticket.priority, resolution: ticket.resolution }, "Ticket assigned.")} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">In progress</button><button disabled={busy} onClick={async () => { const resolution = window.prompt("Resolution to send to the user:", ticket.resolution || ""); if (resolution === null) return; await mutate("/api/support", "PATCH", { id: ticket.id, status: "resolved", priority: ticket.priority, resolution }, "Ticket resolved."); }} className="rounded-lg bg-forest px-3 py-2 text-sm font-semibold text-white">Resolve</button></div>
      </QueueItem>) : <p className="text-sm text-slate-500">No open tickets.</p>}</div>
    </section>

    {isSuper && <>
      <section id="packages" className={`${card} grid scroll-mt-6 gap-8 xl:grid-cols-2`}>
        <div>
          <h2 className="text-xl font-semibold">Registration packages</h2>
          <p className="mt-1 text-sm text-slate-500">Create and manage package tiers, including each package’s withdrawal limits and percentage-fee brackets. Only package-specific fee rules apply; legacy global fee settings do not override them. Editing a package affects new activations, renewals, or explicit assignments; current users keep their snapshots. Existing users without stored policy terms use the compatibility defaults until reassigned or renewed. PKR amounts are stored in paisa.</p>
          <form className="mt-5 space-y-3" onSubmit={createPackage}>
            <input className={field} placeholder="Package name" value={packageForm.name} onChange={(e) => setPackageForm({ ...packageForm, name: e.target.value })} required maxLength={100} />
            <textarea className={field} placeholder="Description" value={packageForm.description} onChange={(e) => setPackageForm({ ...packageForm, description: e.target.value })} maxLength={500} />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold">Price (PKR)<input className={`${field} mt-1`} type="number" min="0.01" step="0.01" value={packageForm.price} onChange={(e) => setPackageForm({ ...packageForm, price: e.target.value })} required /></label>
              <label className="text-xs font-semibold">Validity (days)<input className={`${field} mt-1`} type="number" min="1" max="365" value={packageForm.validityDays} onChange={(e) => setPackageForm({ ...packageForm, validityDays: e.target.value })} required /></label>
              <label className="text-xs font-semibold">Daily task limit (0 = unlimited)<input className={`${field} mt-1`} type="number" min="0" max="1000" value={packageForm.dailyTaskQuota} onChange={(e) => setPackageForm({ ...packageForm, dailyTaskQuota: e.target.value })} required /></label>
              <label className="text-xs font-semibold">Daily earning cap (PKR; 0 = unlimited)<input className={`${field} mt-1`} type="number" min="0" step="0.01" value={packageForm.dailyEarningLimit} onChange={(e) => setPackageForm({ ...packageForm, dailyEarningLimit: e.target.value })} required /></label>
              <label className="text-xs font-semibold">Per-task earnings (PKR)<input className={`${field} mt-1`} type="number" min="0.01" step="0.01" value={packageForm.perTaskEarnings} onChange={(e) => setPackageForm({ ...packageForm, perTaskEarnings: e.target.value })} required /></label>
              <label className="text-xs font-semibold">Display order<input className={`${field} mt-1`} type="number" min="0" max="100000" value={packageForm.sortOrder} onChange={(e) => setPackageForm({ ...packageForm, sortOrder: e.target.value })} required /></label>
              <label className="text-xs font-semibold">Minimum withdrawal (PKR)<input className={`${field} mt-1`} type="number" min="1" max="1000000" step="0.01" value={packageForm.minimumWithdrawal} onChange={(e) => setPackageForm({ ...packageForm, minimumWithdrawal: e.target.value })} required /></label>
              <label className="text-xs font-semibold">Maximum withdrawal (PKR; blank = unlimited)<input className={`${field} mt-1`} type="number" min="1" max="1000000" step="0.01" value={packageForm.maximumWithdrawal} onChange={(e) => setPackageForm({ ...packageForm, maximumWithdrawal: e.target.value })} /></label>
            </div>
            <label className="block text-xs font-semibold">Percentage withdrawal fee brackets (JSON; inclusive paisa ranges, 100 basis points = 1%)
              <textarea className={`${field} mt-1 font-mono text-xs`} rows={4} value={packageForm.withdrawalFeeBracketsJson} onChange={(e) => setPackageForm({ ...packageForm, withdrawalFeeBracketsJson: e.target.value })} required />
              <span className="mt-1 block font-normal text-slate-500">Ranges must cover the entire permitted withdrawal interval without overlaps or gaps. Use a null maximum for the final unlimited bracket.</span>
            </label>
            <textarea className={field} placeholder="Benefits (one per line)" value={packageForm.benefits} onChange={(e) => setPackageForm({ ...packageForm, benefits: e.target.value })} />
            <input className={field} placeholder="Eligible referral tiers (comma-separated; blank = all)" value={packageForm.eligibleReferralTiers} onChange={(e) => setPackageForm({ ...packageForm, eligibleReferralTiers: e.target.value })} />
            <select className={field} value={packageForm.recommendedPackageId} onChange={(e) => setPackageForm({ ...packageForm, recommendedPackageId: e.target.value })}>
              <option value="">No recommended renewal package</option>
              {packages.filter((item) => item.active && !item.archivedAt).map((item) => <option key={item.id} value={item.id}>{item.name} · {money(item.priceMinor)}</option>)}
            </select>
            <button disabled={busy} className="rounded-xl bg-forest px-4 py-2.5 text-sm font-semibold text-white">Add package</button>
          </form>
          <ul className="mt-5 divide-y">{packages.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
            <span><b>{item.name}</b> · {money(item.priceMinor)} · {item.validityDays || 30} days · {item.dailyTaskQuota ? `${item.dailyTaskQuota} tasks/day` : "unlimited tasks"} · withdraw {money(item.minimumWithdrawalMinor ?? 100)}–{item.maximumWithdrawalMinor === null ? "unlimited" : money(item.maximumWithdrawalMinor)} · {item.archivedAt ? "Archived" : item.active ? "Active" : "Inactive"}{packages.some((candidate) => candidate.recommendedPackageId === item.id) && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs">Recommended renewal</span>}</span>
            <div className="flex gap-2">{!item.archivedAt && <><button disabled={busy} onClick={() => editPackage(item)} className="rounded-lg border px-3 py-1.5">Edit</button><button disabled={busy} onClick={() => mutate("/api/admin/packages", "PATCH", { ...item, id: item.id, active: !item.active }, "Package status updated.")} className="rounded-lg border px-3 py-1.5">{item.active ? "Deactivate" : "Activate"}</button><button disabled={busy} onClick={() => { if (window.confirm(`Archive package ${item.name}? Historical records will be preserved.`)) mutate("/api/admin/packages", "DELETE", { id: item.id }, "Package archived."); }} className="rounded-lg border border-red-200 px-3 py-1.5 text-red-700">Archive</button></>}</div>
          </li>)}</ul>
        </div>
        <div id="payment-accounts" className="scroll-mt-6">
          <h2 className="text-xl font-semibold">Company payment accounts</h2>
          <p className="mt-1 text-sm text-slate-500">Account instructions and QR codes appear only in an authenticated payment flow after package selection.</p>
          <form className="mt-5 space-y-3" onSubmit={createAccount}>
            <select className={field} value={accountForm.provider} onChange={(e) => setAccountForm({ ...accountForm, provider: e.target.value })}><option value="easypaisa">Easypaisa</option><option value="jazzcash">JazzCash</option><option value="bank">Bank transfer</option></select>
            <input className={field} placeholder="Display name" value={accountForm.displayName} onChange={(e) => setAccountForm({ ...accountForm, displayName: e.target.value })} required maxLength={100} />
            <input className={field} placeholder="Account title" value={accountForm.accountTitle} onChange={(e) => setAccountForm({ ...accountForm, accountTitle: e.target.value })} required maxLength={120} />
            <input className={field} placeholder="Account / payment ID" value={accountForm.accountNumber} onChange={(e) => setAccountForm({ ...accountForm, accountNumber: e.target.value })} required maxLength={64} />
            {accountForm.provider === "bank" && <input className={field} placeholder="Bank name" value={accountForm.bankName} onChange={(e) => setAccountForm({ ...accountForm, bankName: e.target.value })} required maxLength={100} />}
            <textarea className={field} placeholder="Payment instructions" value={accountForm.instructions} onChange={(e) => setAccountForm({ ...accountForm, instructions: e.target.value })} maxLength={1000} />
            <label className="block text-sm font-medium">QR image (optional)<input className={`${field} mt-1`} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(e) => setAccountQr(e.target.files?.[0] || null)} /><span className="mt-1 block text-xs font-normal text-slate-500">JPEG, PNG, or WebP · max 5 MB · checked against the actual image content</span></label>
            <label className="block text-sm font-medium">Display order<input className={`${field} mt-1`} type="number" min="0" max="100000" value={accountForm.sortOrder} onChange={(e) => setAccountForm({ ...accountForm, sortOrder: e.target.value })} required /></label>
            <button disabled={busy} className="rounded-xl bg-forest px-4 py-2.5 text-sm font-semibold text-white">Add payment account</button>
          </form>
          <ul className="mt-5 divide-y">{accounts.map((item) => <li key={item.id} className="py-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span><b>{item.displayName}</b> · {item.accountNumber} · order {item.sortOrder} · {item.archivedAt ? "Archived" : item.active ? "Active" : "Inactive"}</span>
              <div className="flex flex-wrap gap-3">
                {!item.archivedAt && <><button disabled={busy} onClick={() => editAccount(item)} className="text-forest underline">Edit</button><button disabled={busy} onClick={() => mutate("/api/admin/payment-accounts", "PATCH", { ...item, active: !item.active }, "Payment account status updated.")} className="underline">{item.active ? "Deactivate" : "Activate"}</button><button disabled={busy} onClick={() => { if (window.confirm(`Archive ${item.displayName}? Existing payment records will be preserved.`)) mutate("/api/admin/payment-accounts", "DELETE", { id: item.id }, "Payment account archived."); }} className="text-red-700 underline">Archive</button></>}
              </div>
            </div>
            {item.qrUrl && <img src={item.qrUrl} alt={`${item.displayName} payment QR code`} className="mt-3 h-28 w-28 rounded-lg border object-contain" />}
            {!item.archivedAt && <div className="mt-3 flex flex-wrap gap-3">
              <label className="text-xs font-semibold">{item.qrUrl ? "Replace QR" : "Upload QR"}<input className="mt-1 block max-w-full text-xs" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(e) => uploadAccountQr(item, e.target.files?.[0])} /></label>
              {item.qrUrl && <button disabled={busy} onClick={() => mutate("/api/admin/payment-accounts", "PATCH", { ...item, removeQr: true }, "Payment QR removed.")} className="self-end text-red-700 underline">Remove QR</button>}
            </div>}
          </li>)}</ul>
        </div>
      </section>

      {settings && <section id="review-tasks" className={`${card} scroll-mt-6`}><h2 className="text-xl font-semibold">Review task and referral reward settings</h2><p className="mt-1 text-sm text-slate-500">Payouts use PKR paisa. A limit or timer set to zero is unlimited or disabled.</p>
        <form onSubmit={saveSettings} className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium md:col-span-2">Task title<input className={`${field} mt-1`} maxLength={120} value={settings.reviewTasks.title} onChange={(e) => setSettings({ ...settings, reviewTasks: { ...settings.reviewTasks, title: e.target.value } })} required /></label>
          <label className="text-sm font-medium md:col-span-2">Task instructions<textarea className={`${field} mt-1`} rows={3} maxLength={2000} value={settings.reviewTasks.instructions} onChange={(e) => setSettings({ ...settings, reviewTasks: { ...settings.reviewTasks, instructions: e.target.value } })} /></label>
          <label className="text-sm font-medium md:col-span-2">Custom rules<textarea className={`${field} mt-1`} rows={4} maxLength={4000} value={settings.reviewTasks.rulesText} onChange={(e) => setSettings({ ...settings, reviewTasks: { ...settings.reviewTasks, rulesText: e.target.value } })} /></label>
          <label className="text-sm font-medium">Task website URL<input className={`${field} mt-1`} type="url" maxLength={2048} value={settings.reviewTasks.websiteUrl} onChange={(e) => setSettings({ ...settings, reviewTasks: { ...settings.reviewTasks, websiteUrl: e.target.value } })} placeholder="https://example.com" /></label>
          <label className="text-sm font-medium">Task video URL<input className={`${field} mt-1`} type="url" maxLength={2048} value={settings.reviewTasks.videoUrl} onChange={(e) => setSettings({ ...settings, reviewTasks: { ...settings.reviewTasks, videoUrl: e.target.value } })} placeholder="https://youtube.com/..." /></label>
          <label className="text-sm font-medium md:col-span-2">Task image
            {settings.reviewTasks.mediaImageUrl && <img src={settings.reviewTasks.mediaImageUrl} alt="Review task preview" className="my-3 max-h-56 rounded-xl object-contain" />}
            <input className={`${field} mt-1`} type="file" accept="image/jpeg,image/png,image/webp" disabled={taskImageUploading} onChange={(e) => uploadReviewTaskImage(e.target.files?.[0])} />
            <span className="mt-1 block text-xs font-normal text-slate-500">{taskImageUploading ? "Uploading image…" : "JPEG, PNG, or WebP · max 5 MB"}</span>
          </label>
          <label className="text-sm font-medium">Payout per approved review (paisa)<input className={`${field} mt-1`} type="number" min="0" max="1000000" value={settings.reviewTasks.rewardMinor} onChange={(e) => setSettings({ ...settings, ratingRewardMinor: e.target.value, reviewTasks: { ...settings.reviewTasks, rewardMinor: e.target.value } })} /></label>
          <label className="text-sm font-medium">Minimum task time (seconds)<input className={`${field} mt-1`} type="number" min="0" max="86400" value={settings.reviewTasks.minimumSeconds} onChange={(e) => setSettings({ ...settings, reviewTasks: { ...settings.reviewTasks, minimumSeconds: e.target.value } })} /></label>
          <label className="text-sm font-medium">Cooldown (seconds)<input className={`${field} mt-1`} type="number" min="0" max="604800" value={settings.reviewTasks.cooldownSeconds} onChange={(e) => setSettings({ ...settings, reviewTasks: { ...settings.reviewTasks, cooldownSeconds: e.target.value } })} /></label>
          <label className="text-sm font-medium">Per-user daily limit (0 = unlimited)<input className={`${field} mt-1`} type="number" min="0" max="100" value={settings.reviewTasks.dailyLimit} onChange={(e) => setSettings({ ...settings, reviewTasks: { ...settings.reviewTasks, dailyLimit: e.target.value } })} /></label>
          <label className="text-sm font-medium">Per-user total task limit (0 = unlimited)<input className={`${field} mt-1`} type="number" min="0" max="1000000" value={settings.reviewTasks.userTotalLimit} onChange={(e) => setSettings({ ...settings, reviewTasks: { ...settings.reviewTasks, userTotalLimit: e.target.value } })} /></label>
          <label className="text-sm font-medium">Global total task quota (0 = unlimited)<input className={`${field} mt-1`} type="number" min="0" max="10000000" value={settings.reviewTasks.totalLimit} onChange={(e) => setSettings({ ...settings, reviewTasks: { ...settings.reviewTasks, totalLimit: e.target.value } })} /></label>
          <div className="grid gap-2 text-sm md:col-span-2 sm:grid-cols-3">
            <label className="flex items-center gap-2"><input type="checkbox" checked={settings.reviewTasks.allowImage} onChange={(e) => setSettings({ ...settings, reviewTasks: { ...settings.reviewTasks, allowImage: e.target.checked, requireImage: e.target.checked ? settings.reviewTasks.requireImage : false } })} />Allow image evidence</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={settings.reviewTasks.requireImage} disabled={!settings.reviewTasks.allowImage} onChange={(e) => setSettings({ ...settings, reviewTasks: { ...settings.reviewTasks, requireImage: e.target.checked } })} />Require image evidence</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={settings.reviewTasks.allowLink} onChange={(e) => setSettings({ ...settings, reviewTasks: { ...settings.reviewTasks, allowLink: e.target.checked, requireLink: e.target.checked ? settings.reviewTasks.requireLink : false, allowVideoLinks: e.target.checked ? settings.reviewTasks.allowVideoLinks : false } })} />Allow HTTPS link</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={settings.reviewTasks.requireLink} disabled={!settings.reviewTasks.allowLink} onChange={(e) => setSettings({ ...settings, reviewTasks: { ...settings.reviewTasks, requireLink: e.target.checked } })} />Require HTTPS link</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={settings.reviewTasks.allowVideoLinks} disabled={!settings.reviewTasks.allowLink} onChange={(e) => setSettings({ ...settings, reviewTasks: { ...settings.reviewTasks, allowVideoLinks: e.target.checked } })} />Allow YouTube/MP4 link</label>
          </div>
          <fieldset className="md:col-span-2"><legend className="mb-2 text-sm font-semibold">Target registration packages (none selected means all packages)</legend><div className="flex flex-wrap gap-3">{packages.map((item) => <label key={item.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><input type="checkbox" checked={settings.reviewTasks.packageIds.includes(item.id)} onChange={(event) => setSettings({ ...settings, reviewTasks: { ...settings.reviewTasks, packageIds: event.target.checked ? [...settings.reviewTasks.packageIds, item.id] : settings.reviewTasks.packageIds.filter((id) => id !== item.id) } })} />{item.name}</label>)}</div></fieldset>
          <fieldset className="space-y-3 rounded-xl border border-slate-200 p-4 md:col-span-2">
            <legend className="px-2 text-sm font-semibold">Withdrawal methods</legend>
            <p className="text-xs text-slate-500">Only methods already supported by Ratewell can be configured. Disabling a method prevents new profiles/requests but does not alter existing requests or their payout snapshots.</p>
            {(settings.withdrawalMethods || []).map((method, index) => {
              const requirements = {
                easypaisa: "Account-holder name and mobile/account number",
                jazzcash: "Account-holder name and mobile/account number",
                bank: "Account-holder name, bank name, and valid IBAN or account number",
                usdtBep20: "Wallet owner name and BEP20 address",
                usdtTrc20: "Wallet owner name and TRC20 address",
              }[method.provider];
              return <div key={method.provider} className="grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-2">
                <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2"><input type="checkbox" checked={method.enabled} onChange={(event) => setSettings({ ...settings, withdrawalMethods: settings.withdrawalMethods.map((item, methodIndex) => methodIndex === index ? { ...item, enabled: event.target.checked } : item) })} />Enable {method.provider}</label>
                <label className="text-xs font-semibold">Display name<input className={`${field} mt-1`} maxLength={80} value={method.displayName} onChange={(event) => setSettings({ ...settings, withdrawalMethods: settings.withdrawalMethods.map((item, methodIndex) => methodIndex === index ? { ...item, displayName: event.target.value } : item) })} /></label>
                <label className="text-xs font-semibold">Required account details<p className="mt-2 text-xs font-normal text-slate-600">{requirements}</p></label>
                <label className="text-xs font-semibold sm:col-span-2">User instructions<textarea className={`${field} mt-1`} rows={2} maxLength={1000} value={method.instructions} onChange={(event) => setSettings({ ...settings, withdrawalMethods: settings.withdrawalMethods.map((item, methodIndex) => methodIndex === index ? { ...item, instructions: event.target.value } : item) })} /></label>
              </div>;
            })}
          </fieldset>
          <div className="md:col-span-2"><h3 className="mb-2 text-sm font-semibold">Referral commission levels (basis points)</h3>{settings.referralLevels.map((item, index) => <label key={item.level} className="mb-2 flex items-center gap-3 text-sm">Level {item.level}<input className={`${field} max-w-48`} type="number" min="0" max="10000" value={item.basisPoints} onChange={(e) => setSettings({ ...settings, referralLevels: settings.referralLevels.map((current, i) => i === index ? { ...current, basisPoints: e.target.value } : current) })} /></label>)}</div>
          <div id="referral-rewards" className="scroll-mt-6 md:col-span-2"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-semibold">Referral milestones and tiers</h3><button type="button" onClick={addMilestone} disabled={settings.referralMilestones.length >= 50} className="rounded-lg border px-3 py-2 text-sm font-semibold">Add milestone</button></div><ul className="mt-3 divide-y">{settings.referralMilestones.map((item, index) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><span><b>{item.title}</b> · {item.directConversions} direct / {item.indirectConversions} indirect · {item.windowSeconds ? `${item.windowSeconds}s window` : "lifetime"} · {money(item.rewardMinor)}{item.tier ? ` · ${item.tier}` : ""}</span><button type="button" onClick={() => setSettings({ ...settings, referralMilestones: settings.referralMilestones.filter((_, i) => i !== index) })} className="text-red-700 underline">Remove</button></li>)}</ul></div>
          <div className="grid gap-3 md:col-span-2 md:grid-cols-2">
            <h3 className="text-sm font-semibold md:col-span-2">Analytics goals</h3>
            <label className="text-sm font-medium">Monthly revenue goal (paisa)<input className={`${field} mt-1`} type="number" min="0" value={settings.goals.monthlyRevenueMinor} onChange={(e) => setSettings({ ...settings, goals: { ...settings.goals, monthlyRevenueMinor: e.target.value } })} /></label>
            <label className="text-sm font-medium">Active users goal<input className={`${field} mt-1`} type="number" min="0" value={settings.goals.activeUsers} onChange={(e) => setSettings({ ...settings, goals: { ...settings.goals, activeUsers: e.target.value } })} /></label>
            <label className="text-sm font-medium">Monthly ratings goal<input className={`${field} mt-1`} type="number" min="0" value={settings.goals.monthlyRatings} onChange={(e) => setSettings({ ...settings, goals: { ...settings.goals, monthlyRatings: e.target.value } })} /></label>
            <label className="text-sm font-medium">Conversion goal (%)<input className={`${field} mt-1`} type="number" min="0" max="100" step="0.1" value={settings.goals.conversionPercent} onChange={(e) => setSettings({ ...settings, goals: { ...settings.goals, conversionPercent: e.target.value } })} /></label>
          </div>
          <div className="grid gap-3 md:col-span-2">
            <h3 className="text-sm font-semibold">Package renewal policy</h3>
            <label className="text-sm font-medium">Business timezone for daily task quotas<input className={field} maxLength={100} value={settings.businessTimeZone || "UTC"} onChange={(e) => setSettings({ ...settings, businessTimeZone: e.target.value })} placeholder="UTC or America/New_York" /><span className="mt-1 block text-xs font-normal text-slate-500">Use an IANA timezone such as UTC, Asia/Karachi, or America/New_York.</span></label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium">Validity from approval (days)<input className={`${field} mt-1`} type="number" min="1" max="365" value={settings.packagePolicy.validityDays} onChange={(e) => setSettings({ ...settings, packagePolicy: { ...settings.packagePolicy, validityDays: e.target.value } })} /></label>
              <label className="text-sm font-medium">Expiry cooldown (days)<input className={`${field} mt-1`} type="number" min="0" max="30" value={settings.packagePolicy.renewalCooldownDays} onChange={(e) => setSettings({ ...settings, packagePolicy: { ...settings.packagePolicy, renewalCooldownDays: e.target.value } })} /></label>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.packagePolicy.requireRecommendedDuringCooldown} onChange={(e) => setSettings({ ...settings, packagePolicy: { ...settings.packagePolicy, requireRecommendedDuringCooldown: e.target.checked } })} />Require each expired package’s recommended plan during cooldown</label>
            <p className="text-xs text-slate-500">During cooldown only the mapped recommended plan can be paid for. If a package has no recommendation, normal active packages remain available.</p>
          </div>
          <div className="grid gap-3 md:col-span-2">
            <h3 className="text-sm font-semibold">Registration terms and privacy policy</h3>
            <label className="text-sm font-medium">Terms version<input className={`${field} mt-1`} maxLength={40} pattern="[A-Za-z0-9][A-Za-z0-9._-]{0,39}" value={settings.legalContent.termsVersion} onChange={(e) => setSettings({ ...settings, legalContent: { ...settings.legalContent, termsVersion: e.target.value } })} required /><span className="mt-1 block text-xs font-normal text-slate-500">Change the version whenever terms materially change.</span></label>
            <label className="text-sm font-medium">Terms &amp; Conditions, including the current refund policy<textarea className={`${field} mt-1`} rows={8} maxLength={20000} value={settings.legalContent.terms} onChange={(e) => setSettings({ ...settings, legalContent: { ...settings.legalContent, terms: e.target.value } })} required /></label>
            <label className="text-sm font-medium">Privacy Policy<textarea className={`${field} mt-1`} rows={8} maxLength={20000} value={settings.legalContent.privacy} onChange={(e) => setSettings({ ...settings, legalContent: { ...settings.legalContent, privacy: e.target.value } })} required /></label>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={settings.legalContent.requireReacceptance} onChange={(e) => setSettings({ ...settings, legalContent: { ...settings.legalContent, requireReacceptance: e.target.checked } })} className="mt-1" />Require users to accept the current terms version again before protected actions.</label>
          </div>
          <div className="grid gap-3 md:col-span-2">
            <h3 className="text-sm font-semibold">Marquee announcement</h3>
            <textarea className={field} rows={2} maxLength={500} placeholder="Announcement shown across user pages" value={settings.marqueeNews.message} onChange={(e) => setSettings({ ...settings, marqueeNews: { ...settings.marqueeNews, message: e.target.value } })} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.marqueeNews.active} onChange={(e) => setSettings({ ...settings, marqueeNews: { ...settings.marqueeNews, active: e.target.checked } })} />Announcement active</label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium">Starts at (optional)<input className={`${field} mt-1`} type="datetime-local" value={localDateTime(settings.marqueeNews.startsAt)} onChange={(e) => setSettings({ ...settings, marqueeNews: { ...settings.marqueeNews, startsAt: e.target.value || null } })} /></label>
              <label className="text-sm font-medium">Ends at (optional)<input className={`${field} mt-1`} type="datetime-local" value={localDateTime(settings.marqueeNews.endsAt)} onChange={(e) => setSettings({ ...settings, marqueeNews: { ...settings.marqueeNews, endsAt: e.target.value || null } })} /></label>
            </div>
          </div>
          <label className="flex items-center gap-3 text-sm font-medium"><input type="checkbox" checked={settings.maintenanceMode} onChange={(e) => setSettings({ ...settings, maintenanceMode: e.target.checked })} />Maintenance mode</label>
          <div><button disabled={busy} className="rounded-xl bg-forest px-4 py-2.5 font-semibold text-white">Save settings</button></div>
        </form>
      </section>}

      <section id="branding" className={`${card} scroll-mt-6`}>
        <h2 className="text-xl font-semibold">Portal logos and branding</h2>
        <p className="mt-1 text-sm text-slate-500">Upload authenticated Cloudinary images for user-facing and administrator portal branding.</p>
        <div className="mt-5 grid gap-6 sm:grid-cols-2">
          {[
            ["user", "User portal logo", branding.userLogoUrl],
            ["admin", "Admin portal logo", branding.adminLogoUrl],
          ].map(([type, title, url]) => (
            <label key={type} className="block rounded-xl border border-slate-200 p-4 text-sm font-semibold">
              {title}
              {url && <img src={url} alt={`${title} preview`} className="my-4 max-h-24 max-w-full object-contain" />}
              <input className={`${field} mt-3`} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => uploadLogo(type, event.target.files?.[0])} />
              <span className="mt-2 block text-xs font-normal text-slate-500">JPEG, PNG, or WebP · max 5 MB</span>
            </label>
          ))}
        </div>
      </section>

      <section id="ads" className={card}>
        <h2 className="text-xl font-semibold">Advertisement banners</h2>
        <p className="mt-1 text-sm text-slate-500">Manage scheduled placements and review impression/click totals. Images are served through short-lived signed URLs.</p>
        <form onSubmit={createBanner} className="mt-5 grid gap-3 sm:grid-cols-2">
          <input className={field} placeholder="Banner title" value={bannerForm.title} onChange={(e) => setBannerForm({ ...bannerForm, title: e.target.value })} required maxLength={120} />
          <select className={field} value={bannerForm.slot} onChange={(e) => setBannerForm({ ...bannerForm, slot: e.target.value })}><option value="header">Header</option><option value="sidebar">Sidebar</option><option value="footer">Footer</option><option value="interstitial">Interstitial</option><option value="popup">Popup</option></select>
          <input className={field} placeholder="Optional HTTPS or relative destination URL" value={bannerForm.href} onChange={(e) => setBannerForm({ ...bannerForm, href: e.target.value })} maxLength={2048} />
          <label className="text-sm font-medium">Starts at<input className={`${field} mt-1`} type="datetime-local" value={bannerForm.startsAt} onChange={(e) => setBannerForm({ ...bannerForm, startsAt: e.target.value })} /></label>
          <label className="text-sm font-medium">Ends at<input className={`${field} mt-1`} type="datetime-local" value={bannerForm.endsAt} onChange={(e) => setBannerForm({ ...bannerForm, endsAt: e.target.value })} /></label>
          <input className={field} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setBannerImage(e.target.files?.[0] || null)} required />
          <button disabled={busy} className="rounded-xl bg-forest px-4 py-2.5 text-sm font-semibold text-white sm:col-span-2">Upload banner</button>
        </form>
        <ul className="mt-5 divide-y">{banners.map((item) => <li key={item.id} className="flex flex-wrap items-center gap-4 py-4 text-sm">
          <img src={item.imageUrl} alt="" className="h-16 w-28 rounded-lg object-cover" />
          <div className="min-w-40 flex-1"><b>{item.title}</b><p className="text-slate-500">{item.slot} · {item.impressions} views · {item.clicks} clicks</p></div>
          <button disabled={busy} onClick={() => editBanner(item)} className="text-forest underline">Edit</button>
          <button disabled={busy} onClick={() => mutate("/api/admin/banners", "PATCH", { ...item, active: !item.active }, "Banner status updated.")} className="rounded-lg border px-3 py-1.5">{item.active ? "Deactivate" : "Activate"}</button>
          <button disabled={busy} onClick={() => { if (window.confirm(`Delete banner ${item.title} and its image?`)) mutate("/api/admin/banners", "DELETE", { id: item.id }, "Banner deleted."); }} className="text-red-700 underline">Delete</button>
        </li>)}</ul>
      </section>

      <section id="security" className={card}>
        <div className="grid gap-8 xl:grid-cols-2">
          <div><h2 className="text-xl font-semibold">IP access blocks</h2><form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); mutate("/api/admin/security", "POST", blockForm, "IP address blocked."); setBlockForm({ address: "", reason: "" }); }}><input className={field} placeholder="IPv4 or IPv6 address" value={blockForm.address} onChange={(e) => setBlockForm({ ...blockForm, address: e.target.value })} required /><input className={field} placeholder="Reason for block" value={blockForm.reason} onChange={(e) => setBlockForm({ ...blockForm, reason: e.target.value })} required /><button className="rounded-xl bg-forest px-4 py-2.5 text-sm font-semibold text-white">Block IP</button></form><ul className="mt-4 divide-y">{security?.blockedIps.map((item) => <li key={item.id} className="flex justify-between gap-3 py-3 text-sm"><span>{item.address} · {item.reason}</span><button onClick={() => mutate("/api/admin/security", "DELETE", { id: item.id }, "IP unblocked.")} className="text-red-700 underline">Unblock</button></li>)}</ul></div>
          <div><h2 className="text-xl font-semibold">Security events</h2><ul className="mt-4 max-h-80 divide-y overflow-y-auto">{security?.events.map((item) => <li key={item.id} className="py-3 text-sm"><p className="font-semibold">{item.type} · {item.email || "unknown account"}</p><p className="mt-1 text-slate-500">{item.details} · {item.ipAddress || "IP unavailable"}</p><p className="text-xs text-slate-400">{new Date(item.createdAt).toLocaleString()}</p></li>)}</ul></div>
        </div>
        <div className="mt-8"><h2 className="text-xl font-semibold">Active sessions</h2><ul className="mt-3 divide-y">{sessions.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><span><b>{item.name}</b> · {item.email} · {item.role} · {item.ipAddress || "IP unavailable"}</span><button disabled={busy} onClick={() => mutate("/api/admin/sessions", "DELETE", { id: item.id }, "Session terminated.")} className="rounded-lg border border-red-200 px-3 py-1.5 text-red-700">Force sign out</button></li>)}</ul></div>
        <div className="mt-8"><h2 className="text-xl font-semibold">Administrator audit trail</h2><ul className="mt-3 divide-y">{overview?.audits.map((item) => <li key={item.id} className="py-3 text-sm"><b>{item.actor}</b> · {item.action} · {item.targetType || "system"} · <span className="text-slate-500">{new Date(item.createdAt).toLocaleString()}</span></li>)}</ul></div>
      </section>
      {overview && <section id="financial" className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">Financial transaction ledger</h2><p className="mt-1 text-sm text-slate-500">Search and filter immutable payment and payout records. {ledger.total} matched.</p></div><button type="button" onClick={exportLedger} className="rounded-lg border px-3 py-2 text-sm font-semibold">Export CSV</button></div>
        <form onSubmit={recordExpense} className="mt-4 grid gap-3 sm:grid-cols-[1fr_2fr_auto]">
          <input className={field} type="number" min="0.01" step="0.01" placeholder="Expense in PKR" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} required />
          <input className={field} placeholder="Expense description" value={expenseForm.description} onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} maxLength={240} required />
          <button disabled={busy} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold disabled:opacity-50">Record expense</button>
        </form>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <input className={field} placeholder="Search transaction, sender, package" value={ledgerFilters.q} onChange={(e) => { setLedgerFilters({ ...ledgerFilters, q: e.target.value }); setLedgerPage(1); }} />
          <select className={field} value={ledgerFilters.type} onChange={(e) => { setLedgerFilters({ ...ledgerFilters, type: e.target.value }); setLedgerPage(1); }}><option value="">All transaction types</option><option value="packageRevenue">Package revenue</option><option value="payout">Payout</option><option value="withdrawalFee">Withdrawal fee</option><option value="expense">Expense</option><option value="adjustment">Adjustment</option></select>
          <select className={field} value={ledgerFilters.status} onChange={(e) => { setLedgerFilters({ ...ledgerFilters, status: e.target.value }); setLedgerPage(1); }}><option value="">All statuses</option><option value="completed">Completed</option><option value="pending">Pending</option><option value="rejected">Rejected</option></select>
          <input className={field} type="date" aria-label="From date" value={ledgerFilters.from} onChange={(e) => { setLedgerFilters({ ...ledgerFilters, from: e.target.value }); setLedgerPage(1); }} />
          <input className={field} type="date" aria-label="To date" value={ledgerFilters.to} onChange={(e) => { setLedgerFilters({ ...ledgerFilters, to: e.target.value }); setLedgerPage(1); }} />
        </div>
        {ledgerLoading && <p className="mt-3 text-sm text-slate-500">Loading ledger…</p>}
        <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[1200px] text-left text-sm"><thead><tr className="border-b text-slate-500"><th className="py-3">Date</th><th>Type / status</th><th>Description</th><th>Account</th><th>Transaction / sender</th><th>Package / source</th><th>Amount</th><th>Recorded by</th></tr></thead><tbody>{ledger.transactions.map((item) => <tr key={item.id} className="border-b align-top last:border-0"><td className="py-3">{new Date(item.createdAt).toLocaleString()}</td><td className="capitalize">{item.type}<p className="text-xs text-slate-500">{item.status}</p></td><td>{item.description}</td><td>{item.user ? <>{item.user.name}<p className="text-xs text-slate-500">{item.user.email}</p></> : "—"}</td><td>{item.registration?.transactionId || "—"}<p className="text-xs text-slate-500">{item.registration?.senderName || ""}</p><p className="text-xs text-slate-500">{item.registration?.senderAccountNumber || ""}</p></td><td>{item.registration?.packageName || "—"}<p className="text-xs text-slate-500">Submit IP: {item.registration?.submissionIpAddress || "—"}</p><p className="text-xs text-slate-500">Approval IP: {item.registration?.approvalIpAddress || "—"}</p></td><td>{money(item.amountMinor)}</td><td>{item.createdBy}</td></tr>)}</tbody></table></div>
        {!ledgerLoading && ledger.transactions.length === 0 && <p className="mt-3 text-sm text-slate-500">No financial transactions match these filters.</p>}
        <div className="mt-4 flex items-center justify-between text-sm"><span>Page {ledgerPage} of {Math.max(ledger.pages, 1)}</span><div className="flex gap-2"><button type="button" disabled={ledgerPage <= 1 || ledgerLoading} onClick={() => setLedgerPage((page) => page - 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Previous</button><button type="button" disabled={ledgerPage >= ledger.pages || ledgerLoading} onClick={() => setLedgerPage((page) => page + 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Next</button></div></div>
      </section>}
    </>}

    {role === "helpAdmin" && <section className={card}><h2 className="text-xl font-semibold">Flagged feedback</h2><p className="mt-1 text-sm text-slate-500">Review flagged content below and use the support queue to communicate with users.</p><p className="mt-4 font-medium">{overview?.ratings.flagged || 0} rating(s) flagged for review.</p></section>}
  </div>;
}
