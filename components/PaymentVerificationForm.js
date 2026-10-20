"use client";

import { useEffect, useState } from "react";
import UserTopNav from "@/components/UserTopNav";

function formatMoney(amountMinor, currency) {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

export default function PaymentVerificationForm() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [paymentAccountId, setPaymentAccountId] = useState("");
  const [packageId, setPackageId] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [senderName, setSenderName] = useState("");
  const [senderAccountNumber, setSenderAccountNumber] = useState("");
  const [proof, setProof] = useState(null);

  useEffect(() => {
    async function loadInstructions() {
      try {
        const response = await fetch("/api/payment", { cache: "no-store" });
        const result = await response.json();
        if (!response.ok) {
          setError(result.error || "Could not load payment details.");
          return;
        }
        setData(result);
        setPackageId(result.canRenew ? result.availablePackages?.[0]?.id || "" : result.package?.id || "");
        if (result.paymentAccounts[0]) {
          setPaymentAccountId(result.paymentAccounts[0].id);
        }
      } catch {
        setError("Could not load payment instructions. Please retry.");
      } finally {
        setLoading(false);
      }
    }
    loadInstructions();
  }, []);

  async function copyAccountNumber(value) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage("Account number copied.");
    } catch {
      setError("Could not copy the account number. Please copy it manually.");
    }
  }

  async function submitProof(event) {
    event.preventDefault();
    const form = event.currentTarget;
    setError("");
    setMessage("");
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.set("paymentAccountId", paymentAccountId);
      if (packageId) formData.set("packageId", packageId);
      formData.set("transactionId", transactionId);
      formData.set("senderName", senderName);
      formData.set("senderAccountNumber", senderAccountNumber);
      if (proof) formData.set("proof", proof);
      const response = await fetch("/api/payment", {
        method: "POST",
        body: formData,
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || "Could not submit payment proof.");
        return;
      }

      setMessage(result.message);
      const refresh = await fetch("/api/payment", { cache: "no-store" });
      const paymentData = await refresh.json();
      if (refresh.ok) setData(paymentData);
      setTransactionId("");
      setSenderName("");
      setSenderAccountNumber("");
      setProof(null);
      form.reset();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? `Payment proof submission failed: ${submitError.message}`
          : "Payment proof submission failed because of an unexpected network error.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const selectedPackage = data?.canRenew
    ? data.availablePackages?.find((item) => item.id === packageId) || data.package
    : data?.package;
  const selectedAccount = data?.paymentAccounts?.find((item) => item.id === paymentAccountId);

  if (loading) {
    return (
      <main className="min-h-screen bg-paper p-6">
        <div className="mx-auto max-w-4xl animate-pulse space-y-4">
          <div className="h-12 rounded-xl bg-slate-200" />
          <div className="h-56 rounded-2xl bg-white" />
          <div className="h-72 rounded-2xl bg-white" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-paper px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-forest p-6 text-white sm:p-8">
          <div>
            <p className="text-sm uppercase tracking-[0.16em] text-white/70">
              {data?.canRenew ? "Ratewell package renewal" : "Ratewell account activation"}
            </p>
            <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">
              {data?.canRenew ? "Renew your package" : "Complete package payment"}
            </h1>
          </div>
          <UserTopNav />
        </header>

        {selectedPackage && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
            <p className="text-sm font-semibold uppercase tracking-wide text-forest">
              Selected package
            </p>
            <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold">{selectedPackage.name}</h2>
                <p className="mt-2 text-slate-600">{selectedPackage.description}</p>
              </div>
              <p className="text-2xl font-bold text-forest">
                {formatMoney(selectedPackage.priceMinor, selectedPackage.currency)}
              </p>
            </div>
            <p className="mt-3 text-sm text-slate-500">{selectedPackage.validityDays || 30}-day validity · {selectedPackage.dailyTaskQuota ? `${selectedPackage.dailyTaskQuota} tasks/day` : "No daily task cap"} · {selectedPackage.dailyEarningLimitMinor ? `${formatMoney(selectedPackage.dailyEarningLimitMinor, selectedPackage.currency)}/day earning cap` : "No daily earning cap"}</p>
            {selectedPackage.benefits.length > 0 && (
              <ul className="mt-4 list-inside list-disc space-y-1 text-sm text-slate-600">
                {selectedPackage.benefits.map((benefit) => (
                  <li key={benefit}>{benefit}</li>
                ))}
              </ul>
            )}
          </section>
        )}

        {data?.verification && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <h2 className="font-semibold text-amber-900">
              Payment review: {data.verification.status}
            </h2>
            <p className="mt-1 text-sm text-amber-800">
              Transaction {data.verification.transactionId} · submitted{" "}
              {new Date(data.verification.createdAt).toISOString().slice(0, 10)}
            </p>
            {data.verification.reviewNote && (
              <p className="mt-2 text-sm text-amber-800">
                Admin note: {data.verification.reviewNote}
              </p>
            )}
          </section>
        )}

        {data?.canRenew && data.cooldownActive && (
          <section className="rounded-2xl border border-violet-200 bg-violet-50 p-5 text-violet-950">
            <h2 className="font-semibold">Renewal cooldown policy</h2>
            <p className="mt-1 text-sm">
              During this period, only the recommended renewal package is available.
              {data.cooldownEndsAt ? ` This restriction ends ${new Date(data.cooldownEndsAt).toLocaleString()}.` : ""}
            </p>
          </section>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
          <h2 className="text-xl font-semibold">Company payment accounts</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Transfer the exact package amount, then submit your transaction details.
            {data?.canRenew
              ? " Your task access and earning resume after staff approves this renewal."
              : " Your account stays inactive until staff verifies the transfer."}
          </p>
          {data?.paymentAccounts.length ? (
            <fieldset className="mt-5 grid gap-3 sm:grid-cols-2">
              <legend className="mb-2 text-sm font-semibold">Choose where you will pay</legend>
              {data.paymentAccounts.map((account) => (
                <div key={account.id} className={`rounded-xl border p-4 ${paymentAccountId === account.id ? "border-forest bg-mint/20" : "border-slate-200"}`}>
                  <label className="flex cursor-pointer items-start gap-3">
                    <input type="radio" name="paymentAccount" required value={account.id} checked={paymentAccountId === account.id} onChange={() => setPaymentAccountId(account.id)} className="mt-1" />
                    <span className="min-w-0">
                      <span className="block font-semibold">{account.displayName}</span>
                      {account.bankName && <span className="mt-1 block text-sm text-slate-600">{account.bankName}</span>}
                      <span className="mt-1 block text-sm text-slate-600">{account.accountTitle}</span>
                      <code className="mt-2 block break-all text-sm">{account.accountNumber}</code>
                    </span>
                  </label>
                  <button type="button" onClick={() => void copyAccountNumber(account.accountNumber)} className="ml-7 mt-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold">Copy ID</button>
                </div>
              ))}
            </fieldset>
          ) : (
            <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
              Payment accounts are not configured yet. Please check back later.
            </p>
          )}
          {selectedAccount && (
            <div className="mt-4 rounded-xl bg-slate-50 p-4">
              <p className="font-semibold">Payment instructions for {selectedAccount.displayName}</p>
              {selectedAccount.instructions && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{selectedAccount.instructions}</p>}
              {selectedAccount.qrUrl && <img src={selectedAccount.qrUrl} alt={`${selectedAccount.displayName} payment QR code`} className="mt-4 h-48 w-48 rounded-lg border bg-white object-contain p-2" />}
              <p className="mt-3 text-sm font-semibold">Transfer exactly {selectedPackage ? formatMoney(selectedPackage.priceMinor, selectedPackage.currency) : "the package amount"}.</p>
            </div>
          )}
        </section>

        {data?.canRenew && !data.availablePackages.length && (
          <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
            There are no active packages available for renewal yet. Please contact support.
          </p>
        )}

        {!data?.verification || data.verification.status === "rejected" || data?.canRenew ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
            <h2 className="text-xl font-semibold">Submit payment proof</h2>
            <form onSubmit={submitProof} className="mt-5 grid gap-4 sm:grid-cols-2">
              {data?.canRenew && <label className="block sm:col-span-2"><span className="mb-2 block text-sm font-medium">Choose renewal package</span><select className="w-full rounded-xl border border-slate-200 px-3 py-3" value={packageId} onChange={(event) => setPackageId(event.target.value)} required>{data.availablePackages.map((item) => <option key={item.id} value={item.id}>{item.name} · {formatMoney(item.priceMinor, item.currency)} · withdrawal min {formatMoney(item.minimumWithdrawalMinor, item.currency)} · {item.maximumWithdrawalMinor === null ? "no max" : `max ${formatMoney(item.maximumWithdrawalMinor, item.currency)}`}</option>)}</select></label>}
              <label className="block">
                <span className="mb-2 block text-sm font-medium">Transaction ID</span>
                <input
                  required
                  maxLength={120}
                  value={transactionId}
                  onChange={(event) => setTransactionId(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium">Sender name</span>
                <input
                  required
                  maxLength={120}
                  value={senderName}
                  onChange={(event) => setSenderName(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium">Sender account number</span>
                <input
                  required
                  maxLength={64}
                  value={senderAccountNumber}
                  onChange={(event) => setSenderAccountNumber(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium">Payment screenshot</span>
                <input
                  type="file"
                  required
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => setProof(event.target.files?.[0] || null)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                />
                <span className="mt-1 block text-xs text-slate-500">JPEG, PNG, or WebP; up to 5 MB.</span>
              </label>
              {error && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{error}</p>}
              {message && <p role="status" className="text-sm text-forest sm:col-span-2">{message}</p>}
              <button
                type="submit"
                disabled={
                  submitting ||
                  !selectedPackage ||
                  !data.paymentAccounts.length ||
                  (data?.canRenew && !data.availablePackages.length) ||
                  (data.verification?.status === "pending")
                }
                className="rounded-xl bg-forest px-4 py-3 font-semibold text-white disabled:opacity-50 sm:col-span-2"
              >
                {submitting ? "Submitting…" : "Submit for verification"}
              </button>
            </form>
          </section>
        ) : (
          <p className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
            Your payment proof is awaiting manual verification. We’ll activate
            your account after approval.
          </p>
        )}
      </div>
    </main>
  );
}
