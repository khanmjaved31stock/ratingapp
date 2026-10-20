"use client";

import { useEffect, useState } from "react";

const categoriesPath = "/api/help-center";

function GuideCard({ guide }) {
  return (
    <a href={`/help/${encodeURIComponent(guide.slug)}`} className="group block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-forest/40 hover:shadow-md">
      <p className="text-xs font-semibold uppercase tracking-wide text-forest">{guide.category}</p>
      <h3 className="mt-2 text-lg font-semibold text-slate-900 group-hover:text-forest">{guide.title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{guide.summary}</p>
      <time className="mt-4 block text-xs text-slate-500" dateTime={guide.updatedAt}>Updated {new Date(guide.updatedAt).toLocaleDateString()}</time>
    </a>
  );
}

export default function HelpCenter() {
  const [result, setResult] = useState({ guides: [], featured: [], recent: [], categories: [], page: 1, pages: 0 });
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const query = new URLSearchParams({ page: String(page) });
        if (search.trim()) query.set("q", search.trim());
        if (category) query.set("category", category);
        const response = await fetch(`${categoriesPath}?${query}`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Help Center could not be loaded.");
        if (!cancelled) setResult(data);
      } catch (loadError) {
        if (!cancelled) setError(loadError.message || "Help Center could not be loaded.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, search ? 180 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [search, category, page]);

  const filtered = Boolean(search.trim() || category);
  return (
    <main className="min-h-screen bg-paper px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <a className="text-sm font-semibold text-forest underline" href="/">Ratewell sign in</a>
          <a className="text-sm font-semibold text-forest underline" href="/dashboard">User dashboard</a>
        </header>
        <section className="rounded-3xl bg-forest px-6 py-10 text-white sm:px-10 sm:py-14">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-white/70">Ratewell Help Center</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">Guidelines &amp; help</h1>
          <p className="mt-3 max-w-2xl leading-7 text-white/80">Find clear answers about using your account, completing tasks, payments, rewards, and platform rules.</p>
          <label className="mt-7 block">
            <span className="sr-only">Search help guides</span>
            <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} maxLength={100} className="w-full rounded-xl border border-white/20 bg-white px-4 py-3 text-slate-900 outline-none ring-forest focus:ring-2" placeholder="Search guides…" />
          </label>
        </section>
        <div className="mt-7 grid gap-7 lg:grid-cols-[230px_minmax(0,1fr)]">
          <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="font-semibold">Categories</h2>
            <nav aria-label="Help categories" className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:flex-col">
              <button onClick={() => { setCategory(""); setPage(1); }} aria-pressed={!category} className={`shrink-0 rounded-lg px-3 py-2 text-left text-sm ${!category ? "bg-mint font-semibold text-forest" : "text-slate-600 hover:bg-slate-50"}`}>All guides</button>
              {result.categories.map((item) => <button key={item.id} onClick={() => { setCategory(item.slug); setPage(1); }} aria-pressed={category === item.slug} className={`shrink-0 rounded-lg px-3 py-2 text-left text-sm ${category === item.slug ? "bg-mint font-semibold text-forest" : "text-slate-600 hover:bg-slate-50"}`}>{item.name}</button>)}
            </nav>
          </aside>
          <div className="min-w-0 space-y-8">
            {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
            {!filtered && result.featured.length > 0 && <section>
              <h2 className="mb-4 text-xl font-semibold">Featured guides</h2>
              <div className="grid gap-4 md:grid-cols-2">{result.featured.slice(0, 4).map((guide) => <GuideCard key={guide.id} guide={guide} />)}</div>
            </section>}
            {!filtered && result.recent.length > 0 && <section>
              <h2 className="mb-4 text-xl font-semibold">Recently updated</h2>
              <div className="grid gap-4 md:grid-cols-2">{result.recent.slice(0, 4).map((guide) => <GuideCard key={guide.id} guide={guide} />)}</div>
            </section>}
            <section>
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-xl font-semibold">{filtered ? "Search results" : "All guides"}</h2>
                <p className="text-sm text-slate-500">{result.total ?? result.guides.length} guides</p>
              </div>
              {loading ? <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500" role="status">Loading guides…</p>
                : result.guides.length ? <div className="grid gap-4 md:grid-cols-2">{result.guides.map((guide) => <GuideCard key={guide.id} guide={guide} />)}</div>
                  : <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">No published guides match your search.</p>}
              {result.pages > 1 && <div className="mt-5 flex items-center justify-between gap-3">
                <button disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50">Previous</button>
                <span className="text-sm text-slate-500">Page {page} of {result.pages}</span>
                <button disabled={page >= result.pages || loading} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50">Next</button>
              </div>}
            </section>
          </div>
        </div>
        <footer className="mt-10 border-t border-slate-200 pt-5 text-sm text-slate-600">
          Still need help? <a className="font-semibold text-forest underline" href="/dashboard/support">Contact Support</a>
        </footer>
      </div>
    </main>
  );
}
