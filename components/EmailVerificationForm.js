"use client";

import { useState } from "react";

export default function EmailVerificationForm() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeRequested, setCodeRequested] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(action, event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const response = await fetch("/api/auth/email-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, email, code }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not complete email verification.");
      setMessage(result.message);
      if (action === "send") setCodeRequested(true);
      else setVerified(true);
    } catch (requestError) {
      setError(requestError.message || "Could not complete email verification.");
    } finally {
      setBusy(false);
    }
  }

  const field = "mt-1 w-full rounded-xl border border-slate-200 px-4 py-3";
  return (
    <main className="grid min-h-screen place-items-center bg-paper px-4 py-10">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8">
        <a href="/" className="text-sm font-semibold text-forest">Ratewell / Sign in</a>
        <h1 className="mt-4 text-2xl font-semibold">Verify your email</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Registration email codes expire after 10 minutes. You can request another code if needed.</p>
        {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {message && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
        {!verified && <form className="mt-5 space-y-4" onSubmit={(event) => submit(codeRequested ? "verify" : "send", event)}>
          <label className="block text-sm font-medium">Registration email
            <input className={field} type="email" autoComplete="email" maxLength={254} required value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          {codeRequested && <label className="block text-sm font-medium">Six-digit code
            <input className={field} inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} />
          </label>}
          <button disabled={busy} className="w-full rounded-xl bg-forest px-4 py-3 font-semibold text-white disabled:opacity-50">{busy ? "Please wait…" : codeRequested ? "Verify email" : "Send verification code"}</button>
          {codeRequested && <button type="button" disabled={busy} onClick={(event) => submit("send", event)} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold disabled:opacity-50">Send a new code</button>}
        </form>}
        {verified && <a href="/" className="mt-5 inline-block rounded-xl bg-forest px-4 py-3 font-semibold text-white">Return to sign in</a>}
      </section>
    </main>
  );
}
