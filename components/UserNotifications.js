"use client";

import { useCallback, useEffect, useState } from "react";
import UserTopNav from "@/components/UserTopNav";

const pageSize = 20;

export default function UserNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [updatingId, setUpdatingId] = useState("");
  const [updatingAll, setUpdatingAll] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadPage = useCallback(async ({ nextCursor = null, append = false } = {}) => {
    setError("");
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(pageSize) });
      if (nextCursor) params.set("cursor", nextCursor);
      if (unreadOnly) params.set("unreadOnly", "true");
      const response = await fetch(`/api/notifications?${params}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load notifications.");
      setNotifications((current) => append ? [...current, ...result.notifications] : result.notifications);
      setUnreadCount(result.unreadCount);
      setCursor(result.nextCursor);
      setHasMore(result.hasMore);
    } catch (loadError) {
      setError(loadError.message || "Could not load notifications.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [unreadOnly]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadPage();
    }, 0);

    return () => clearTimeout(timer);
  }, [loadPage]);

  async function markRead(id) {
    if (updatingId) return;
    setError("");
    setMessage("");
    setUpdatingId(id);
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not update the notification.");
      setNotifications((current) => current.map((item) => item.id === id ? { ...item, read: true } : item));
      setUnreadCount((count) => Math.max(0, count - 1));
    } catch (updateError) {
      setError(updateError.message || "Could not update the notification.");
    } finally {
      setUpdatingId("");
    }
  }

  async function markAllRead() {
    if (updatingAll) return;
    setError("");
    setMessage("");
    setUpdatingAll(true);
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not update notifications.");
      setNotifications((current) => current.map((item) => ({ ...item, read: true })));
      setUnreadCount(0);
      setMessage("All notifications marked as read.");
    } catch (updateError) {
      setError(updateError.message || "Could not update notifications.");
    } finally {
      setUpdatingAll(false);
    }
  }

  return (
    <main className="min-h-screen bg-paper px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-5 rounded-2xl bg-forest p-6 text-white sm:p-8">
          <div>
            <a className="text-sm text-white/75 hover:text-white" href="/dashboard">Ratewell / Dashboard</a>
            <h1 className="mt-3 text-3xl font-semibold">Notifications</h1>
            <p className="mt-2 text-sm text-white/75">{unreadCount} unread notification{unreadCount === 1 ? "" : "s"}</p>
          </div>
          <UserTopNav />
        </header>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={unreadOnly} onChange={(event) => setUnreadOnly(event.target.checked)} />
              Unread only
            </label>
            <button type="button" disabled={unreadCount === 0 || updatingAll} onClick={markAllRead} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50">
              {updatingAll ? "Updating…" : "Mark all as read"}
            </button>
          </div>
          {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
          {message && <p role="status" className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
          {loading && <p role="status" className="py-8 text-center text-sm text-slate-500">Loading notifications…</p>}
          {!loading && notifications.length === 0 && <p className="py-8 text-center text-sm text-slate-500">{unreadOnly ? "No unread notifications." : "You have no notifications yet."}</p>}
          <ul className="divide-y">
            {notifications.map((item) => (
              <li key={item.id} className={`py-4 ${item.read ? "opacity-70" : ""}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="font-semibold">{item.title}</h2>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{item.message}</p>
                    <time className="mt-2 block text-xs text-slate-500" dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time>
                  </div>
                  {!item.read && <button type="button" disabled={updatingId === item.id} onClick={() => markRead(item.id)} className="shrink-0 rounded-lg border border-forest px-3 py-2 text-xs font-semibold text-forest disabled:opacity-50">{updatingId === item.id ? "Updating…" : "Mark read"}</button>}
                </div>
              </li>
            ))}
          </ul>
          {hasMore && <div className="mt-5 text-center"><button type="button" disabled={loadingMore} onClick={() => loadPage({ nextCursor: cursor, append: true })} className="rounded-xl bg-forest px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{loadingMore ? "Loading…" : "Load more"}</button></div>}
        </section>
      </div>
    </main>
  );
}
