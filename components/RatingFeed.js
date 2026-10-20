"use client";

import { useState } from "react";

function getVideoEmbed(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    if (parsed.hostname === "youtu.be" || parsed.hostname.endsWith(".youtube.com") || parsed.hostname === "youtube.com") {
      const videoId = parsed.hostname === "youtu.be"
        ? parsed.pathname.slice(1)
        : parsed.searchParams.get("v") || parsed.pathname.split("/").filter(Boolean).at(-1);
      if (!/^[A-Za-z0-9_-]{11}$/.test(videoId || "")) return null;
      return { type: "youtube", source: `https://www.youtube-nocookie.com/embed/${videoId}` };
    }
    if (parsed.pathname.toLowerCase().endsWith(".mp4")) return { type: "mp4", source: url };
  } catch {
    return null;
  }
  return null;
}

export function RatingCard({ item, adminView }) {
  const video = getVideoEmbed(item.evidenceUrl);
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-ink">{item.targetName}</h3>
          {adminView && (
            <p className="mt-1 text-sm text-slate-500">
              {item.author
                ? `${item.author.name} · ${item.author.email}`
                : "Anonymous feedback"}
            </p>
          )}
        </div>
        <div
          className="flex gap-1 text-amber-500"
          aria-label={`${item.rating} out of 5 stars`}
        >
          {Array.from({ length: 5 }, (_, index) => (
            <span
              key={index}
              aria-hidden="true"
              className={index < item.rating ? "" : "text-slate-200"}
            >
              ★
            </span>
          ))}
        </div>
      </div>
      <p className="mt-4 whitespace-pre-wrap break-words leading-7 text-slate-700">
        {item.reviewText}
      </p>
      {item.moderationStatus === "underReview" && <p role="status" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">Awaiting staff review; any task reward remains pending.</p>}
      {item.taskReviewStatus === "approved" && <p role="status" className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900">Task approved{item.taskRewardMinor > 0 ? ` · ${new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR" }).format(item.taskRewardMinor / 100)} credited` : ""}.</p>}
      {item.taskReviewStatus === "rejected" && <p role="status" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-800">Task rejected. Reward was not credited.{item.taskReviewNote ? ` Reason: ${item.taskReviewNote}` : ""}</p>}
      {video?.type === "youtube" && <div className="mt-4 aspect-video max-w-xl overflow-hidden rounded-xl"><iframe title="Review video" src={video.source} className="h-full w-full" loading="lazy" referrerPolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen /></div>}
      {video?.type === "mp4" && <video className="mt-4 max-h-96 max-w-full rounded-xl" controls preload="metadata"><source src={video.source} type="video/mp4" /></video>}
      {(item.evidenceUrl || item.evidenceImageUrl) && <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
        {item.evidenceUrl && <a className="font-semibold text-forest underline" href={item.evidenceUrl} target="_blank" rel="noreferrer">Open review link</a>}
        {item.evidenceImageUrl && <a className="font-semibold text-forest underline" href={item.evidenceImageUrl} target="_blank" rel="noreferrer">Open image evidence</a>}
      </div>}
      <p className="mt-4 text-xs text-slate-500">
        {new Date(item.createdAt).toISOString().replace("T", " ").slice(0, 16)} UTC
      </p>
    </article>
  );
}

export default function RatingFeed({
  initialRatings,
  initialHasMore,
  initialCursor,
  adminView = false,
}) {
  const [ratings, setRatings] = useState(initialRatings);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [cursor, setCursor] = useState(initialCursor);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadMore() {
    if (!cursor || loading) return;
    setLoading(true);
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
      setLoading(false);
    }
  }

  if (ratings.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
        {adminView
          ? "No feedback has been submitted yet."
          : "Your submitted ratings will appear here."}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {ratings.map((item) => (
        <RatingCard key={item.id} item={item} adminView={adminView} />
      ))}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {hasMore && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loading}
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-semibold text-forest hover:bg-mint/40 disabled:opacity-60"
        >
          {loading ? "Loading…" : "Load older ratings"}
        </button>
      )}
    </div>
  );
}
