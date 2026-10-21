"use client";

import { useCallback, useEffect, useState } from "react";
import UserTopNav from "@/components/UserTopNav";
import {
  calculateWithdrawalFee,
  getWithdrawalFeeBasisPoints,
} from "@/lib/withdrawal-fee";

const card = "rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8";
const input = "mt-1 w-full rounded-xl border border-slate-200 px-4 py-3";

function money(minor = 0) {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
  }).format(minor / 100);
}

function useRemoteData(path) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    try {
      const response = await fetch(path, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load this page.");
      setData(result);
      setError("");
    } catch (loadError) {
      setError(loadError.message || "Could not load this page.");
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    let cancelled = false;
    fetch(path, { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load this page.");
        if (!cancelled) {
          setData(result);
          setError("");
        }
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError.message || "Could not load this page.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [path]);
  return { data, setData, error, setError, loading, reload };
}

function PageFrame({ title, intro, children }) {
  return (
    <main className="min-h-screen bg-paper px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-5 rounded-2xl bg-forest p-6 text-white sm:p-8">
          <div>
            <a className="text-sm text-white/75 hover:text-white" href="/dashboard">Ratewell / Dashboard</a>
            <h1 className="mt-3 text-3xl font-semibold">{title}</h1>
            <p className="mt-2 text-sm leading-6 text-white/75">{intro}</p>
          </div>
          <UserTopNav />
        </header>
        {children}
      </div>
    </main>
  );
}

function Notice({ error, message }) {
  return (
    <>
      {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="mb-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{message}</p>}
    </>
  );
}

export function UserWallet() {
  const { data, error, setError, loading, reload } = useRemoteData("/api/wallet");
  const { data: depositData, error: depositError, reload: reloadDeposits } = useRemoteData("/api/deposits");
  const { data: packageData, error: packageError, reload: reloadPackages } = useRemoteData("/api/packages");
  const [amount, setAmount] = useState("");
  const [receipt, setReceipt] = useState(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [depositForm, setDepositForm] = useState({ amount: "", paymentAccountId: "", transactionId: "", senderName: "", senderAccountNumber: "" });
  const [depositProof, setDepositProof] = useState(null);
  const [packageId, setPackageId] = useState("");
  const [copiedPaymentAccount, setCopiedPaymentAccount] = useState(false);
  const selectedDepositAccount = depositData?.paymentAccounts?.find(
    (account) => account.id === depositForm.paymentAccountId,
  );
  const selectedWalletPackage = packageData?.packages?.find((item) => item.id === packageId);
  const amountMinor = Math.round(Number(amount) * 100);
  const feeBasisPoints = data && Number.isSafeInteger(amountMinor) && amountMinor > 0
    ? getWithdrawalFeeBasisPoints(amountMinor, data.withdrawalFeeBrackets || [])
    : null;
  const feeMinor = feeBasisPoints === null
    ? 0
    : calculateWithdrawalFee(amountMinor, 0, feeBasisPoints);
  const netPayoutMinor = amountMinor - feeMinor;
  const maximumAllowedMinor = data
    ? Math.min(data.balanceMinor, data.maximumWithdrawalMinor ?? data.balanceMinor)
    : 0;
  const amountWithinWithdrawalLimits = Boolean(data) &&
    amountMinor >= data.minimumWithdrawalMinor &&
    amountMinor <= maximumAllowedMinor &&
    feeBasisPoints !== null &&
    netPayoutMinor >= 1;
  async function withdraw(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSaving(true);
    try {
      const response = await fetch("/api/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountMinor }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Withdrawal request failed.");
      setMessage(result.message);
      setAmount("");
      await reload();
    } catch (requestError) {
      setError(requestError.message || "Withdrawal request failed.");
    } finally {
      setSaving(false);
    }
  }
  async function copyDepositAccount() {
    if (!selectedDepositAccount?.accountNumber) return;
    try {
      await navigator.clipboard.writeText(selectedDepositAccount.accountNumber);
      setCopiedPaymentAccount(true);
    } catch (copyError) {
      setError(copyError.message || "Could not copy payment account details.");
    }
  }
  async function submitDeposit(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSaving(true);
    try {
      const form = new FormData();
      form.set("amountMinor", String(Math.round(Number(depositForm.amount) * 100)));
      for (const [key, value] of Object.entries(depositForm)) {
        if (key !== "amount") form.set(key, value);
      }
      if (depositProof) form.set("proof", depositProof);
      const response = await fetch("/api/deposits", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not submit deposit proof.");
      setMessage(result.message);
      setDepositForm({ amount: "", paymentAccountId: "", transactionId: "", senderName: "", senderAccountNumber: "" });
      setDepositProof(null);
      await reloadDeposits();
    } catch (requestError) {
      setError(requestError.message || "Could not submit deposit proof.");
    } finally {
      setSaving(false);
    }
  }
  async function purchasePackage(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSaving(true);
    try {
      const response = await fetch("/api/packages/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not purchase package.");
      setMessage(result.message);
      await Promise.all([reload(), reloadPackages()]);
    } catch (requestError) {
      setError(requestError.message || "Could not purchase package.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <PageFrame title="Wallet" intro="Review your available balance, earnings, and payout history.">
      <Notice error={error} message={message} />
      {(depositError || packageError) && <Notice error={depositError || packageError} />}
      {loading && <p className="text-sm text-slate-500">Loading your wallet…</p>}
      {data && <>
        <section id="withdrawals" className={`${card} mb-6`}>
          <p className="text-sm font-medium text-slate-500">Available balance</p>
          <p className="mt-2 text-4xl font-semibold text-forest">{money(data.balanceMinor)}</p>
          <p className="mt-2 text-sm text-emerald-800">Task rewards are credited automatically to your balance the moment you complete a task. No approval is required.</p>
          <p className="mt-3 text-sm text-slate-500">Withdrawal limits: {money(data.minimumWithdrawalMinor)} minimum · {data.maximumWithdrawalMinor === null ? "No package maximum" : `${money(data.maximumWithdrawalMinor)} maximum`}</p>
          <p className="mt-1 text-sm text-slate-500">Payout account: {data.payoutProfile ? `${data.payoutProfile.provider} · ${data.payoutProfile.accountTitle}` : "Not configured"}</p>
          {data.payoutProfile && <span className="mt-2 inline-flex rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800">Estimated processing: {["usdtBep20", "usdtTrc20"].includes(data.payoutProfile.provider) ? "30–60 minutes" : "5–15 minutes"}</span>}
          {!data.payoutProfile && <a className="mt-3 inline-block font-semibold text-forest underline" href="/dashboard/settings/withdrawal">Set up withdrawal details</a>}
          <form className="mt-6 flex flex-col gap-3 sm:flex-row" onSubmit={withdraw}>
            <label className="flex-1 text-sm font-medium">Amount (PKR)
              <input className={input} type="number" min={data.minimumWithdrawalMinor / 100} step="0.01" max={maximumAllowedMinor / 100} value={amount} onChange={(event) => setAmount(event.target.value)} required />
              <span className="mt-1 block text-xs font-normal text-slate-500">
                {feeBasisPoints === null && amount
                  ? "No package fee rule covers this amount."
                  : `Fee ${feeBasisPoints === null ? money(0) : `${(feeBasisPoints / 100).toFixed(2)}% (${money(feeMinor)})`} · You receive ${money(Math.max(0, netPayoutMinor))}`}
              </span>
            </label>
            <button type="button" onClick={() => setAmount((maximumAllowedMinor / 100).toFixed(2))} disabled={maximumAllowedMinor < data.minimumWithdrawalMinor} className="self-end rounded-xl border border-slate-300 px-4 py-3 font-semibold disabled:opacity-50">Use Max</button>
            <button disabled={saving || !data.payoutProfile || !amountWithinWithdrawalLimits} className="self-end rounded-xl bg-forest px-5 py-3 font-semibold text-white disabled:opacity-50">{saving ? "Submitting…" : "Request withdrawal"}</button>
          </form>
        </section>
        <section className={`${card} mb-6`}>
          <div className="grid gap-5 md:grid-cols-2">
            <div id="packages">
              <p className="text-sm font-medium text-slate-500">Deposit Wallet</p>
              <p className="mt-2 text-3xl font-semibold text-forest">{money(data.depositBalanceMinor)}</p>
              <p className="mt-2 text-sm text-slate-500">Approved deposits are reserved for package purchases and are separate from withdrawable earnings.</p>
              <form className="mt-5 space-y-3" onSubmit={purchasePackage}>
                <label className="block text-sm font-medium">Renew or purchase a package
                  <select className={input} value={packageId} onChange={(event) => setPackageId(event.target.value)} required>
                    <option value="">Choose a package</option>
                    {(packageData?.packages || []).map((item) => <option key={item.id} value={item.id}>{item.name} · {money(item.priceMinor)} · {item.validityDays} days · {money(item.perTaskEarningsMinor)}/task · {item.dailyTaskLimit || "unlimited"} tasks/day</option>)}
                  </select>
                </label>
                {selectedWalletPackage && <div className="text-xs text-slate-600">
                  <p>Withdrawal limits: {money(selectedWalletPackage.minimumWithdrawalMinor)} minimum · {selectedWalletPackage.maximumWithdrawalMinor === null ? "no maximum" : `${money(selectedWalletPackage.maximumWithdrawalMinor)} maximum`}</p>
                  <ul className="mt-1 list-inside list-disc">
                    {selectedWalletPackage.withdrawalFeeBrackets.map((bracket) => <li key={`${bracket.minimumAmountMinor}-${bracket.maximumAmountMinor}`}>
                      {money(bracket.minimumAmountMinor)}–{bracket.maximumAmountMinor === null ? "up" : money(bracket.maximumAmountMinor)}: {(bracket.basisPoints / 100).toFixed(2)}% fee
                    </li>)}
                  </ul>
                </div>}
                <button disabled={saving || !packageId} className="rounded-xl bg-forest px-4 py-3 font-semibold text-white disabled:opacity-50">{saving ? "Please wait…" : "Purchase with Deposit Wallet"}</button>
              </form>
            </div>
            <div id="deposits">
              <h2 className="text-lg font-semibold">Submit a deposit proof</h2>
              <p className="mt-1 text-sm text-slate-500">Admin approval credits the amount to your Deposit Wallet; package purchase is a separate step.</p>
              <form className="mt-4 grid gap-3" onSubmit={submitDeposit}>
                <label className="text-sm">Amount (PKR)<input className={input} type="number" min="1" step="0.01" required value={depositForm.amount} onChange={(event) => setDepositForm({ ...depositForm, amount: event.target.value })} /></label>
                <label className="text-sm">Company payment account<select className={input} required value={depositForm.paymentAccountId} onChange={(event) => { setCopiedPaymentAccount(false); setDepositForm({ ...depositForm, paymentAccountId: event.target.value }); }}><option value="">Select payment account</option>{(depositData?.paymentAccounts || []).map((account) => <option key={account.id} value={account.id}>{account.displayName} · {account.accountTitle}</option>)}</select></label>
                {selectedDepositAccount && <div className="rounded-xl bg-slate-50 p-4 text-sm">
                  <p className="font-semibold">{selectedDepositAccount.displayName} · {selectedDepositAccount.accountTitle}</p>
                  {selectedDepositAccount.bankName && <p className="mt-1 text-slate-600">{selectedDepositAccount.bankName}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-3"><code className="break-all">{selectedDepositAccount.accountNumber}</code><button type="button" onClick={copyDepositAccount} className="rounded-lg border px-3 py-1.5 text-xs font-semibold">{copiedPaymentAccount ? "Copied" : "Copy account ID"}</button></div>
                  {selectedDepositAccount.instructions && <p className="mt-3 whitespace-pre-wrap text-slate-600">{selectedDepositAccount.instructions}</p>}
                  {selectedDepositAccount.qrUrl && <img src={selectedDepositAccount.qrUrl} alt={`${selectedDepositAccount.displayName} payment QR code`} className="mt-3 h-40 w-40 rounded-lg border bg-white object-contain p-2" />}
                </div>}
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm">Transaction ID<input className={input} required maxLength={120} value={depositForm.transactionId} onChange={(event) => setDepositForm({ ...depositForm, transactionId: event.target.value })} /></label>
                  <label className="text-sm">Sender name<input className={input} required maxLength={120} value={depositForm.senderName} onChange={(event) => setDepositForm({ ...depositForm, senderName: event.target.value })} /></label>
                </div>
                <label className="text-sm">Sender account number<input className={input} required maxLength={64} value={depositForm.senderAccountNumber} onChange={(event) => setDepositForm({ ...depositForm, senderAccountNumber: event.target.value })} /></label>
                <label className="text-sm">Payment screenshot (JPEG, PNG, WebP; max 5 MB)<input className={`${input} file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1`} type="file" accept="image/jpeg,image/png,image/webp" required onChange={(event) => setDepositProof(event.target.files?.[0] || null)} /></label>
                <button disabled={saving || !depositData?.paymentAccounts?.length} className="justify-self-start rounded-xl border border-forest px-4 py-3 font-semibold text-forest disabled:opacity-50">{saving ? "Submitting…" : "Submit deposit proof"}</button>
              </form>
            </div>
          </div>
          {depositData?.deposits?.length > 0 && <div className="mt-6 overflow-x-auto"><h3 className="mb-2 font-semibold">Deposit proof history</h3><table className="w-full min-w-[480px] text-left text-sm"><thead><tr className="border-b text-slate-500"><th className="py-2">Amount</th><th>Transaction</th><th>Status</th><th>Submitted</th></tr></thead><tbody>{depositData.deposits.map((item) => <tr className="border-b last:border-0" key={item.id}><td className="py-2">{money(item.amountMinor)}</td><td>{item.transactionId}</td><td className="capitalize">{item.status}{item.reviewNote && <p className="text-xs text-red-700">{item.reviewNote}</p>}</td><td>{new Date(item.createdAt).toLocaleDateString()}</td></tr>)}</tbody></table></div>}
        </section>
        <section className={`${card} mb-6 overflow-x-auto`}>
          <h2 className="mb-4 text-xl font-semibold">Wallet activity</h2>
          {data.transactions.length === 0 ? <p className="text-sm text-slate-500">No wallet transactions yet.</p> : <table className="w-full min-w-[560px] text-left text-sm">
            <thead><tr className="border-b text-slate-500"><th className="py-3">Activity</th><th>Type</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
            <tbody>{data.transactions.map((item) => <tr key={item.id} className="border-b last:border-0"><td className="py-3">{item.description}</td><td>{item.wallet === "deposit" ? "Deposit Wallet" : "Earning Wallet"} · {item.type}</td><td className={item.direction === "credit" ? "text-emerald-700" : "text-slate-800"}>{item.direction === "credit" ? "+" : "−"}{money(item.amountMinor)}</td><td>{item.status}</td><td>{new Date(item.createdAt).toLocaleDateString()}</td></tr>)}</tbody>
          </table>}
        </section>
        <section className={`${card} mb-6 overflow-x-auto`}>
          <h2 className="mb-4 text-xl font-semibold">Package history</h2>
          {data.packageHistory?.length ? <table className="w-full min-w-[620px] text-left text-sm"><thead><tr className="border-b text-slate-500"><th className="py-3">Package</th><th>Event</th><th>Purchase / duration and withdrawal rules</th><th>Activated</th><th>Expires</th></tr></thead><tbody>{data.packageHistory.map((item) => <tr key={item.id} className="border-b last:border-0"><td className="py-3 font-medium">{item.packageName}</td><td className="capitalize">{item.event}</td><td>{money(item.amountMinor)} · {item.validityDays} days{item.extendedDays ? ` · +${item.extendedDays} extension days` : ""}<span className="mt-1 block text-xs text-slate-500">Withdraw {money(item.minimumWithdrawalMinor)}–{item.maximumWithdrawalMinor === null ? "unlimited" : money(item.maximumWithdrawalMinor)}</span>{item.withdrawalFeeBrackets.map((bracket) => <span key={`${bracket.minimumAmountMinor}-${bracket.maximumAmountMinor}`} className="block text-xs text-slate-500">{money(bracket.minimumAmountMinor)}–{bracket.maximumAmountMinor === null ? "up" : money(bracket.maximumAmountMinor)}: {(bracket.basisPoints / 100).toFixed(2)}%</span>)}</td><td>{new Date(item.activatedAt).toLocaleDateString()}</td><td>{new Date(item.expiresAt).toLocaleDateString()}</td></tr>)}</tbody></table> : <p className="text-sm text-slate-500">Package history from new purchases and changes will appear here. Earlier payment and purchase records remain in the financial ledger.</p>}
        </section>
        <section className={card}>
          <h2 className="mb-4 text-xl font-semibold">Withdrawal requests</h2>
          {data.withdrawals.length === 0 ? <p className="text-sm text-slate-500">No withdrawal requests yet.</p> : <ul className="divide-y">{data.withdrawals.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm"><span>{money(item.amountMinor)} requested · {item.provider}</span><span className="font-semibold capitalize">{item.status}</span><span className="text-slate-500">{new Date(item.createdAt).toLocaleDateString()}</span><button type="button" onClick={() => setReceipt(item)} className="font-semibold text-forest underline">Receipt</button>{item.reviewNote && <p className="w-full text-slate-600">{item.reviewNote}</p>}</li>)}</ul>}
        </section>
        {receipt && <div role="dialog" aria-modal="true" aria-labelledby="withdrawal-receipt-title" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4">
          <section className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl print:shadow-none">
            <div className="flex items-start justify-between gap-4"><div><h2 id="withdrawal-receipt-title" className="text-xl font-semibold">Withdrawal receipt</h2><p className="mt-1 text-xs text-slate-500">Reference {receipt.id}</p></div><button type="button" aria-label="Close receipt" onClick={() => setReceipt(null)} className="rounded-lg border px-3 py-1.5">Close</button></div>
            <dl className="mt-5 grid grid-cols-2 gap-4 text-sm"><div><dt className="text-slate-500">Requested</dt><dd className="mt-1 font-semibold">{money(receipt.amountMinor)}</dd></div><div><dt className="text-slate-500">Fee ({(receipt.feeBasisPoints / 100).toFixed(2)}%)</dt><dd className="mt-1 font-semibold">{money(receipt.feeMinor)}</dd></div><div><dt className="text-slate-500">Recipient receives</dt><dd className="mt-1 font-semibold">{money(receipt.payoutMinor)}</dd></div><div><dt className="text-slate-500">Status</dt><dd className="mt-1 font-semibold capitalize">{receipt.status}</dd></div>{receipt.withdrawalPolicySnapshot?.packageName && <div><dt className="text-slate-500">Package policy</dt><dd className="mt-1 font-semibold">{receipt.withdrawalPolicySnapshot.packageName}</dd></div>}<div><dt className="text-slate-500">Method</dt><dd className="mt-1 font-semibold">{receipt.provider}</dd></div><div><dt className="text-slate-500">Recipient</dt><dd className="mt-1 font-semibold">{receipt.recipientName} · {receipt.recipientAccount}</dd></div><div><dt className="text-slate-500">Submitted</dt><dd className="mt-1 font-semibold">{new Date(receipt.createdAt).toLocaleString()}</dd></div>{receipt.payoutReference && <div><dt className="text-slate-500">Payout reference</dt><dd className="mt-1 break-all font-semibold">{receipt.payoutReference}</dd></div>}{receipt.reviewNote && <div className="col-span-2"><dt className="text-slate-500">Admin note / rejection reason</dt><dd className="mt-1 whitespace-pre-wrap font-semibold">{receipt.reviewNote}</dd></div>}</dl>
            <button type="button" onClick={() => window.print()} className="mt-6 rounded-xl bg-forest px-4 py-2.5 font-semibold text-white">Print / Save receipt</button>
          </section>
        </div>}
      </>}
    </PageFrame>
  );
}

export function UserReferrals() {
  const { data, error, loading } = useRemoteData("/api/referrals");
  const [copied, setCopied] = useState(false);
  async function copyLink() {
    if (!data?.referralUrl) return;
    await navigator.clipboard.writeText(data.referralUrl);
    setCopied(true);
  }
  return (
    <PageFrame title="Your referral network" intro="Track invitations, approved registrations, and referral commissions.">
      {error && <Notice error={error} />}
      {loading && <p className="text-sm text-slate-500">Loading referrals…</p>}
      {data && <>
        <section className={`${card} mb-6 grid gap-5 sm:grid-cols-3`}>
          <div><p className="text-sm text-slate-500">Referral earnings and rewards</p><p className="mt-2 text-2xl font-semibold">{money(data.earningsMinor)}</p></div>
          <div><p className="text-sm text-slate-500">Approved referrals</p><p className="mt-2 text-2xl font-semibold">{data.directConversions} direct · {data.indirectConversions} indirect</p><p className="mt-1 text-sm text-forest">{data.tier || "Starter tier"}</p></div>
          <div><p className="text-sm text-slate-500">Pending withdrawals</p><p className="mt-2 text-2xl font-semibold">{money(data.pendingWithdrawalsMinor)}</p></div>
        </section>
        {data.milestones?.length > 0 && <section id="referral-milestones" className={`${card} mb-6`}>
          <h2 className="mb-4 text-xl font-semibold">Referral milestones</h2>
          <ul className="divide-y">{data.milestones.map((milestone) => <li key={milestone.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><p className="font-semibold">{milestone.title}{milestone.tier ? ` · ${milestone.tier}` : ""}</p><p className="mt-1 text-sm text-slate-500">Need {milestone.requiredDirect} direct and {milestone.requiredIndirect} indirect approved referrals · {money(milestone.rewardMinor)} bonus</p></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${milestone.unlocked ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{milestone.unlocked ? "Bonus awarded" : "In progress"}</span></li>)}</ul>
        </section>}
        <section className={`${card} mb-6`}>
          <h2 className="text-xl font-semibold">Your invite link</h2>
          <p className="mt-2 break-all rounded-xl bg-slate-50 p-4 text-sm">{data.referralUrl}</p>
          <button onClick={copyLink} className="mt-3 rounded-xl bg-forest px-4 py-2.5 font-semibold text-white">{copied ? "Copied" : "Copy referral link"}</button>
          <p className="mt-3 text-sm text-slate-500">Visits: {data.events?.click || 0} · Registrations: {data.events?.registration || 0} · Conversions: {data.events?.conversion || 0}</p>
        </section>
        <section className={card}>
          <h2 className="mb-5 text-xl font-semibold">Referral tree</h2>
          <div className="space-y-6">{data.levels.map((level) => <div key={level.level}><h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Level {level.level} · {level.users.length} members</h3>{level.users.length ? <ul className="grid gap-3 sm:grid-cols-2">{level.users.map((member) => <li key={member.id} className="rounded-xl border border-slate-200 p-4"><p className="font-medium">{member.name}</p><p className="text-sm text-slate-500">{member.email}</p><p className="mt-2 text-xs capitalize text-forest">{member.converted ? "Package approved" : "Pending activation"}</p></li>)}</ul> : <p className="text-sm text-slate-400">No referrals at this level yet.</p>}</div>)}</div>
        </section>
      </>}
    </PageFrame>
  );
}

export function UserSettings() {
  const { data, error, setError, loading, reload } = useRemoteData("/api/settings");
  const { data: profileData, error: profileError, loading: profileLoading, reload: reloadProfile } = useRemoteData("/api/profile");
  const [message, setMessage] = useState("");
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [sessions, setSessions] = useState([]);
  useEffect(() => {
    fetch("/api/user/sessions", { cache: "no-store" }).then((response) => response.json()).then((result) => {
      if (Array.isArray(result.sessions)) setSessions(result.sessions);
      else if (result.error) setError(result.error);
    }).catch((loadError) => setError(loadError.message || "Could not load active sessions."));
  }, [setError]);
  async function updatePreferences(patch) {
    const next = { ...data.preferences, ...patch };
    const response = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not save settings.");
    if (patch.theme) {
      window.localStorage.setItem("ratewell-theme", patch.theme);
      document.documentElement.dataset.theme = patch.theme;
      window.dispatchEvent(new CustomEvent("ratewell-theme-change", { detail: patch.theme }));
    }
    setMessage(result.message);
    await reload();
  }
  async function endSessions() {
    setError("");
    try {
      const response = await fetch("/api/user/sessions", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not terminate sessions.");
      setMessage(`${result.message} You may need to sign in again.`);
      setSessions([]);
    } catch (requestError) {
      setError(requestError.message || "Could not terminate sessions.");
    }
  }
  async function saveWhatsApp(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: profileData.profile.name,
          whatsappPhone: whatsappPhone || profileData.profile.whatsappPhone,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save your WhatsApp number.");
      setWhatsappPhone(result.profile.whatsappPhone || "");
      setMessage("WhatsApp number saved.");
      await reloadProfile();
    } catch (saveError) {
      setError(saveError.message || "Could not save your WhatsApp number.");
    }
  }
  return (
    <PageFrame title="Account settings" intro="Manage privacy, notifications, payout details, and signed-in devices.">
      <Notice error={error} message={message} />
      {profileError && <Notice error={profileError} />}
      {loading && <p className="text-sm text-slate-500">Loading preferences…</p>}
      {data && <section className={`${card} mb-6`}>
        <h2 className="text-xl font-semibold">Preferences</h2>
        <label className="mt-5 flex items-center justify-between gap-4 border-b py-4"><span><span className="block font-medium">Email notifications</span><span className="text-sm text-slate-500">Receive important account updates.</span></span><input type="checkbox" checked={data.preferences.notifications} onChange={(event) => updatePreferences({ notifications: event.target.checked }).catch((e) => setError(e.message))} /></label>
        <label className="flex items-center justify-between gap-4 py-4"><span><span className="block font-medium">Public profile</span><span className="text-sm text-slate-500">Allow your name to be shown on public ratings.</span></span><input type="checkbox" checked={data.preferences.publicProfile} onChange={(event) => updatePreferences({ publicProfile: event.target.checked }).catch((e) => setError(e.message))} /></label>
        <label className="flex items-center justify-between gap-4 border-t py-4"><span><span className="block font-medium">Appearance</span><span className="text-sm text-slate-500">Choose day or night mode.</span></span><select className="rounded-lg border border-slate-200 px-3 py-2" value={data.preferences.theme || "light"} onChange={(event) => updatePreferences({ theme: event.target.value }).catch((e) => setError(e.message))}><option value="light">Day mode</option><option value="dark">Night mode</option></select></label>
        <a className="mt-3 inline-block font-semibold text-forest underline" href="/dashboard/settings/withdrawal">Withdrawal account settings</a>
      </section>}
      {profileLoading && <p role="status" className="text-sm text-slate-500">Loading contact details…</p>}
      {profileData?.profile && <section className={`${card} mb-6`}>
        <h2 className="text-xl font-semibold">WhatsApp contact number</h2>
        <p className="mt-1 text-sm text-slate-600">Used for account and support contact. Authorized admins can view it. You can update it here; no WhatsApp messages are sent by this form.</p>
        <form onSubmit={saveWhatsApp} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1 text-sm font-medium">WhatsApp phone number (include country code)
            <input className={input} type="tel" inputMode="tel" autoComplete="tel" maxLength={32} required value={whatsappPhone || profileData.profile.whatsappPhone || ""} onChange={(event) => setWhatsappPhone(event.target.value)} placeholder="+923001234567" />
          </label>
          <button className="rounded-xl bg-forest px-5 py-3 font-semibold text-white">Save number</button>
        </form>
      </section>}
      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">Active sessions</h2><p className="mt-1 text-sm text-slate-500">Sign out every device if you no longer recognize a session.</p></div><button onClick={endSessions} className="rounded-xl border border-red-200 px-4 py-2 font-semibold text-red-700">Sign out all devices</button></div>
        <ul className="mt-4 divide-y">{sessions.map((session) => <li key={session.id} className="py-3 text-sm"><p className="font-medium">{session.current ? "This device" : "Other device"}{session.current ? " · current" : ""}</p><p className="mt-1 break-all text-slate-500">{session.userAgent || "Unknown device"} · {session.ipAddress || "Unknown IP"}</p><p className="text-xs text-slate-400">Last active {new Date(session.lastSeenAt).toLocaleString()}</p></li>)}</ul>
      </section>
    </PageFrame>
  );
}

export function UserSupport() {
  const { data, error, setError, loading, reload } = useRemoteData("/api/support");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  async function submit(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/support", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subject, message }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not submit ticket.");
      setSubject("");
      setMessage("");
      setNotice("Support request submitted.");
      await reload();
    } catch (requestError) {
      setError(requestError.message || "Could not submit ticket.");
    }
  }
  return (
    <PageFrame title="Help and support" intro="Send a private request to the Ratewell support team and track its status.">
      <Notice error={error} message={notice} />
      <section className={`${card} mb-6`}>
        <h2 className="text-xl font-semibold">Create a support ticket</h2>
        <form onSubmit={submit} className="mt-5 space-y-4">
          <label className="block text-sm font-medium">Subject<input className={input} value={subject} maxLength={160} onChange={(event) => setSubject(event.target.value)} required /></label>
          <label className="block text-sm font-medium">Message<textarea className={input} rows={5} maxLength={4000} value={message} onChange={(event) => setMessage(event.target.value)} required /></label>
          <button className="rounded-xl bg-forest px-5 py-3 font-semibold text-white">Submit ticket</button>
        </form>
      </section>
      <section className={card}>
        <h2 className="text-xl font-semibold">Your tickets</h2>
        {loading && <p className="mt-4 text-sm text-slate-500">Loading tickets…</p>}
        {data && <ul className="mt-4 divide-y">{data.tickets.map((ticket) => <li key={ticket.id} className="py-4"><div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">{ticket.subject}</h3><span className="text-sm font-medium capitalize text-forest">{ticket.status}</span></div><p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{ticket.message}</p>{ticket.resolution && <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">Response: {ticket.resolution}</p>}</li>)}</ul>}
        {data?.tickets.length === 0 && <p className="mt-4 text-sm text-slate-500">No support requests yet.</p>}
      </section>
    </PageFrame>
  );
}
