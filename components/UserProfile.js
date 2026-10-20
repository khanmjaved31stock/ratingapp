"use client";

import { useEffect, useState } from "react";
import UserTopNav from "@/components/UserTopNav";

export default function UserProfile({ initialProfile }) {
  const [name, setName] = useState(initialProfile.name);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [avatar, setAvatar] = useState("");
  useEffect(() => {
    fetch("/api/profile", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load profile details.");
        return result;
      })
      .then((result) => {
        if (result.profile?.avatar) setAvatar(result.profile.avatar);
      })
      .catch((loadError) => setError(loadError.message || "Could not load your profile photo."));
  }, []);
  async function updateProfile(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not update your profile.");
      setMessage("Profile updated.");
    } catch (requestError) {
      setError(requestError.message || "Could not update your profile.");
    } finally {
      setBusy(false);
    }
  }
  async function updatePassword(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/profile/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not change password.");
      setMessage(`${result.message} Please return to the sign-in page.`);
      setCurrentPassword("");
      setNewPassword("");
    } catch (requestError) {
      setError(requestError.message || "Could not change password.");
    } finally {
      setBusy(false);
    }
  }
  async function uploadAvatar(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const form = new FormData();
      form.set("avatar", file);
      const response = await fetch("/api/profile/avatar", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not upload your photo.");
      setAvatar(result.avatar);
      setMessage(result.message);
    } catch (uploadError) {
      setError(uploadError.message || "Could not upload your photo.");
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }
  return (
    <main className="min-h-screen bg-paper px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-5 rounded-2xl bg-forest p-6 text-white sm:p-8"><div><a className="text-sm text-white/75" href="/dashboard">Ratewell / Dashboard</a><h1 className="mt-3 text-3xl font-semibold">Profile and security</h1><p className="mt-2 text-white/75">Update your account details and password.</p></div><UserTopNav /></header>
        {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
        {message && <p role="status" className="mb-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{message}</p>}
        <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
          <h2 className="text-xl font-semibold">Personal details</h2>
          <div className="my-5 flex items-center gap-4">
            {avatar ? <img src={avatar} alt="Your profile" className="h-16 w-16 rounded-full object-cover" /> : <span className="flex h-16 w-16 items-center justify-center rounded-full bg-mint text-xl font-semibold text-forest">{name.slice(0, 1).toUpperCase()}</span>}
            <label className="text-sm font-semibold text-forest">Upload profile photo<input className="mt-2 block max-w-full text-sm text-slate-600" type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadAvatar} disabled={busy} /></label>
          </div>
          <form onSubmit={updateProfile} className="mt-5 space-y-4"><label className="block text-sm font-medium">Name<input className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3" value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} /></label><label className="block text-sm font-medium">Email<input className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3" value={initialProfile.email} disabled /></label><button disabled={busy} className="rounded-xl bg-forest px-5 py-3 font-semibold text-white disabled:opacity-50">Save profile</button></form>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
          <h2 className="text-xl font-semibold">Change password</h2>
          <form onSubmit={updatePassword} className="mt-5 space-y-4"><label className="block text-sm font-medium">Current password<input className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required autoComplete="current-password" /></label><label className="block text-sm font-medium">New password<input className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required minLength={12} maxLength={128} autoComplete="new-password" /></label><p className="text-xs text-slate-500">Changing your password signs out all active sessions.</p><button disabled={busy} className="rounded-xl border border-slate-300 px-5 py-3 font-semibold disabled:opacity-50">Update password</button></form>
        </section>
      </div>
    </main>
  );
}
