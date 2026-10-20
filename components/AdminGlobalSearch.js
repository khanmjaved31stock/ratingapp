"use client";

import { useEffect, useState } from "react";

export default function AdminGlobalSearch() {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const search = query.trim();
    if (search.length < 2) return undefined;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setError("");
      try {
        const params = new URLSearchParams({ q: search, page: String(page) });
        const response = await fetch(`/api/admin/search?${params}`, { cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not search admin records.");
        if (!cancelled) {
          setCategories(result.categories || []);
          setSearched(true);
        }
      } catch (searchError) {
        if (!cancelled) {
          setError(searchError.message || "Could not search admin records.");
          setCategories([]);
          setSearched(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, page]);

  const hasNextPage = categories.some((category) => category.pages > page);
  const hasPreviousPage = page > 1;
  const hasResults = categories.some((category) => category.items.length > 0);

  return (
    <section aria-label="Global admin search" className="mb-8 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <label htmlFor="admin-global-search" className="block text-sm font-semibold">Search requests, packages, and support</label>
      <div className="mt-2 flex gap-2">
        <input
          id="admin-global-search"
          type="search"
          value={query}
          onChange={(event) => {
            const value = event.target.value;
            setQuery(value);
            setPage(1);
            if (value.trim().length < 2) {
              setCategories([]);
              setError("");
              setSearched(false);
              setLoading(false);
            } else {
              setCategories([]);
              setSearched(false);
              setLoading(true);
            }
          }}
          onKeyDown={(event) => { if (event.key === "Escape") { setQuery(""); setPage(1); setCategories([]); setError(""); setSearched(false); setLoading(false); } }}
          maxLength={100}
          aria-describedby="admin-global-search-note"
          placeholder="Reference, package, withdrawal, support message…"
          className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
        />
        {query && <button type="button" onClick={() => { setQuery(""); setPage(1); setCategories([]); setError(""); setSearched(false); setLoading(false); }} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold">Clear</button>}
      </div>
      <p id="admin-global-search-note" className="mt-1 text-xs text-slate-500">User accounts are intentionally excluded; search them in the Users section.</p>
      {loading && <p role="status" className="mt-3 text-sm text-slate-500">Searching…</p>}
      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {!loading && searched && !error && !hasResults && <p className="mt-3 text-sm text-slate-500">No matching requests or packages on this page.</p>}
      {!loading && hasResults && <div className="mt-4 grid gap-3 md:grid-cols-2">
        {categories.filter((category) => category.items.length > 0).map((category) => <section key={category.id} className="rounded-xl border border-slate-200 p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="font-semibold">{category.label}</h2><span className="text-xs text-slate-500">{category.total} matches</span></div>
          <ul className="mt-2 divide-y">{category.items.map((item) => <li key={item.id} className="py-2">
            <a href={`#${item.target}`} className="block rounded focus:outline-none focus:ring-2 focus:ring-forest">
              <span className="flex flex-wrap items-center justify-between gap-2 text-sm font-medium"><span>{item.title || "Request"}</span><span className="text-xs capitalize text-slate-500">{item.status}</span></span>
              {item.user && <span className="mt-0.5 block text-xs text-slate-500">{item.user.name} · {item.user.email}</span>}
              <span className="mt-0.5 block break-words text-xs text-slate-600">{item.detail}</span>
              <span className="mt-0.5 block text-xs text-slate-400">{item.createdAt ? new Date(item.createdAt).toLocaleString() : ""} · Open queue</span>
            </a>
          </li>)}</ul>
        </section>)}
      </div>}
      {(hasNextPage || hasPreviousPage) && !loading && <nav aria-label="Global search pages" className="mt-4 flex items-center justify-end gap-2">
        <button type="button" disabled={!hasPreviousPage} onClick={() => { setLoading(true); setCategories([]); setPage((current) => Math.max(1, current - 1)); }} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50">Previous</button>
        <span className="text-xs text-slate-500">Page {page}</span>
        <button type="button" disabled={!hasNextPage} onClick={() => { setLoading(true); setCategories([]); setPage((current) => current + 1); }} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50">Next</button>
      </nav>}
    </section>
  );
}
