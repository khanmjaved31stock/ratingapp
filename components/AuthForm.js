"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AuthForm({
  role = "user",
  roleLabel = "your account",
  dashboardPath = "/dashboard",
  admin = false,
}) {
  const router = useRouter();
  const [registering, setRegistering] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [password, setPassword] = useState("");
  const [packages, setPackages] = useState([]);
  const [packageId, setPackageId] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [termsVersion, setTermsVersion] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    setSubmitting(true);

    try {
      const response = await fetch(
        registering ? "/api/auth/register" : "/api/auth/login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            email,
            whatsappPhone: registering && !admin ? whatsappPhone : undefined,
            password,
            role,
            packageId,
            termsAccepted: registering && termsAccepted,
            termsVersion,
            referralCode: referralCode.trim() || undefined,
            rememberMe: !registering && !admin ? rememberMe : false,
          }),
        },
      );
      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "We couldn’t complete your request.");
        return;
      }

      if (registering) {
        setRegistering(false);
        setPassword("");
        setTermsAccepted(false);
        setVerificationRequired(Boolean(result.verificationRequired));
        setNotice(result.message || "Account created.");
        return;
      }

      router.replace(result.nextPath || dashboardPath);
      router.refresh();
    } catch {
      setError("We couldn’t reach the service. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function openRegistration() {
    setRegistering(true);
    setError("");
    setNotice("");
    setVerificationRequired(false);
    setTermsAccepted(false);
    if (packages.length > 0 && termsVersion) return;

    setLoadingPackages(true);
    try {
      const [packageResponse, termsResponse] = await Promise.all([
        fetch("/api/packages", { cache: "no-store" }),
        fetch("/api/terms", { cache: "no-store" }),
      ]);
      const [packageResult, termsResult] = await Promise.all([
        packageResponse.json(),
        termsResponse.json(),
      ]);
      if (!packageResponse.ok) {
        setError(packageResult.error || "Could not load registration packages.");
        return;
      }
      if (!termsResponse.ok) {
        setError(termsResult.error || "Could not load the current Terms & Conditions.");
        return;
      }
      setPackages(packageResult.packages);
      setTermsVersion(termsResult.termsVersion);
      if (packageResult.packages[0]) setPackageId(packageResult.packages[0].id);
      if (packageResult.packages.length === 0) {
        setError("Registration is not open yet. Please contact support.");
      }
    } catch {
      setError("Could not load registration packages. Please try again.");
    } finally {
      setLoadingPackages(false);
    }
  }

  return (
    <div>
      {!admin && (
        <div className="mb-6 grid grid-cols-2 rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => {
              setRegistering(false);
              setError("");
              setNotice("");
              setVerificationRequired(false);
            }}
            className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
              !registering
                ? "bg-white text-ink shadow-sm"
                : "text-slate-500 hover:text-ink"
            }`}
            aria-pressed={!registering}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={openRegistration}
            className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
              registering
                ? "bg-white text-ink shadow-sm"
                : "text-slate-500 hover:text-ink"
            }`}
            aria-pressed={registering}
          >
            Create account
          </button>
        </div>
      )}

      {admin && (
        <div className="mb-6 rounded-xl bg-mint/60 px-4 py-3 text-sm text-forest">
          Sign in to {roleLabel}.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {!registering && !admin && <div className="flex items-center justify-between gap-4 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} />Remember me for 30 days</label><a className="font-semibold text-forest underline" href="/forgot-password">Forgot password?</a></div>}
        {registering && !admin && (
          <>
            {loadingPackages ? (
              <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Loading registration packages…
              </p>
            ) : packages.length > 0 ? (
              <fieldset className="space-y-3">
                <legend className="mb-2 text-sm font-medium">Choose a registration package</legend>
                {packages.map((item) => (
                  <label key={item.id} className={`block cursor-pointer rounded-xl border p-4 ${packageId === item.id ? "border-forest bg-mint/30" : "border-slate-200"}`}>
                    <span className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="registrationPackage"
                        required
                        value={item.id}
                        checked={packageId === item.id}
                        onChange={() => setPackageId(item.id)}
                        className="mt-1"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap justify-between gap-2 font-semibold">
                          <span>{item.name}</span>
                          <span>PKR {(item.priceMinor / 100).toLocaleString()}</span>
                        </span>
                        <span className="mt-1 block text-sm text-slate-600">{item.description}</span>
                        <span className="mt-2 block text-xs text-slate-500">
                          {item.validityDays} days · {item.dailyTaskLimit ? `${item.dailyTaskLimit} tasks/day` : "No daily task cap"}
                        </span>
                        <span className="mt-2 block text-xs text-slate-600">
                          Withdrawal limits: PKR {(item.minimumWithdrawalMinor / 100).toFixed(2)} minimum · {item.maximumWithdrawalMinor === null ? "no maximum" : `PKR ${(item.maximumWithdrawalMinor / 100).toFixed(2)} maximum`}
                        </span>
                        <ul className="mt-1 list-inside list-disc text-xs text-slate-600">
                          {(item.withdrawalFeeBrackets || []).map((bracket) => (
                            <li key={`${bracket.minimumAmountMinor}-${bracket.maximumAmountMinor}`}>
                              {`PKR ${(bracket.minimumAmountMinor / 100).toFixed(2)}–${bracket.maximumAmountMinor === null ? "up" : `PKR ${(bracket.maximumAmountMinor / 100).toFixed(2)}`}: ${(bracket.basisPoints / 100).toFixed(2)}% fee`}
                            </li>
                          ))}
                        </ul>
                        {item.benefits?.length > 0 && (
                          <ul className="mt-2 list-inside list-disc text-sm text-slate-600">
                            {item.benefits.map((benefit) => <li key={benefit}>{benefit}</li>)}
                          </ul>
                        )}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
            ) : null}
            <label className="block">
              <span className="mb-2 block text-sm font-medium">
                Referral code <span className="font-normal text-slate-500">(optional)</span>
              </span>
              <input
                maxLength={32}
                value={referralCode}
                onChange={(event) => setReferralCode(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3"
              />
            </label>
          </>
        )}
        {registering && !admin && (
          <label className="block">
            <span className="mb-2 block text-sm font-medium">Full name</span>
            <input
              autoComplete="name"
              required
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-ink placeholder:text-slate-400"
              placeholder="Your name"
            />
          </label>
        )}
        {registering && !admin && (
          <label className="block">
            <span className="mb-2 block text-sm font-medium">WhatsApp phone number</span>
            <input
              autoComplete="tel"
              type="tel"
              inputMode="tel"
              required
              maxLength={32}
              value={whatsappPhone}
              onChange={(event) => setWhatsappPhone(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-ink placeholder:text-slate-400"
              placeholder="+923001234567"
              aria-describedby="whatsapp-contact-note"
            />
            <span id="whatsapp-contact-note" className="mt-1 block text-xs leading-5 text-slate-500">
              Include your country code. We collect this for account and support contact; authorized admins may view it. We will not send WhatsApp messages as part of this feature.
            </span>
          </label>
        )}
        {registering && !admin && (
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                required
                checked={termsAccepted}
                onChange={(event) => setTermsAccepted(event.target.checked)}
                className="mt-1"
              />
              <span>
                I have read and accept the <a className="font-semibold text-forest underline" href="/terms" target="_blank" rel="noreferrer">Terms &amp; Conditions</a> and <a className="font-semibold text-forest underline" href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.
              </span>
            </label>
            <p className="text-xs leading-5 text-amber-900">
              Main tasdeeq karta/karti hoon ke registration mein di gayi maloomat durust hain. Ghalat ya misleading information par platform policy ke mutabiq account suspend ya block ho sakta hai. Payment ya refund ka faisla applicable law aur published refund policy ke mutabiq hoga. Barah-e-karam hamesha sahi information dein.
            </p>
          </div>
        )}
        <label className="block">
          <span className="mb-2 block text-sm font-medium">Email address</span>
          <input
            autoComplete="email"
            type="email"
            required
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-ink placeholder:text-slate-400"
            placeholder="you@example.com"
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-medium">Password</span>
          <input
            autoComplete={registering ? "new-password" : "current-password"}
            type="password"
            required
            minLength={registering ? 12 : undefined}
            maxLength={128}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-ink placeholder:text-slate-400"
            placeholder={
              registering ? "At least 12 characters" : "Enter your password"
            }
          />
        </label>
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="rounded-lg bg-mint/60 px-3 py-2 text-sm text-forest">
            {notice}
          </p>
        )}
        {verificationRequired && <a href="/verify-email" className="block text-sm font-semibold text-forest underline">Verify your email or resend the code</a>}
        <button
          type="submit"
          disabled={submitting || loadingPackages || (registering && (packages.length === 0 || !termsVersion))}
          className="w-full rounded-xl bg-forest px-4 py-3.5 font-semibold text-white transition hover:bg-forest/90 disabled:cursor-wait disabled:opacity-60"
        >
          {submitting
            ? "Please wait…"
            : registering
              ? "Create account"
              : "Sign in"}
        </button>
      </form>
      {!admin && (
        <div className="mt-4 space-y-2 text-center text-xs leading-5 text-slate-500">
          <p>Passwords must be at least 12 characters when creating an account.</p>
          <a href="/verify-email" className="font-semibold text-forest underline">Verify a registration email</a>
        </div>
      )}
    </div>
  );
}
