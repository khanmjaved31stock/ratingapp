"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminUsers from "@/components/AdminUsers";
import AdminFeedback from "@/components/AdminFeedback";
import AdminOperations from "@/components/AdminOperations";
import AdminHelpCenter from "@/components/AdminHelpCenter";
import AdminGlobalSearch from "@/components/AdminGlobalSearch";

export default function AdminDashboard({
  role,
  title,
  description,
  initialUsersPage,
  initialRatingPage,
  initialTaskReviewPage,
}) {
  const router = useRouter();
  const [users, setUsers] = useState(initialUsersPage?.users || []);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("analytics");
  const [adminLogo, setAdminLogo] = useState("");
  useEffect(() => {
    if (role !== "superAdmin") return;
    fetch("/api/admin/branding", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (response.ok) setAdminLogo(result.adminLogoUrl || "");
      })
      .catch((loadError) => console.error("Loading administrator logo failed:", loadError));
  }, [role]);
  const navigation = role === "superAdmin"
    ? [
        ["analytics", "Dashboard / analytics"],
        ["user-management", "User management"],
        ["administrators", "Helpline admins"],
        ["payment-approvals", "Payment approvals"],
        ["withdrawals", "Withdrawal payouts"],
        ["feedback", "Task reviews / rewards"],
        ["packages", "Packages / payment accounts"],
        ["payment-accounts", "Company payment accounts"],
        ["review-tasks", "Review tasks / rewards"],
        ["referrals", "Referral network"],
        ["referral-rewards", "Referral milestones / tiers"],
        ["branding", "Logo / branding"],
        ["ads", "Ads management"],
        ["support", "Support"],
        ["security", "Security / audit"],
        ["financial", "Financial logs"],
        ["help-center", "Guidelines / Help Center"],
      ]
    : [
        ["analytics", "Dashboard / analytics"],
        ["payment-approvals", "Payment approvals"],
        ["withdrawals", "Withdrawal payouts"],
        ["support", "Support queue"],
        ["feedback", "Feedback moderation"],
      ...(role === "helpAdmin" ? [["help-review", "Help Center reports"]] : []),
      ];

  async function createAdmin(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/admin/help-admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || "Could not create the account.");
        return;
      }
      setName("");
      setEmail("");
      setPassword("");
      if (result.user) {
        setUsers((current) => [result.user, ...current]);
      }
      setMessage("Helpline Admin account created.");
      router.refresh();
    } catch {
      setError("We couldn’t complete the request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function signOut() {
    setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) {
        setError("Sign-out failed. Please try again.");
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("Sign-out failed. Please try again.");
    }
  }

  return (
    <main className="min-h-screen bg-paper px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-[1600px]">
        <header className="mb-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            {adminLogo && <img src={adminLogo} alt="Ratewell administration" className="mb-3 max-h-12 max-w-40 object-contain" />}
            <p className="mb-2 text-sm font-semibold uppercase tracking-[0.16em] text-forest">
              Ratewell administration
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          </div>
          <button
            onClick={signOut}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold hover:bg-slate-50"
          >
            Sign out
          </button>
        </header>

        <p className="mb-8 text-slate-600">{description}</p>
        {(role === "superAdmin" || role === "helpAdmin") && <AdminGlobalSearch />}
        <details className="mb-8 rounded-2xl border border-slate-200 bg-white p-5">
          <summary className="cursor-pointer font-semibold">Change your administrator password</summary>
          <form
            className="mt-4 grid gap-3 sm:grid-cols-2"
            onSubmit={async (event) => {
              event.preventDefault();
              setError("");
              setMessage("");
              setSubmitting(true);
              try {
                const response = await fetch("/api/profile/password", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ currentPassword, newPassword }),
                });
                const result = await response.json();
                if (!response.ok) {
                  setError(result.error || "Could not change password.");
                  return;
                }
                setMessage("Password changed. Sign in again using your new password.");
                setCurrentPassword("");
                setNewPassword("");
                router.replace(role === "superAdmin" ? "/super-admin" : role === "helpAdmin" ? "/help-admin" : "/moderator");
                router.refresh();
              } catch {
                setError("Could not change password. Please try again.");
              } finally {
                setSubmitting(false);
              }
            }}
          >
            <label className="text-sm font-medium">Current password<input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required autoComplete="current-password" /></label>
            <label className="text-sm font-medium">New password<input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required minLength={12} maxLength={128} autoComplete="new-password" /></label>
            <button disabled={submitting} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold sm:col-span-2 disabled:opacity-50">Update administrator password</button>
          </form>
        </details>
        {error && role !== "superAdmin" && (
          <p role="alert" className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <button type="button" onClick={() => setSidebarOpen((open) => !open)} className="mb-3 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold lg:hidden">
          {sidebarOpen ? "Hide admin sections" : "Show admin sections"}
        </button>
        <div className="grid gap-6 lg:grid-cols-[auto_minmax(0,1fr)]">
          <aside className={`h-fit rounded-2xl border border-slate-200 bg-white p-3 shadow-sm lg:sticky lg:top-5 ${sidebarOpen ? "block" : "hidden lg:block"} ${sidebarOpen ? "lg:w-56" : "lg:w-16"}`}>
            <button type="button" onClick={() => setSidebarOpen((open) => !open)} className="mb-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-sm font-semibold" aria-label="Collapse or expand admin sidebar">
              <span className="hidden lg:inline">{sidebarOpen ? "Collapse menu" : "Expand menu"}</span>
              <span className="lg:hidden">Admin sections</span>
            </button>
            <nav aria-label="Admin sections" className="flex flex-col gap-1">
              {navigation.map(([id, label]) => (
                <a
                  key={id}
                  href={`#${id}`}
                  onClick={() => {
                    setActiveSection(id);
                    if (window.innerWidth < 1024) setSidebarOpen(false);
                  }}
                  title={label}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${activeSection === id ? "bg-mint text-forest" : "text-slate-600 hover:bg-slate-50"}`}
                >
                  <span className="lg:hidden">{label}</span>
                  <span className="hidden lg:inline">{sidebarOpen ? label : label.slice(0, 1)}</span>
                </a>
              ))}
            </nav>
          </aside>
          <div className="min-w-0 space-y-8">
        {role === "superAdmin" ? (
          <div className="space-y-8">
            <AdminOperations role={role} />
            <AdminHelpCenter role={role} />
            {initialRatingPage && <section id="feedback" className="scroll-mt-6"><AdminFeedback initialPage={initialRatingPage} initialTaskPage={initialTaskReviewPage} /></section>}
            <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
              <section id="administrators" className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
                <h2 className="mb-2 text-xl font-semibold">Add Helpline Admin</h2>
                <p className="mb-6 text-sm leading-6 text-slate-600">
                  Create a named administrator account. Share its initial
                  password securely and ask the administrator to change it.
                </p>
                <form onSubmit={createAdmin} className="space-y-4">
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium">Full name</span>
                    <input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      required
                      maxLength={100}
                      className="w-full rounded-xl border border-slate-200 px-4 py-3"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium">Email</span>
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                      maxLength={254}
                      className="w-full rounded-xl border border-slate-200 px-4 py-3"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium">Temporary password</span>
                    <input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                      minLength={12}
                      maxLength={128}
                      className="w-full rounded-xl border border-slate-200 px-4 py-3"
                    />
                  </label>
                  {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
                  {message && <p role="status" className="text-sm text-forest">{message}</p>}
                  <button
                    disabled={submitting}
                    className="w-full rounded-xl bg-forest px-4 py-3 font-semibold text-white disabled:opacity-60"
                  >
                    {submitting ? "Creating…" : "Create account"}
                  </button>
                </form>
              </section>
            </div>
            <section id="user-management" className="scroll-mt-6"><AdminUsers initialPage={initialUsersPage} users={users} setUsers={setUsers} /></section>
          </div>
        ) : (
          <div className="space-y-6">
            <AdminOperations role={role} />
            {role === "helpAdmin" && <AdminHelpCenter role={role} />}
            <section id="feedback" className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
              <h2 className="text-xl font-semibold">Support workspace</h2>
              <p className="mt-2 text-sm text-slate-600">
                Review user-submitted ratings and feedback below.
              </p>
            </section>
            {initialRatingPage && <AdminFeedback initialPage={initialRatingPage} initialTaskPage={initialTaskReviewPage} />}
          </div>
        )}
          </div>
        </div>
      </div>
    </main>
  );
}
