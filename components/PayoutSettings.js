"use client";

import { useEffect, useState } from "react";
import UserTopNav from "@/components/UserTopNav";

export default function PayoutSettings() {
  const [profile, setProfile] = useState(null);
  const [methods, setMethods] = useState([]);
  const [provider, setProvider] = useState("");
  const [accountTitle, setAccountTitle] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [iban, setIban] = useState("");
  const [bankName, setBankName] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/user/payout-profile", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load payout details.");
        if (!cancelled) setProfile(result.payoutProfile);
        if (!cancelled) setMethods(result.methods || []);
        if (!cancelled) {
          const firstAvailable = result.methods?.[0]?.provider || "";
          const savedMethodAvailable = result.methods?.some((method) => method.provider === result.payoutProfile?.provider);
          setProvider(savedMethodAvailable ? result.payoutProfile.provider : firstAvailable);
        }
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError.message || "Could not load payout details.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  async function save(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSaving(true);
    try {
      const response = await fetch("/api/user/payout-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          accountTitle,
          accountNumber,
          iban,
          bankName,
          walletAddress,
          currentPassword,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save payout details.");
      setProfile(result.payoutProfile);
      setMessage(result.message);
      setCurrentPassword("");
      setAccountTitle("");
      setAccountNumber("");
      setIban("");
      setBankName("");
      setWalletAddress("");
    } catch (saveError) {
      setError(saveError.message || "Could not save payout details.");
    } finally {
      setSaving(false);
    }
  }

  const field = "mt-1 w-full rounded-xl border border-slate-200 px-4 py-3";
  const isCrypto = ["usdtBep20", "usdtTrc20"].includes(provider);
  const selectedMethod = methods.find((method) => method.provider === provider);
  const profileMethod = methods.find((method) => method.provider === profile?.provider);
  return (
    <main className="min-h-screen bg-paper px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-5 rounded-2xl bg-forest p-6 text-white sm:p-8">
          <div>
            <a className="text-sm text-white/75" href="/dashboard/settings">Ratewell / Settings</a>
            <h1 className="mt-3 text-3xl font-semibold">Withdrawal details</h1>
            <p className="mt-2 text-white/75">Sensitive payout details are encrypted and masked in ordinary views.</p>
          </div>
          <UserTopNav />
        </header>
        {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
        {message && <p role="status" className="mb-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{message}</p>}
        {loading ? <p>Loading payout account…</p> : (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
            <h2 className="text-xl font-semibold">{profile ? "Update your payout account" : "Set your payout account"}</h2>
            {profile && (
              <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm">
                <p className="font-semibold">Saved {profileMethod?.displayName || profile.provider} details</p>
                <p className="mt-1 text-slate-600">{profile.accountTitle} · {profile.walletAddress || profile.accountNumber || profile.iban}</p>
                {profile.bankName && <p className="text-slate-600">{profile.bankName}</p>}
                <p className="mt-2 text-xs text-slate-500">Last updated {new Date(profile.updatedAt).toLocaleString()}. Enter the complete new details below to replace them; saved values are not returned in full.</p>
              </div>
            )}
            {methods.length === 0 && <p role="status" className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">No withdrawal methods are currently available. Please contact support.</p>}
            <form onSubmit={save} className="mt-5 space-y-4">
              <label className="block text-sm font-medium">
                Payout method
                <select className={field} value={provider} onChange={(event) => {
                  setProvider(event.target.value);
                  setAccountTitle("");
                  setAccountNumber("");
                  setIban("");
                  setBankName("");
                  setWalletAddress("");
                }}>
                  {profile && !methods.some((method) => method.provider === profile.provider) && <option value={profile.provider} disabled>{profileMethod?.displayName || profile.provider} (currently unavailable)</option>}
                  {methods.map((method) => <option key={method.provider} value={method.provider}>{method.displayName}</option>)}
                </select>
              </label>
              {selectedMethod?.instructions && <p className="rounded-xl bg-sky-50 p-3 text-sm text-sky-900">{selectedMethod.instructions}</p>}
              <label className="block text-sm font-medium">
                {isCrypto ? "Wallet owner / account title" : "Account-holder name"}
                <input className={field} value={accountTitle} onChange={(event) => setAccountTitle(event.target.value)} required maxLength={120} autoComplete="name" />
              </label>
              {isCrypto ? (
                <label className="block text-sm font-medium">
                  USDT wallet address
                  <input className={field} value={walletAddress} onChange={(event) => setWalletAddress(event.target.value)} required maxLength={128} autoComplete="off" />
                </label>
              ) : (
                <label className="block text-sm font-medium">
                  {provider === "bank" ? "Account number (if no IBAN)" : "Account number / mobile number"}
                  <input className={field} value={accountNumber} onChange={(event) => setAccountNumber(event.target.value)} required={provider !== "bank"} maxLength={64} autoComplete="off" />
                </label>
              )}
              {provider === "bank" && (
                <>
                  <label className="block text-sm font-medium">Bank name<input className={field} value={bankName} onChange={(event) => setBankName(event.target.value)} required maxLength={100} /></label>
                  <label className="block text-sm font-medium">IBAN (optional if account number is provided)<input className={field} value={iban} onChange={(event) => setIban(event.target.value)} required={!accountNumber} maxLength={34} autoComplete="off" /></label>
                </>
              )}
              {profile && (
                <label className="block text-sm font-medium">
                  Current password (required to replace saved details)
                  <input className={field} type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required autoComplete="current-password" />
                </label>
              )}
              <button disabled={saving || methods.length === 0} className="rounded-xl bg-forest px-5 py-3 font-semibold text-white disabled:cursor-wait disabled:opacity-50">
                {saving ? "Saving securely…" : "Save payout details securely"}
              </button>
            </form>
            <a href="/dashboard/wallet" className="mt-5 inline-block rounded-xl border border-slate-300 px-5 py-3 font-semibold">Go to wallet</a>
          </section>
        )}
      </div>
    </main>
  );
}
