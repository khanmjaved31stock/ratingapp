"use client";

import { useEffect, useState } from "react";

export default function TermsPolicy({ kind }) {
  const [policy, setPolicy] = useState(null);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const isTerms = kind === "terms";

  useEffect(() => {
    fetch("/api/terms", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load this policy.");
        setPolicy(result);
      })
      .catch((loadError) => setError(loadError.message));
  }, []);

  async function acceptCurrentTerms(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/terms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accepted, termsVersion: policy.termsVersion }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not record acceptance.");
      setMessage(result.message);
      setPolicy((current) => ({ ...current, needsAcceptance: false }));
    } catch (acceptError) {
      setError(acceptError.message || "Could not record acceptance.");
    } finally {
      setSaving(false);
    }
  }

  const title = isTerms ? "Terms & Conditions" : "Privacy Policy";
  const content = policy?.[isTerms ? "terms" : "privacy"];
  return (
    <main className="min-h-screen bg-paper px-4 py-10 sm:px-6">
      <article className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 sm:p-10">
        <a href="/" className="text-sm font-semibold text-forest underline">Ratewell</a>
        <h1 className="mt-4 text-3xl font-semibold">{title}</h1>
        {policy && <p className="mt-2 text-sm text-slate-500">Version {policy.termsVersion}</p>}
        {error && <p role="alert" className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {!policy && !error && <p className="mt-5 text-sm text-slate-600">Loading policy…</p>}
        {policy && <p className="mt-6 whitespace-pre-wrap text-sm leading-7 text-slate-700">{content}</p>}
        {isTerms && policy?.needsAcceptance && (
          <form onSubmit={acceptCurrentTerms} className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-5">
            <h2 className="font-semibold">Review and accept the updated terms</h2>
            <label className="mt-4 flex items-start gap-3 text-sm">
              <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} required className="mt-1" />
              <span>I have read and accept the current Terms &amp; Conditions.</span>
            </label>
            <button disabled={saving} className="mt-4 rounded-lg bg-forest px-4 py-2 font-semibold text-white disabled:opacity-50">
              {saving ? "Saving…" : "Accept current terms"}
            </button>
          </form>
        )}
        {message && <p role="status" className="mt-4 text-sm text-emerald-700">{message}</p>}
        <p className="mt-8 text-sm"><a href={isTerms ? "/privacy" : "/terms"} className="font-semibold text-forest underline">{isTerms ? "Privacy Policy" : "Terms & Conditions"}</a></p>
      </article>
    </main>
  );
}
