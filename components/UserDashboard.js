"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RatingCard } from "@/components/RatingFeed";
import UserTopNav from "@/components/UserTopNav";

function money(value = 0) {
  return new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR" }).format(value / 100);
}

function getYoutubeEmbedUrl(value) {
  try {
    const url = new URL(value);
    let videoId = "";
    if (url.hostname === "youtu.be") videoId = url.pathname.slice(1);
    else if (url.hostname.endsWith("youtube.com")) {
      videoId = url.pathname === "/watch" ? url.searchParams.get("v") || "" : url.pathname.split("/").filter(Boolean).pop() || "";
    }
    return /^[a-zA-Z0-9_-]{6,20}$/.test(videoId) ? `https://www.youtube-nocookie.com/embed/${videoId}` : "";
  } catch {
    return "";
  }
}

export default function UserDashboard({
  profile,
  initialRatings,
  initialHasMore,
  initialCursor,
}) {
  const router = useRouter();
  const [walletSummary, setWalletSummary] = useState(null);
  const [dashboardError, setDashboardError] = useState("");
  const [referralUrl, setReferralUrl] = useState("");
  const [referralCopied, setReferralCopied] = useState(false);
  const [targetName, setTargetName] = useState("");
  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [category, setCategory] = useState("General");
  const [tags, setTags] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [ratings, setRatings] = useState(initialRatings);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [cursor, setCursor] = useState(initialCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [task, setTask] = useState(null);
  const [taskAssignmentId, setTaskAssignmentId] = useState("");
  const [taskError, setTaskError] = useState("");
  const [taskStartedAt, setTaskStartedAt] = useState("");
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [evidenceImage, setEvidenceImage] = useState(null);
  const remainingPackageDays = profile.packageRemainingDays;

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/wallet", { cache: "no-store" }).then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load wallet summary.");
        return result;
      }),
      fetch("/api/referrals", { cache: "no-store" }).then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load referral summary.");
        return result;
      }),
    ]).then(([wallet, referrals]) => {
      if (!cancelled) {
        setWalletSummary({
          ...wallet,
          directConversions: referrals.directConversions || 0,
          indirectConversions: referrals.indirectConversions || 0,
        });
        setReferralUrl(referrals.referralUrl || "");
        setDashboardError("");
      }
    }).catch((summaryError) => {
      if (!cancelled) setDashboardError(summaryError.message || "Could not load your account summary.");
    });
    return () => { cancelled = true; };
  }, []);

  async function copyReferralLink() {
    try {
      await navigator.clipboard.writeText(referralUrl);
      setReferralCopied(true);
    } catch (copyError) {
      console.error("Copying referral URL failed:", copyError);
    }
  }

  const startReviewTask = useCallback(async () => {
    setTaskError("");
    try {
      const response = await fetch("/api/review-task", { method: "POST", cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Review task unavailable.");
      setTask(result.task);
      setTaskAssignmentId(result.assignmentId);
      setTaskStartedAt(result.startedAt);
    } catch (startError) {
      setTaskError(startError.message || "Review task unavailable.");
      setTask(null);
      setTaskAssignmentId("");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/review-task", { method: "POST", cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Review task unavailable.");
        if (!cancelled) {
          setTask(result.task);
          setTaskAssignmentId(result.assignmentId);
          setTaskStartedAt(result.startedAt);
          setTaskError("");
        }
      })
      .catch((startError) => {
        if (!cancelled) {
          setTaskError(startError.message || "Review task unavailable.");
          setTask(null);
          setTaskAssignmentId("");
        }
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!taskStartedAt || !task?.minimumSeconds) return;
    const updateCountdown = () => {
      const unlockAt = new Date(taskStartedAt).getTime() + task.minimumSeconds * 1000;
      setSecondsRemaining(Math.max(0, Math.ceil((unlockAt - Date.now()) / 1000)));
    };
    updateCountdown();
    const timer = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(timer);
  }, [task, taskStartedAt]);

  async function submitRating(event) {
    event.preventDefault();
    const form = event.currentTarget;
    setError("");
    setMessage("");
    setSubmitting(true);

    try {
      const formData = new FormData();
      formData.set("targetName", targetName);
      formData.set("rating", String(rating));
      formData.set("reviewText", reviewText);
      formData.set("category", category);
      formData.set("tags", JSON.stringify(tags.split(",").map((tag) => tag.trim()).filter(Boolean)));
      formData.set("evidenceUrl", evidenceUrl);
      formData.set("taskAssignmentId", taskAssignmentId);
      if (evidenceImage) formData.set("proof", evidenceImage);
      const response = await fetch("/api/ratings", { method: "POST", body: formData });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || "Could not submit this rating.");
        return;
      }

      setRatings((current) => [result.rating, ...current]);
      setTargetName("");
      setRating(5);
      setReviewText("");
      setCategory("General");
      setTags("");
      setEvidenceUrl("");
      setEvidenceImage(null);
      form.reset();
      setMessage("Your rating was submitted and the task reward was credited to your wallet.");
      await startReviewTask();
      router.refresh();
    } catch {
      setError("We couldn’t reach the service. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function loadMoreRatings() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setError("");
    try {
      const response = await fetch(
        `/api/ratings?cursor=${encodeURIComponent(cursor)}`,
      );
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || "Could not load more ratings.");
        return;
      }
      setRatings((current) => [...current, ...result.ratings]);
      setHasMore(result.hasMore);
      setCursor(result.nextCursor);
    } catch {
      setError("Could not load more ratings. Please try again.");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <main className="min-h-screen bg-paper px-4 py-8 pb-24 sm:px-6 sm:py-12 md:pb-12">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-forest p-6 text-white sm:p-8">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-white/70">
              Ratewell
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Hello, {profile.name}
            </h1>
            <span className="mt-2 inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">{profile.referralTier || "Level 1"}</span>
            <nav className="mt-4 hidden flex-wrap gap-x-4 gap-y-2 text-sm text-white/80 md:flex" aria-label="User account">
              <a className="hover:text-white" href="/dashboard/profile">Profile</a>
              <a className="hover:text-white" href="/dashboard/wallet">Wallet</a>
              <a className="hover:text-white" href="/dashboard/referrals">Referrals</a>
              <a className="hover:text-white" href="/dashboard/settings">Settings</a>
              <a className="hover:text-white" href="/dashboard/support">Support</a>
            </nav>
          </div>
          <UserTopNav />
          <a href="/dashboard/wallet" className="rounded-xl bg-amber-300 px-4 py-2.5 text-sm font-bold text-slate-950 shadow-sm transition hover:bg-amber-200">Withdraw</a>
        </header>

        {dashboardError && <p role="alert" className="mb-5 rounded-xl bg-red-50 p-4 text-sm text-red-800">{dashboardError} <button type="button" onClick={() => window.location.reload()} className="ml-1 font-semibold underline">Try again</button></p>}
        <section id="analytics" className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Withdrawable balance", money(walletSummary?.balanceMinor)],
            ["Auto-credited rewards", money(walletSummary?.taskEarningsMinor)],
            ["Deposit Wallet", money(walletSummary?.depositBalanceMinor)],
            ["Lifetime task earnings", money(walletSummary?.taskEarningsMinor)],
            ["Direct referral rewards", money(walletSummary?.directReferralEarningsMinor)],
            ["Milestone rewards", money(walletSummary?.milestoneEarningsMinor)],
            ["Paid withdrawals", money(walletSummary?.withdrawnMinor)],
            ["Pending withdrawals", `${money(walletSummary?.pendingWithdrawalsMinor)} · ${walletSummary?.pendingWithdrawalsCount || 0} requests`],
            ["Eligible direct referrals", walletSummary ? `${walletSummary.directConversions || 0} members` : "Loading"],
          ].map(([label, value]) => <article key={label} className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm backdrop-blur"><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-2 text-xl font-bold text-forest">{value}</p></article>)}
        </section>
        <section className="mb-6 grid gap-4 sm:grid-cols-2">
          <article className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="font-semibold">Active package</h2>
            <p className="mt-2 text-lg font-bold text-forest">{profile.packageName || "No package selected"}</p>
            <p className="mt-1 text-sm text-slate-600">{money(profile.packagePriceMinor)} · {profile.packageDailyTaskLimit || "Unlimited"} tasks/day · {money(profile.packagePerTaskEarningsMinor)}/task</p>
            {profile.packageExpiresAt ? <p className="mt-1 text-sm text-slate-600">Expires {new Date(profile.packageExpiresAt).toLocaleString()} · {remainingPackageDays} days remaining</p> : <a href="/dashboard/wallet#packages" className="mt-2 inline-block text-sm font-semibold text-forest underline">Choose a package</a>}
            {profile.packageExpiresAt && new Date(profile.packageExpiresAt) <= new Date() && <a href="/dashboard/wallet#packages" className="mt-2 inline-block text-sm font-semibold text-forest underline">Renew package</a>}
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="font-semibold">Today’s task progress</h2>
            {task ? <><p className="mt-2 text-lg font-bold text-forest">{task.dailyCount}{task.dailyLimit ? ` / ${task.dailyLimit}` : ""} submitted</p><p className="mt-1 text-sm text-slate-600">{money(walletSummary?.dailyCollectedMinor)} auto-credited to your wallet today</p></> : <p className="mt-2 text-sm text-slate-500">Task availability is loading.</p>}
          </article>
        </section>
        <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ["Wallet", "/dashboard/wallet"],
            ["Rewards", "/dashboard/referrals#referral-milestones"],
            ["Level up", "/dashboard/referrals#referral-milestones"],
            ["Daily task", "#review-task"],
            ["Social & support", "/dashboard/support"],
          ].map(([label, href]) => <a key={label} href={href} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-sm font-semibold shadow-sm transition hover:-translate-y-0.5 hover:border-forest hover:text-forest">{label} <span aria-hidden="true">→</span></a>)}
        </section>
        {referralUrl && <section className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <div><h2 className="font-semibold text-emerald-950">Invite friends</h2><p className="mt-1 break-all text-sm text-emerald-800">{referralUrl}</p></div>
          <button type="button" onClick={copyReferralLink} className="rounded-xl bg-forest px-4 py-2.5 text-sm font-semibold text-white">{referralCopied ? "Copied" : "Copy / Share link"}</button>
        </section>}
        {walletSummary?.transactions?.length > 0 && <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Recent wallet activity</h2><a href="/dashboard/wallet" className="text-sm font-semibold text-forest underline">View wallet</a></div>
          <ul className="divide-y">{walletSummary.transactions.slice(0, 5).map((item) => <li key={item.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span>{item.description}<span className="ml-2 text-xs text-slate-500">{new Date(item.createdAt).toLocaleDateString()}</span></span><span className={`font-semibold ${item.direction === "credit" ? "text-emerald-700" : "text-slate-700"}`}>{item.direction === "credit" ? "+" : "−"}{money(item.amountMinor)}</span></li>)}</ul>
        </section>}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div className="space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
              <h2 className="text-xl font-semibold">Your profile</h2>
              <dl className="mt-5 space-y-4">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Name
                  </dt>
                  <dd className="mt-1 break-words font-medium">{profile.name}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Email
                  </dt>
                  <dd className="mt-1 break-all font-medium">{profile.email}</dd>
                </div>
              </dl>
            </section>

            {profile.packageExpiresAt && (
              <section className={`rounded-2xl border p-5 ${new Date(profile.packageExpiresAt) <= new Date() ? "border-red-200 bg-red-50 text-red-900" : "border-amber-200 bg-amber-50 text-amber-950"}`}>
                <h2 className="font-semibold">Package validity</h2>
                <p className="mt-1 text-sm">
                  {new Date(profile.packageExpiresAt) <= new Date()
                    ? "Your package has expired. Review submissions and earning are paused until renewal approval."
                    : `Your package is active through ${new Date(profile.packageExpiresAt).toLocaleDateString()}.`}
                </p>
                {new Date(profile.packageExpiresAt) <= new Date() && <a href="/dashboard/wallet" className="mt-3 inline-block rounded-lg bg-forest px-4 py-2 text-sm font-semibold text-white">Renew with Deposit Wallet</a>}
              </section>
            )}

            <section id="review-task" className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
              <h2 className="text-xl font-semibold">Share a rating</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Tell us about a service or experience.
              </p>
              {taskError && <div role="alert" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"><p>{taskError}</p><button type="button" onClick={startReviewTask} className="mt-2 font-semibold underline">Try starting a task again</button></div>}
              {task && <div className="mt-4 rounded-xl bg-mint/50 p-4 text-sm">
                <p className="font-semibold">{task.title || "Review task"}</p>
                {task.instructions && <p className="mt-1 whitespace-pre-wrap text-slate-600">{task.instructions}</p>}
                {task.rulesText && <p className="mt-2 whitespace-pre-wrap text-slate-600">{task.rulesText}</p>}
                <p className="mt-2 text-slate-600">Reward: {(task.rewardMinor / 100).toFixed(2)} PKR · {task.dailyLimit ? `${task.dailyLimit} reviews daily max` : "No daily limit"} · {task.userTotalLimit ? `${task.userTotalCount}/${task.userTotalLimit} per account` : "No per-account total cap"} · {task.totalLimit ? `${task.completedCount}/${task.totalLimit} total tasks` : "No global quota"}</p>
                {task.dailyLimit > 0 && <div className="mt-3"><div className="mb-1 flex justify-between text-xs text-slate-600"><span>Today's tasks</span><span>{task.dailyCount}/{task.dailyLimit}</span></div><div className="h-2 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-forest transition-all" style={{ width: `${Math.min(100, (task.dailyCount / task.dailyLimit) * 100)}%` }} /></div></div>}
                {task.mediaImageUrl && <img src={task.mediaImageUrl} alt="Review task instructions" className="mt-3 max-h-72 w-full rounded-xl object-contain" />}
                {task.websiteUrl && <a className="mt-3 inline-block font-semibold text-forest underline" href={task.websiteUrl} target="_blank" rel="noreferrer">Open task website</a>}
                {task.videoUrl?.toLowerCase().split("?")[0].endsWith(".mp4")
                  ? <video className="mt-3 max-h-72 w-full rounded-xl bg-slate-950" controls preload="metadata" src={task.videoUrl}>Your browser does not support video playback.</video>
                  : getYoutubeEmbedUrl(task.videoUrl || "") && <iframe className="mt-3 aspect-video w-full rounded-xl" src={getYoutubeEmbedUrl(task.videoUrl)} title="Review task video" referrerPolicy="strict-origin-when-cross-origin" allow="encrypted-media; picture-in-picture" sandbox="allow-scripts allow-same-origin allow-presentation" />}
                {secondsRemaining > 0 && <p className="mt-2 font-medium text-forest">Task timer: {secondsRemaining}s remaining</p>}
              </div>}
              <form onSubmit={submitRating} className="mt-6 space-y-4">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium">
                    Name of service or experience
                  </span>
                  <input
                    required
                    maxLength={120}
                    value={targetName}
                    onChange={(event) => setTargetName(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-4 py-3"
                    placeholder="e.g. Customer support"
                  />
                </label>
                {task?.allowLink && <label className="block"><span className="mb-2 block text-sm font-medium">{task.requireLink ? "Review link (required)" : "Optional review link"}</span><input type="url" inputMode="url" required={task.requireLink} value={evidenceUrl} onChange={(event) => setEvidenceUrl(event.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3" placeholder={task.allowVideoLinks ? "https://example.com or YouTube/MP4" : "https://example.com"} /></label>}
                {task?.allowImage && <label className="block text-sm font-medium">{task.requireImage ? "Required image evidence" : "Optional image evidence"}<input className="mt-2 block w-full text-sm" type="file" accept="image/jpeg,image/png,image/webp" required={task.requireImage} onChange={(event) => setEvidenceImage(event.target.files?.[0] || null)} /></label>}
                <fieldset>
                  <legend className="mb-2 text-sm font-medium">Rating</legend>
                  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Rating">
                    {[1, 2, 3, 4, 5].map((value) => (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={rating === value}
                        aria-label={`${value} ${value === 1 ? "star" : "stars"}`}
                        onClick={() => setRating(value)}
                        className={`rounded-lg px-3 py-2 text-2xl ${
                          value <= rating
                            ? "text-amber-500"
                            : "text-slate-300"
                        }`}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                  <nav aria-label="Mobile dashboard navigation" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white/95 p-2 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur md:hidden">
                    <a href="/dashboard" className="py-2 text-center text-xs font-semibold text-forest">Home</a>
                    <a href="/dashboard#analytics" className="py-2 text-center text-xs font-semibold">Analytics</a>
                    <a href="/dashboard/wallet" className="py-2 text-center text-xs font-semibold">Wallet</a>
                    <a href="/dashboard/profile" className="py-2 text-center text-xs font-semibold">Profile</a>
                    <button type="button" onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.assign("/"); }} className="py-2 text-center text-xs font-semibold text-red-700">Logout</button>
                  </nav>
                </fieldset>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium">Category</span>
                  <select value={category} onChange={(event) => setCategory(event.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3">
                    {["General", "Service", "Product", "Support", "Delivery", "Other"].map((item) => <option key={item}>{item}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium">Tags (comma-separated, optional)</span>
                  <input value={tags} onChange={(event) => setTags(event.target.value)} maxLength={256} className="w-full rounded-xl border border-slate-200 px-4 py-3" placeholder="friendly, fast delivery" />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium">Your review</span>
                  <textarea
                    required
                    rows={5}
                    maxLength={2000}
                    value={reviewText}
                    onChange={(event) => setReviewText(event.target.value)}
                    className="w-full resize-y rounded-xl border border-slate-200 px-4 py-3"
                    placeholder="Share your experience…"
                  />
                  <span className="mt-1 block text-right text-xs text-slate-500">
                    {reviewText.length}/2000
                  </span>
                </label>
                {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
                {message && <p role="status" className="text-sm text-forest">{message}</p>}
                <button
                  type="submit"
                  disabled={
                    submitting ||
                    secondsRemaining > 0 ||
                    Boolean(taskError) ||
                    !taskAssignmentId ||
                    (task?.dailyLimit > 0 && task.dailyCount >= task.dailyLimit)
                  }
                  className="w-full rounded-xl bg-forest px-4 py-3 font-semibold text-white hover:bg-forest/90 disabled:opacity-60"
                >
                  {submitting ? "Submitting…" : "Submit rating"}
                </button>
              </form>
            </section>
          </div>

          <section>
            <div className="mb-4">
              <h2 className="text-xl font-semibold">Your ratings</h2>
              <p className="mt-1 text-sm text-slate-600">
                Your feedback is visible only to you and authorized staff.
              </p>
            </div>
            {error && <p role="alert" className="mb-4 text-sm text-red-700">{error}</p>}
            {ratings.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                Your submitted ratings will appear here.
              </p>
            ) : (
              <div className="space-y-4">
                {ratings.map((item) => (
                  <RatingCard key={item.id} item={item} adminView={false} />
                ))}
                {hasMore && (
                  <button
                    type="button"
                    onClick={loadMoreRatings}
                    disabled={loadingMore}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-semibold text-forest hover:bg-mint/40 disabled:opacity-60"
                  >
                    {loadingMore ? "Loading…" : "Load older ratings"}
                  </button>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
