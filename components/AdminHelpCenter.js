"use client";

import { useCallback, useEffect, useState } from "react";

const panel = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7";
const field = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm";

const emptyForm = {
  id: "",
  title: "",
  slug: "",
  summary: "",
  categoryId: "",
  paragraphsText: "",
  stepsText: "",
  images: [],
  videosText: "",
  attachments: [],
  visibility: "private",
  status: "draft",
  publishAt: "",
  featured: false,
  sortOrder: "0",
  tagsText: "",
  relatedGuideIds: [],
  updateNote: "",
};

async function request(url, method = "GET", body) {
  const response = await fetch(url, {
    method,
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "The request could not be completed.");
  return result;
}

function localDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function splitLines(value) {
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

function guideToForm(guide) {
  return {
    id: guide.id,
    title: guide.title,
    slug: guide.slug,
    summary: guide.summary,
    categoryId: guide.categoryId,
    paragraphsText: guide.paragraphs.join("\n\n"),
    stepsText: guide.steps.join("\n"),
    images: guide.images || [],
    videosText: (guide.videos || []).map((item) => item.provider === "youtube"
      ? `https://www.youtube.com/watch?v=${item.videoId}`
      : `https://vimeo.com/${item.videoId}`).join("\n"),
    attachments: guide.attachments || [],
    visibility: guide.visibility,
    status: guide.status,
    publishAt: guide.status === "scheduled" ? guide.publishAtLocal || localDateTime(guide.publishAt) : "",
    featured: guide.featured,
    sortOrder: String(guide.sortOrder),
    tagsText: guide.tags.join(", "),
    relatedGuideIds: guide.relatedGuideIds,
    updateNote: "",
  };
}

export default function AdminHelpCenter({ role }) {
  const isSuper = role === "superAdmin";
  const [guides, setGuides] = useState([]);
  const [categories, setCategories] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [categoryForm, setCategoryForm] = useState({ name: "", slug: "", sortOrder: "100" });
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [feedbackKind, setFeedbackKind] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState("");
  const [guidePage, setGuidePage] = useState(1);
  const [feedbackPage, setFeedbackPage] = useState(1);
  const [guidePages, setGuidePages] = useState(0);
  const [feedbackPages, setFeedbackPages] = useState(0);
  const [history, setHistory] = useState(null);
  const [preview, setPreview] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [timeZone, setTimeZone] = useState("UTC");

  const loadGuides = useCallback(async () => {
    if (!isSuper) return;
    try {
      const query = new URLSearchParams({ page: String(guidePage) });
      if (q.trim()) query.set("q", q.trim());
      if (statusFilter) query.set("status", statusFilter);
      if (categoryFilter) query.set("categoryId", categoryFilter);
      const result = await request(`/api/help-center/guides?${query}`);
      setGuides(result.guides || []);
      setCategories(result.categories || []);
      setGuidePages(result.pages || 0);
      setTimeZone(result.timeZone || "UTC");
    } catch (loadError) {
      setError(loadError.message || "Could not load guides.");
    }
  }, [categoryFilter, guidePage, isSuper, q, statusFilter]);

  const loadFeedback = useCallback(async () => {
    try {
      const query = new URLSearchParams({ page: String(feedbackPage) });
      if (feedbackKind) query.set("kind", feedbackKind);
      if (feedbackStatus) query.set("status", feedbackStatus);
      const result = await request(`/api/help-center/feedback?${query}`);
      setFeedback(result.feedback || []);
      setFeedbackPages(result.pages || 0);
    } catch (loadError) {
      setError(loadError.message || "Could not load guide reports.");
    }
  }, [feedbackKind, feedbackPage, feedbackStatus]);

  useEffect(() => {
    const timer = window.setTimeout(loadGuides, 0);
    return () => window.clearTimeout(timer);
  }, [loadGuides]);
  useEffect(() => {
    const timer = window.setTimeout(loadFeedback, 0);
    return () => window.clearTimeout(timer);
  }, [loadFeedback]);

  function editGuide(guide) {
    setForm(guideToForm(guide));
    setHistory(null);
    setPreview(false);
    setNotice("");
    setError("");
  }

  function buildPayload(currentForm = form) {
    const images = currentForm.images.map((image) => ({
      publicId: image.publicId || "",
      alt: image.alt || "",
    }));
    const attachments = currentForm.attachments.map((file) => ({
      publicId: file.publicId || "",
      filename: file.filename || "",
      sizeBytes: file.sizeBytes || 0,
    }));
    return {
      title: currentForm.title,
      slug: currentForm.slug,
      summary: currentForm.summary,
      categoryId: currentForm.categoryId,
      paragraphs: currentForm.paragraphsText.split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean),
      steps: splitLines(currentForm.stepsText),
      images,
      videos: splitLines(currentForm.videosText).map((url) => ({ url })),
      attachments,
      visibility: currentForm.visibility,
      status: currentForm.status,
      publishAt: currentForm.publishAt,
      featured: currentForm.featured,
      sortOrder: Number(currentForm.sortOrder),
      tags: currentForm.tagsText.split(",").map((tag) => tag.trim()).filter(Boolean),
      relatedGuideIds: currentForm.relatedGuideIds,
      updateNote: currentForm.updateNote,
    };
  }

  async function saveGuide(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const payload = buildPayload();
      const result = await request(
        form.id ? `/api/help-center/guides/${form.id}` : "/api/help-center/guides",
        form.id ? "PATCH" : "POST",
        payload,
      );
      setNotice(form.id ? "Guide changes saved and version history recorded." : "Guide created.");
      setForm(guideToForm(result.guide));
      await loadGuides();
    } catch (saveError) {
      setError(saveError.message || "Could not save the guide.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadAsset(file, kind) {
    if (!file) return;
    setError("");
    setNotice("");
    setUploading(true);
    try {
      const data = new FormData();
      data.set("kind", kind);
      data.set(kind === "image" ? "proof" : "file", file);
      const response = await fetch("/api/help-center/uploads", { method: "POST", body: data });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Upload failed.");
      if (kind === "image") {
        setForm((current) => ({ ...current, images: [...current.images, result.image] }));
        setNotice("Image uploaded privately. Add descriptive alternative text before saving.");
      } else {
        setForm((current) => ({ ...current, attachments: [...current.attachments, result.attachment] }));
        setNotice("PDF uploaded privately.");
      }
    } catch (uploadError) {
      setError(uploadError.message || "Could not upload the file.");
    } finally {
      setUploading(false);
    }
  }

  async function saveCategory(category) {
    setBusy(true);
    setError("");
    try {
      if (category.id) {
        await request("/api/help-center/categories", "PATCH", category);
      } else {
        await request("/api/help-center/categories", "POST", category);
        setCategoryForm({ name: "", slug: "", sortOrder: String(categories.length + 1) });
      }
      setNotice("Category saved.");
      await loadGuides();
    } catch (saveError) {
      setError(saveError.message || "Could not save category.");
    } finally {
      setBusy(false);
    }
  }

  async function showHistory(guideId) {
    setError("");
    try {
      const result = await request(`/api/help-center/guides/${guideId}`);
      setHistory({ guideId, versions: result.versions, audits: result.audits || [] });
    } catch (historyError) {
      setError(historyError.message || "Could not load version history.");
    }
  }

  async function archiveGuide(guide) {
    if (!window.confirm(`Archive "${guide.title}" and make it private?`)) return;
    setError("");
    setBusy(true);
    try {
      const currentForm = guideToForm(guide);
      await request(`/api/help-center/guides/${guide.id}`, "PATCH", buildPayload({
        ...currentForm,
        status: "archived",
        visibility: "private",
        publishAt: "",
      }));
      setNotice("Guide archived. Its version history and media are preserved.");
      await loadGuides();
    } catch (archiveError) {
      setError(archiveError.message || "Could not archive this guide.");
    } finally {
      setBusy(false);
    }
  }

  async function updateFeedback(item, status) {
    setError("");
    try {
      await request("/api/help-center/feedback", "PATCH", { id: item.id, status });
      setNotice("Review item updated.");
      await loadFeedback();
    } catch (updateError) {
      setError(updateError.message || "Could not update review item.");
    }
  }

  const sectionId = isSuper ? "help-center" : "help-review";
  return (
    <section id={sectionId} className={`${panel} scroll-mt-6`}>
      <header className="mb-5">
        <h2 className="text-xl font-semibold">{isSuper ? "Guidelines & Help Center" : "Help Center reports"}</h2>
        <p className="mt-1 text-sm text-slate-600">{isSuper ? "Write plain-text guides, control public visibility, schedule publishing, manage categories, and review version history." : "Review public guide ratings and user-reported Help Center issues."}</p>
      </header>
      {(error || notice) && <p role={error ? "alert" : "status"} className={`mb-4 rounded-lg px-3 py-2 text-sm ${error ? "bg-red-50 text-red-700" : "bg-mint/50 text-forest"}`}>{error || notice}</p>}

      {isSuper && <>
        <form onSubmit={saveGuide} className="mb-7 grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5 lg:grid-cols-2">
          <div className="lg:col-span-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">{form.id ? "Edit guide" : "Create a guide"}</h3>
            <div className="flex gap-2">
              {form.id && <button type="button" onClick={() => { setForm(emptyForm); setHistory(null); setPreview(false); }} className="rounded-lg border bg-white px-3 py-2 text-sm">New guide</button>}
              <button type="button" onClick={() => setPreview((value) => !value)} className="rounded-lg border bg-white px-3 py-2 text-sm">{preview ? "Hide preview" : "Preview"}</button>
            </div>
          </div>
          <label className="text-sm font-medium">Title<input className={`${field} mt-1`} required maxLength={160} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value, slug: form.id ? form.slug : event.target.value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") })} /></label>
          <label className="text-sm font-medium">URL slug<input className={`${field} mt-1`} required maxLength={180} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} /></label>
          <label className="text-sm font-medium lg:col-span-2">Summary<textarea className={`${field} mt-1`} rows={2} required maxLength={400} value={form.summary} onChange={(event) => setForm({ ...form, summary: event.target.value })} /></label>
          <label className="text-sm font-medium">Category<select className={`${field} mt-1`} required value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value })}><option value="">Choose a category</option>{categories.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="text-sm font-medium">Tags (comma-separated)<input className={`${field} mt-1`} maxLength={400} value={form.tagsText} onChange={(event) => setForm({ ...form, tagsText: event.target.value })} placeholder="account, security" /></label>
          <label className="text-sm font-medium lg:col-span-2">Guide text (separate paragraphs with a blank line)<textarea className={`${field} mt-1`} rows={5} maxLength={8000} value={form.paragraphsText} onChange={(event) => setForm({ ...form, paragraphsText: event.target.value })} /></label>
          <label className="text-sm font-medium lg:col-span-2">Ordered steps (one per line)<textarea className={`${field} mt-1`} rows={5} maxLength={8000} value={form.stepsText} onChange={(event) => setForm({ ...form, stepsText: event.target.value })} /></label>
          <label className="text-sm font-medium lg:col-span-2">Approved video URLs (one HTTPS YouTube or Vimeo URL per line)<textarea className={`${field} mt-1`} rows={2} value={form.videosText} onChange={(event) => setForm({ ...form, videosText: event.target.value })} /></label>
          <div className="text-sm font-medium">Guide images
            <input className={`${field} mt-1`} type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={(event) => { uploadAsset(event.target.files?.[0], "image"); event.target.value = ""; }} />
            <span className="mt-1 block text-xs font-normal text-slate-500">JPEG, PNG, WebP; actual content checked, max 5 MB.</span>
            <ul className="mt-2 space-y-3">{form.images.map((image, index) => <li key={`${image.publicId}-${index}`} className="flex gap-3 rounded-lg border bg-white p-2">
              {image.url && <img src={image.url} alt="" className="h-16 w-20 rounded object-cover" />}
              <div className="min-w-0 flex-1"><label className="text-xs font-semibold">Alternative text<input className={`${field} mt-1`} value={image.alt} maxLength={160} onChange={(event) => setForm((current) => ({ ...current, images: current.images.map((item, itemIndex) => itemIndex === index ? { ...item, alt: event.target.value } : item) }))} /></label></div>
              <button type="button" onClick={() => setForm((current) => ({ ...current, images: current.images.filter((_, itemIndex) => itemIndex !== index) }))} className="self-start text-sm text-red-700 underline">Remove</button>
            </li>)}</ul>
          </div>
          <div className="text-sm font-medium">PDF attachments
            <input className={`${field} mt-1`} type="file" accept="application/pdf,.pdf" disabled={uploading} onChange={(event) => { uploadAsset(event.target.files?.[0], "pdf"); event.target.value = ""; }} />
            <span className="mt-1 block text-xs font-normal text-slate-500">Private PDF storage, checked signature/content, max 8 MB.</span>
            <ul className="mt-2 space-y-2">{form.attachments.map((file, index) => <li key={`${file.publicId}-${index}`} className="flex items-center justify-between gap-3 rounded-lg border bg-white p-3 text-sm"><span className="break-all">{file.filename} · {Math.ceil(file.sizeBytes / 1024)} KB</span><button type="button" onClick={() => setForm((current) => ({ ...current, attachments: current.attachments.filter((_, itemIndex) => itemIndex !== index) }))} className="shrink-0 text-red-700 underline">Remove</button></li>)}</ul>
          </div>
          <label className="text-sm font-medium">Visibility<select className={`${field} mt-1`} value={form.visibility} onChange={(event) => setForm({ ...form, visibility: event.target.value })}><option value="private">Private (staff preview only)</option><option value="public">Public</option></select></label>
          <label className="text-sm font-medium">Publishing state<select className={`${field} mt-1`} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value, publishAt: event.target.value === "scheduled" ? form.publishAt : "" })}><option value="draft">Draft</option><option value="scheduled">Schedule</option><option value="published">Publish now</option><option value="archived">Archive</option></select></label>
          {form.status === "scheduled" && <label className="text-sm font-medium">Publish time ({timeZone})<input className={`${field} mt-1`} type="datetime-local" required value={form.publishAt} onChange={(event) => setForm({ ...form, publishAt: event.target.value })} /></label>}
          <label className="text-sm font-medium">Display order<input className={`${field} mt-1`} type="number" min="0" max="10000" value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: event.target.value })} /></label>
          <label className="text-sm font-medium">Update note<input className={`${field} mt-1`} maxLength={300} value={form.updateNote} onChange={(event) => setForm({ ...form, updateNote: event.target.value })} placeholder="Optional note about this revision" /></label>
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={form.featured} onChange={(event) => setForm({ ...form, featured: event.target.checked })} />Feature this guide</label>
          <label className="text-sm font-medium lg:col-span-2">Related guides<select multiple className={`${field} mt-1 min-h-24`} value={form.relatedGuideIds} onChange={(event) => setForm({ ...form, relatedGuideIds: Array.from(event.target.selectedOptions, (option) => option.value) })}>{guides.filter((item) => item.id !== form.id).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
          <div className="flex flex-wrap gap-3 lg:col-span-2">
            <button disabled={busy || uploading} className="rounded-xl bg-forest px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : form.id ? "Save revision" : "Create guide"}</button>
            {form.id && <button type="button" onClick={() => showHistory(form.id)} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold">Version history</button>}
          </div>
          {preview && <article className="rounded-xl border border-forest/20 bg-white p-5 lg:col-span-2"><p className="text-xs font-semibold uppercase text-forest">Preview · {form.visibility}</p><h3 className="mt-2 text-xl font-semibold">{form.title || "Guide title"}</h3><p className="mt-2 text-slate-600">{form.summary}</p><div className="mt-4 space-y-3">{form.paragraphsText.split(/\n\s*\n/).map((paragraph, index) => <p key={index} className="whitespace-pre-wrap">{paragraph}</p>)}</div><ol className="mt-4 list-inside list-decimal space-y-2">{splitLines(form.stepsText).map((line, index) => <li key={index}>{line}</li>)}</ol><div className="mt-4 grid gap-3 sm:grid-cols-2">{form.images.map((image, index) => image.url && <img key={index} src={image.url} alt={image.alt} className="max-h-60 rounded-lg object-contain" />)}</div><ul className="mt-4 list-inside list-disc">{form.attachments.map((file, index) => <li key={index}>{file.filename}</li>)}</ul></article>}
        </form>

        <section className="mb-7 rounded-xl border border-slate-200 p-4">
          <h3 className="font-semibold">Manage categories</h3>
          <form onSubmit={(event) => { event.preventDefault(); saveCategory({ ...categoryForm, sortOrder: Number(categoryForm.sortOrder) }); }} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_120px_auto]">
            <input className={field} placeholder="New category name" required maxLength={80} value={categoryForm.name} onChange={(event) => setCategoryForm({ ...categoryForm, name: event.target.value, slug: event.target.value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") })} />
            <input className={field} placeholder="URL slug" required value={categoryForm.slug} onChange={(event) => setCategoryForm({ ...categoryForm, slug: event.target.value })} />
            <input className={field} type="number" min="0" max="10000" value={categoryForm.sortOrder} onChange={(event) => setCategoryForm({ ...categoryForm, sortOrder: event.target.value })} aria-label="New category display order" />
            <button disabled={busy} className="rounded-lg border px-4 py-2 text-sm font-semibold">Add category</button>
          </form>
          <ul className="mt-4 divide-y">{categories.map((category) => <li key={category.id} className="grid gap-2 py-3 sm:grid-cols-[1fr_1fr_100px_auto]">
            <input aria-label={`${category.name} name`} className={field} value={category.editName ?? category.name} onChange={(event) => setCategories((current) => current.map((item) => item.id === category.id ? { ...item, editName: event.target.value } : item))} />
            <input aria-label={`${category.name} slug`} className={field} value={category.editSlug ?? category.slug} onChange={(event) => setCategories((current) => current.map((item) => item.id === category.id ? { ...item, editSlug: event.target.value } : item))} />
            <input aria-label={`${category.name} order`} className={field} type="number" value={category.editOrder ?? category.sortOrder} onChange={(event) => setCategories((current) => current.map((item) => item.id === category.id ? { ...item, editOrder: event.target.value } : item))} />
            <div className="flex items-center gap-2"><button type="button" disabled={busy} onClick={() => saveCategory({ ...category, name: category.editName ?? category.name, slug: category.editSlug ?? category.slug, sortOrder: Number(category.editOrder ?? category.sortOrder), active: category.active })} className="rounded-lg border px-3 py-2 text-sm">Save</button><button type="button" disabled={busy} onClick={() => saveCategory({ ...category, active: !category.active })} className="text-sm text-forest underline">{category.active ? "Deactivate" : "Activate"}</button></div>
          </li>)}</ul>
        </section>

        <section className="mb-7">
          <div className="grid gap-3 sm:grid-cols-3">
            <input className={field} placeholder="Search title, summary, tags" value={q} onChange={(event) => { setQ(event.target.value); setGuidePage(1); }} maxLength={100} />
            <select className={field} value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setGuidePage(1); }}><option value="">All publishing states</option>{["draft", "scheduled", "published", "archived"].map((value) => <option key={value} value={value}>{value}</option>)}</select>
            <select className={field} value={categoryFilter} onChange={(event) => { setCategoryFilter(event.target.value); setGuidePage(1); }}><option value="">All categories</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          </div>
          <ul className="mt-4 divide-y rounded-xl border border-slate-200 bg-white px-4">{guides.map((guide) => <li key={guide.id} className="flex flex-wrap items-center gap-3 py-4">
            <div className="min-w-48 flex-1"><p className="font-semibold">{guide.title}</p><p className="mt-1 text-xs text-slate-500">{guide.category} · {guide.visibility} · {guide.status} · {guide.views} views · {guide.stats.helpful} helpful · {guide.stats.issues} reports</p></div>
            <button type="button" onClick={() => editGuide(guide)} className="text-sm font-semibold text-forest underline">Edit</button>
            <button type="button" onClick={() => showHistory(guide.id)} className="text-sm font-semibold text-forest underline">History</button>
            <button type="button" disabled={busy} onClick={() => archiveGuide(guide)} className="text-sm font-semibold text-red-700 underline">Archive</button>
          </li>)}</ul>
          {guidePages > 1 && <div className="mt-3 flex items-center justify-between text-sm"><button disabled={guidePage <= 1} onClick={() => setGuidePage((value) => value - 1)} className="rounded-lg border px-3 py-2 disabled:opacity-50">Previous</button><span>Page {guidePage} of {guidePages}</span><button disabled={guidePage >= guidePages} onClick={() => setGuidePage((value) => value + 1)} className="rounded-lg border px-3 py-2 disabled:opacity-50">Next</button></div>}
        </section>
        {history && <section className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex justify-between"><h3 className="font-semibold">Version and audit history</h3><button type="button" onClick={() => setHistory(null)} className="text-sm underline">Close</button></div><h4 className="mt-4 text-sm font-semibold">Content versions</h4><ol className="mt-2 divide-y">{history.versions.map((item) => <li key={item.version} className="py-3 text-sm"><strong>Version {item.version}: {item.title}</strong> · {item.actor} ({item.actorRole}) · {new Date(item.createdAt).toLocaleString()}<p className="text-slate-600">{item.visibility} · {item.status} · {item.updateNote || "No update note."}</p><details className="mt-2"><summary className="cursor-pointer font-medium text-forest">View saved content</summary><p className="mt-2 whitespace-pre-wrap">{item.summary}</p><div className="mt-2 space-y-2">{item.paragraphs.map((paragraph, index) => <p key={index} className="whitespace-pre-wrap">{paragraph}</p>)}</div><ol className="mt-2 list-inside list-decimal">{item.steps.map((step, index) => <li key={index}>{step}</li>)}</ol></details></li>)}</ol><h4 className="mt-4 text-sm font-semibold">Administrative actions</h4>{history.audits.length ? <ol className="mt-2 divide-y">{history.audits.map((item, index) => <li key={`${item.action}-${item.createdAt}-${index}`} className="py-2 text-sm"><strong>{item.action}</strong> · {item.actor} ({item.actorRole}) · {new Date(item.createdAt).toLocaleString()}</li>)}</ol> : <p className="mt-2 text-sm text-slate-500">No audit events are recorded yet.</p>}</section>}
      </>}

      <section className={isSuper ? "mt-8" : ""}>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3"><h3 className="font-semibold">Feedback and issue reports</h3><p className="text-sm text-slate-500">Private to authorized support staff</p></div>
        <div className="mb-3 grid gap-2 sm:grid-cols-2">
          <select className={field} value={feedbackKind} onChange={(event) => { setFeedbackKind(event.target.value); setFeedbackPage(1); }} aria-label="Filter Help Center feedback type"><option value="">All feedback types</option><option value="helpful">Guide ratings</option><option value="issue">Issue reports</option></select>
          <select className={field} value={feedbackStatus} onChange={(event) => { setFeedbackStatus(event.target.value); setFeedbackPage(1); }} aria-label="Filter Help Center feedback status"><option value="">All statuses</option><option value="open">Open</option><option value="reviewing">Reviewing</option><option value="resolved">Resolved</option></select>
        </div>
        {feedback.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">No Help Center submissions to review.</p> : <ul className="divide-y rounded-xl border border-slate-200 bg-white px-4">{feedback.map((item) => <li key={item.id} className="py-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{item.kind === "issue" ? "Issue report" : item.helpful ? "Helpful vote" : "Not helpful"} · {item.guide?.title || "Guide"}</p><p className="mt-1 text-xs text-slate-500">{item.user} · {new Date(item.createdAt).toLocaleString()} · {item.status}</p><p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{item.message || "No additional note."}</p></div><div className="flex gap-2">{item.status !== "reviewing" && <button onClick={() => updateFeedback(item, "reviewing")} className="rounded-lg border px-3 py-2 text-sm">Reviewing</button>}{item.status !== "resolved" && <button onClick={() => updateFeedback(item, "resolved")} className="rounded-lg border px-3 py-2 text-sm font-semibold text-forest">Resolve</button>}{item.status !== "open" && <button onClick={() => updateFeedback(item, "open")} className="rounded-lg border px-3 py-2 text-sm">Reopen</button>}</div></div>
        </li>)}</ul>}
        {feedbackPages > 1 && <div className="mt-3 flex items-center justify-between text-sm"><button disabled={feedbackPage <= 1} onClick={() => setFeedbackPage((value) => value - 1)} className="rounded-lg border px-3 py-2 disabled:opacity-50">Previous</button><span>Page {feedbackPage} of {feedbackPages}</span><button disabled={feedbackPage >= feedbackPages} onClick={() => setFeedbackPage((value) => value + 1)} className="rounded-lg border px-3 py-2 disabled:opacity-50">Next</button></div>}
      </section>
    </section>
  );
}
