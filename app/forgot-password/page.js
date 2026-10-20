"use client";

import { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(action, event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const response = await fetch("/api/auth/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, email, code, password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not complete password reset.");
      setMessage(result.message);
      if (action === "send") setCodeSent(true);
      else {
        setPassword("");
        setCode("");
        setCodeSent(false);
      }
    } catch (requestError) {
      setError(requestError.message || "Could not complete password reset.");
    } finally {
      setBusy(false);
    }
  }

  const field = "mt-1 w-full rounded-xl border border-slate-200 px-4 py-3";
  return (
    <main className="grid min-h-screen place-items-center bg-paper px-4 py-10">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8">
        <a href="/" className="text-sm font-semibold text-forest">Ratewell / Sign in</a>
        <h1 className="mt-4 text-2xl font-semibold">Reset your password</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">We’ll email a one-time code to the address on your account. Codes expire after 10 minutes.</p>
        {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {message && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
        {!codeSent ? <form className="mt-5 space-y-4" onSubmit={(event) => submit("send", event)}>
          <label className="block text-sm font-medium">Account email<input className={field} type="email" autoComplete="email" maxLength={254} required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <button disabled={busy} className="w-full rounded-xl bg-forest px-4 py-3 font-semibold text-white disabled:opacity-50">{busy ? "Sending…" : "Send reset code"}</button>
        </form> : <form className="mt-5 space-y-4" onSubmit={(event) => submit("reset", event)}>
          <label className="block text-sm font-medium">Account email<input className={field} type="email" autoComplete="email" maxLength={254} required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label className="block text-sm font-medium">Six-digit code<input className={field} inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} /></label>
          <label className="block text-sm font-medium">New password<input className={field} type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} /><span className="mt-1 block text-xs font-normal text-slate-500">At least 12 characters; maximum 72 UTF-8 bytes.</span></label>
          <button disabled={busy} className="w-full rounded-xl bg-forest px-4 py-3 font-semibold text-white disabled:opacity-50">{busy ? "Resetting…" : "Reset password"}</button>
          <button type="button" disabled={busy} onClick={(event) => submit("send", event)} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold">Send a new code</button>
        </form>}
        {message.includes("Password reset.") && <a href="/" className="mt-5 inline-block font-semibold text-forest underline">Return to sign in</a>}
      </section>
    </main>
  );
}
