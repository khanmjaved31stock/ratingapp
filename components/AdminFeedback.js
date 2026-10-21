"use client";

import { useEffect, useState } from "react";
import RatingFeed from "@/components/RatingFeed";

const money = (value = 0) =>
  new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR" }).format(value / 100);

export default function AdminFeedback({ initialPage, initialTaskPage }) {
  const [ratings, setRatings] = useState(initialPage.ratings.filter(
    (item) => !item.taskAssignmentId || item.moderationStatus !== "underReview",
  ));
  const [cursor, setCursor] = useState(initialPage.nextCursor);
  const [hasMore, setHasMore] = useState(initialPage.hasMore);
  const [taskRatings, setTaskRatings] = useState(initialTaskPage?.ratings || []);
  const [taskCursor, setTaskCursor] = useState(initialTaskPage?.nextCursor || null);
  const [hasMoreTasks, setHasMoreTasks] = useState(Boolean(initialTaskPage?.hasMore));
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [reviewNotes, setReviewNotes] = useState({});
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingMoreTasks, setLoadingMoreTasks] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const refreshTaskReviews = async () => {
      try {
        const response = await fetch("/api/ratings?queue=task-review", { cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not refresh task reviews.");
        if (cancelled) return;
        setTaskRatings(result.ratings);
        setTaskCursor(result.nextCursor);
        setHasMoreTasks(result.hasMore);
      } catch (refreshError) {
        if (!cancelled) setError(refreshError.message || "Could not refresh task reviews.");
      }
    };
    const interval = window.setInterval(refreshTaskReviews, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);
  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setError("");
    try {
      const response = await fetch(`/api/ratings?cursor=${encodeURIComponent(cursor)}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load more feedback.");
      setRatings((current) => [
        ...current,
        ...result.ratings.filter(
          (item) => !item.taskAssignmentId || item.moderationStatus !== "underReview",
        ),
      ]);
      setCursor(result.nextCursor);
      setHasMore(result.hasMore);
    } catch (loadError) {
      setError(loadError.message || "Could not load more feedback.");
    } finally {
      setLoadingMore(false);
    }
  }
  async function loadMoreTasks() {
    if (!taskCursor || loadingMoreTasks) return;
    setLoadingMoreTasks(true);
    setError("");
    try {
      const response = await fetch(
        `/api/ratings?queue=task-review&cursor=${encodeURIComponent(taskCursor)}`,
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load more task reviews.");
      setTaskRatings((current) => [...current, ...result.ratings]);
      setTaskCursor(result.nextCursor);
      setHasMoreTasks(result.hasMore);
    } catch (loadError) {
      setError(loadError.message || "Could not load more task reviews.");
    } finally {
      setLoadingMoreTasks(false);
    }
  }
  async function moderate(item, patch) {
    setError("");
    setBusyId(item.id);
    try {
      const response = await fetch(`/api/admin/feedback/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not update feedback.");
      const { taskDecision, ...updates } = patch;
      setRatings((current) => current
        .map((rating) => rating.id === item.id
          ? { ...rating, ...updates, moderationStatus: result.moderationStatus || updates.moderationStatus || rating.moderationStatus }
          : rating)
        .filter((rating) => rating.moderationStatus !== "removed"));
      if (taskDecision) {
        setTaskRatings((current) => current.filter((rating) => rating.id !== item.id));
        window.dispatchEvent(new Event("ratewell:admin-requests-changed"));
        setReviewNotes((current) => {
          const next = { ...current };
          delete next[item.id];
          return next;
        });
      }
    } catch (moderationError) {
      setError(moderationError.message || "Could not update feedback.");
    } finally {
      setBusyId("");
    }
  }
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
      <div className="mb-8">
        <h2 className="text-xl font-semibold">Task reward reviews (optional)</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          Task rewards are credited to users automatically when they complete a task. No approval is required. Use this queue only if you need to manually review or reject a submission retroactively.
        </p>
        {taskRatings.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">
            No task submissions are awaiting review. Rewards are auto-credited, so this queue stays empty.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {taskRatings.map((item) => <div key={item.id}>
              <RatingFeed
                initialRatings={[item]}
                initialHasMore={false}
                initialCursor={null}
                adminView
              />
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-semibold text-amber-900">
                  Reward awaiting approval · {money(item.taskRewardMinor)}
                </p>
                <label className="mt-3 block text-sm font-medium">
                  Rejection reason
                  <input
                    value={reviewNotes[item.id] || ""}
                    onChange={(event) => setReviewNotes((current) => ({ ...current, [item.id]: event.target.value }))}
                    maxLength={500}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                  />
                </label>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    disabled={busyId === item.id}
                    onClick={() => moderate(item, { taskDecision: "approve" })}
                    className="rounded-lg bg-forest px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Approve and credit reward
                  </button>
                  <button
                    disabled={busyId === item.id || !reviewNotes[item.id]?.trim()}
                    onClick={() => moderate(item, { taskDecision: "reject", reviewNote: reviewNotes[item.id] })}
                    className="rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-50"
                  >
                    Reject task
                  </button>
                </div>
              </div>
            </div>)}
            {hasMoreTasks && <button type="button" disabled={loadingMoreTasks} onClick={loadMoreTasks} className="w-full rounded-xl border border-slate-300 px-4 py-3 font-semibold text-forest disabled:opacity-50">{loadingMoreTasks ? "Loading…" : "Load more pending tasks"}</button>}
          </div>
        )}
      </div>
      <div className="mb-5">
        <h2 className="text-xl font-semibold">Recent user feedback</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          Feedback is visible only to authenticated administrators.
        </p>
      </div>
      {error && <p role="alert" className="mb-4 text-sm text-red-700">{error}</p>}
      {ratings.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">No feedback to review.</p> : <div className="space-y-4">
      {ratings.map((item) => <div key={item.id}>
        <RatingFeed
        initialRatings={[item]}
        initialHasMore={false}
        initialCursor={null}
        adminView
      />
        <div className="mt-2 flex flex-wrap gap-2">
          <button disabled={busyId === item.id} onClick={() => moderate(item, { flagged: !item.flagged })} className="rounded-lg border border-amber-200 px-3 py-2 text-sm font-semibold text-amber-800">{item.flagged ? "Clear flag" : "Flag for review"}</button>
          <button disabled={busyId === item.id} onClick={() => moderate(item, { moderationStatus: "removed" })} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700">Remove from feed</button>
        </div>
      </div>)}
      {hasMore && <button type="button" disabled={loadingMore} onClick={loadMore} className="w-full rounded-xl border border-slate-300 px-4 py-3 font-semibold text-forest disabled:opacity-50">{loadingMore ? "Loading…" : "Load older feedback"}</button>}
      </div>}
    </section>
  );
}
