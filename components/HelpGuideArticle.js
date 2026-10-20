"use client";

import { useEffect, useState } from "react";

function VideoFrame({ video }) {
  return (
    <div className="aspect-video overflow-hidden rounded-xl bg-slate-100">
      <iframe
        src={video.embedUrl}
        title={`${video.provider === "youtube" ? "YouTube" : "Vimeo"} help video`}
        className="h-full w-full"
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        sandbox="allow-scripts allow-same-origin allow-presentation"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}

export default function HelpGuideArticle({ slug }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [issue, setIssue] = useState("");
  const [reporting, setReporting] = useState(false);
  const [voted, setVoted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/help-center?slug=${encodeURIComponent(slug)}`, { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "This guide could not be found.");
        if (!cancelled) setData(result);
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError.message || "This guide could not be loaded.");
      });
    return () => { cancelled = true; };
  }, [slug]);

  async function sendFeedback(body) {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/help-center", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guideId: data.guide.id, ...body }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not submit your feedback.");
      setMessage(result.message);
      return true;
    } catch (submitError) {
      setError(submitError.message || "Could not submit your feedback.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submitIssue(event) {
    event.preventDefault();
    if (await sendFeedback({ kind: "issue", message: issue })) {
      setIssue("");
      setReporting(false);
    }
  }

  if (error && !data) return <main className="min-h-screen bg-paper px-4 py-12"><div className="mx-auto max-w-3xl"><a href="/help" className="text-sm font-semibold text-forest underline">Back to Help Center</a><p role="alert" className="mt-6 rounded-xl bg-red-50 p-5 text-red-700">{error}</p></div></main>;
  if (!data) return <main className="min-h-screen bg-paper px-4 py-12"><div className="mx-auto max-w-3xl rounded-2xl border bg-white p-6 text-slate-500" role="status">Loading guide…</div></main>;

  const { guide, related, feedback } = data;
  return (
    <main className="min-h-screen bg-paper px-4 py-8 sm:px-6 sm:py-12">
      <article className="mx-auto max-w-3xl">
        <a href="/help" className="text-sm font-semibold text-forest underline">← Help Center</a>
        <header className="mt-6 border-b border-slate-200 pb-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-forest">{guide.category}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{guide.title}</h1>
          <p className="mt-3 text-lg leading-7 text-slate-600">{guide.summary}</p>
          <time className="mt-4 block text-sm text-slate-500" dateTime={guide.updatedAt}>Updated {new Date(guide.updatedAt).toLocaleDateString()}</time>
          {guide.updateNote && <p className="mt-3 rounded-lg bg-mint/40 px-3 py-2 text-sm text-forest"><strong>What changed:</strong> {guide.updateNote}</p>}
        </header>
        <div className="space-y-5 py-7">
          {guide.paragraphs.map((paragraph, index) => <p key={`p-${index}`} className="whitespace-pre-wrap leading-7 text-slate-700">{paragraph}</p>)}
          {!!guide.steps.length && <ol className="space-y-3">
            {guide.steps.map((step, index) => <li key={`s-${index}`} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-mint text-sm font-bold text-forest">{index + 1}</span><p className="whitespace-pre-wrap leading-6 text-slate-700">{step}</p></li>)}
          </ol>}
          {guide.images.map((image) => <figure key={image.url}><img src={image.url} alt={image.alt} loading="lazy" className="max-h-[32rem] w-full rounded-xl border border-slate-200 object-contain" /></figure>)}
          {guide.videos.map((video, index) => <VideoFrame key={`${video.provider}-${index}`} video={video} />)}
          {!!guide.attachments.length && <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="font-semibold">Downloads</h2>
            <ul className="mt-2 space-y-2">{guide.attachments.map((file) => <li key={file.url}><a href={file.url} rel="noreferrer" className="font-medium text-forest underline">{file.filename}</a><span className="ml-2 text-xs text-slate-500">PDF · {Math.ceil(file.sizeBytes / 1024)} KB</span></li>)}</ul>
          </section>}
        </div>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6" aria-labelledby="guide-feedback-title">
          <h2 id="guide-feedback-title" className="font-semibold">Was this guide helpful?</h2>
          <p className="mt-1 text-sm text-slate-500">{feedback.helpful} found it helpful · {feedback.notHelpful} did not</p>
          {message && <p role="status" className="mt-3 text-sm text-forest">{message}</p>}
          {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <button disabled={busy || voted} onClick={async () => setVoted(await sendFeedback({ kind: "helpful", helpful: true }))} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50">Yes, helpful</button>
            <button disabled={busy || voted} onClick={async () => setVoted(await sendFeedback({ kind: "helpful", helpful: false }))} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50">Not really</button>
            <button onClick={() => setReporting((value) => !value)} className="rounded-lg px-4 py-2 text-sm font-semibold text-forest underline">{reporting ? "Cancel report" : "Report an issue"}</button>
          </div>
          {reporting && <form onSubmit={submitIssue} className="mt-4 space-y-3">
            <label className="block text-sm font-medium">What needs attention?<textarea value={issue} onChange={(event) => setIssue(event.target.value)} maxLength={2000} required rows={4} className="mt-1 w-full rounded-xl border border-slate-300 p-3" /></label>
            <button disabled={busy} className="rounded-lg bg-forest px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Send report</button>
          </form>}
        </section>
        {!!related.length && <section className="mt-8">
          <h2 className="mb-3 text-xl font-semibold">Related guides</h2>
          <ul className="space-y-2">{related.map((item) => <li key={item.id}><a className="text-forest underline" href={`/help/${encodeURIComponent(item.slug)}`}>{item.title}</a><p className="text-sm text-slate-600">{item.summary}</p></li>)}</ul>
        </section>}
      </article>
    </main>
  );
}
