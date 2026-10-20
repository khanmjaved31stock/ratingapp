"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import BannerSlot from "@/components/BannerSlot";
import MarqueeNews from "@/components/MarqueeNews";

const links = [
  ["Dashboard", "/dashboard"],
  ["Packages", "/dashboard/wallet#packages"],
  ["Daily Tasks", "/dashboard#review-task"],
  ["Wallet", "/dashboard/wallet"],
  ["Deposits", "/dashboard/wallet#deposits"],
  ["Withdrawals", "/dashboard/wallet#withdrawals"],
  ["Referrals", "/dashboard/referrals"],
  ["Notifications", "/dashboard/notifications"],
  ["Profile", "/dashboard/profile"],
  ["Settings", "/dashboard/settings"],
  ["Support", "/dashboard/support"],
  ["Guidelines / Help Center", "/help"],
];

function subscribeTheme(callback) {
  window.addEventListener("ratewell-theme-change", callback);
  return () => window.removeEventListener("ratewell-theme-change", callback);
}

function getThemeSnapshot() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function getServerThemeSnapshot() {
  return "light";
}

export default function UserTopNav() {
  const theme = useSyncExternalStore(subscribeTheme, getThemeSnapshot, getServerThemeSnapshot);
  const [open, setOpen] = useState(false);
  const [logoUrl, setLogoUrl] = useState("");
  const [navError, setNavError] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [termsRequired, setTermsRequired] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const stored = window.localStorage.getItem("ratewell-theme");
    const savedTheme = stored === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = savedTheme;
    window.dispatchEvent(new CustomEvent("ratewell-theme-change"));

    fetch("/api/settings", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return; // Gracefully ignore 401 or backend errors without throwing
        const result = await response.json();
        const preference = result.preferences?.theme;
        if (!cancelled && (preference === "light" || preference === "dark")) {
          document.documentElement.dataset.theme = preference;
          window.localStorage.setItem("ratewell-theme", preference);
          window.dispatchEvent(new CustomEvent("ratewell-theme-change"));
        }
      })
      .catch((error) => console.error("Loading theme preference failed:", error));

    fetch("/api/branding", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return; // Gracefully handle unauthenticated/error responses
        const result = await response.json();
        if (!cancelled) setLogoUrl(result.userLogoUrl || "");
      })
      .catch((error) => console.error("Loading portal logo failed:", error));

    fetch("/api/terms", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        const result = await response.json();
        if (!cancelled) setTermsRequired(Boolean(result.needsAcceptance));
      })
      .catch((error) => console.error("Loading terms acceptance status failed:", error));

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadNotifications() {
      try {
        const response = await fetch("/api/notifications", { cache: "no-store" });
        
        // Handle unauthenticated or unauthorized gracefully without throwing red screen error
        if (response.status === 401 || response.status === 403) {
          if (!cancelled) {
            setNotifications([]);
            setUnreadCount(0);
          }
          return;
        }

        if (!response.ok) {
          return;
        }

        const result = await response.json();
        if (!cancelled) {
          setNotifications(result.notifications || []);
          setUnreadCount(result.unreadCount || 0);
        }
      } catch (error) {
        if (!cancelled) console.error("Loading user notifications failed:", error);
      }
    }

    loadNotifications();
    const timer = window.setInterval(loadNotifications, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("ratewell-theme", theme);
  }, [theme]);

  async function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem("ratewell-theme", nextTheme);
    window.dispatchEvent(new CustomEvent("ratewell-theme-change", { detail: nextTheme }));
    setNavError("");

    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: nextTheme }),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "Could not save theme preference.");
      }
    } catch (error) {
      console.error("Saving theme preference failed:", error);
      setNavError(error.message || "Could not save your appearance setting.");
    }
  }

  async function signOut() {
    setNavError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Sign out failed. Please try again.");
      window.location.assign("/");
    } catch (error) {
      console.error("Signing out failed:", error);
      setNavError(error.message || "Sign out failed. Please try again.");
    }
  }

  async function markNotificationRead(id) {
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not update this notification.");
      setNotifications((current) => current.map((item) => item.id === id ? { ...item, read: true } : item));
      setUnreadCount((current) => Math.max(0, current - (notifications.find((item) => item.id === id && !item.read) ? 1 : 0)));
    } catch (error) {
      setNavError(error.message || "Could not update this notification.");
    }
  }

  return (
    <>
    <nav className="relative z-10 flex flex-wrap items-center justify-end gap-2" aria-label="User navigation">
      {termsRequired && <a href="/terms" className="basis-full rounded-lg bg-amber-100 px-3 py-2 text-right text-xs font-semibold text-amber-950 underline">Review and accept the updated Terms &amp; Conditions before protected actions.</a>}
      {navError && <span role="alert" className="basis-full text-right text-xs text-white">{navError}</span>}
      {logoUrl && <a href="/dashboard" className="mr-auto hidden sm:block" aria-label="Ratewell dashboard"><img src={logoUrl} alt="Ratewell" className="max-h-10 max-w-32 object-contain" /></a>}
      <button
        type="button"
        onClick={toggleTheme}
        className="rounded-lg border border-white/25 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10"
        aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      >
        {theme === "dark" ? "☀ Light" : "☾ Dark"}
      </button>
      <div className="relative">
        <button
          type="button"
          onClick={() => setNotificationsOpen((value) => !value)}
          aria-expanded={notificationsOpen}
          aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
          className="relative rounded-lg border border-white/25 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10"
        >
          Notifications
          {unreadCount > 0 && <span className="ml-2 rounded-full bg-amber-300 px-1.5 py-0.5 text-[10px] text-slate-900">{unreadCount}</span>}
        </button>
        {notificationsOpen && <section className="absolute right-0 top-full z-30 mt-2 w-[min(22rem,90vw)] rounded-xl border border-slate-200 bg-white p-3 text-slate-800 shadow-2xl">
          <div className="flex items-center justify-between gap-3 border-b pb-2"><h2 className="text-sm font-semibold">Notifications</h2><span className="text-xs text-slate-500">{unreadCount} unread</span></div>
          {notifications.length ? <ul className="max-h-80 divide-y overflow-y-auto">{notifications.map((item) => <li key={item.id} className={`py-3 ${item.read ? "opacity-65" : ""}`}><button type="button" onClick={() => markNotificationRead(item.id)} className="w-full text-left"><span className="block text-sm font-semibold">{item.title}</span><span className="mt-1 block text-xs leading-5 text-slate-600">{item.message}</span><time className="mt-1 block text-[11px] text-slate-400">{new Date(item.createdAt).toLocaleString()}</time></button></li>)}</ul> : <p className="py-5 text-center text-sm text-slate-500">You’re all caught up.</p>}
          <a href="/dashboard/notifications" onClick={() => setNotificationsOpen(false)} className="mt-2 block rounded-lg bg-slate-50 px-3 py-2 text-center text-xs font-semibold text-forest hover:bg-slate-100">Open notification inbox</a>
        </section>}
      </div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="user-navigation-menu"
        className="rounded-lg border border-white/25 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10"
      >
        Menu
      </button>
      <div id="user-navigation-menu" className={`${open ? "flex" : "hidden"} absolute right-0 top-full mt-2 max-h-[min(70vh,32rem)] w-[min(22rem,90vw)] flex-col overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 text-slate-800 shadow-xl`}>
        {links.map(([label, href]) => (
          <a key={href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-slate-100" href={href}>
            {label}
          </a>
        ))}
        <button type="button" onClick={signOut} className="rounded-lg px-3 py-2 text-left text-sm font-semibold text-red-700 hover:bg-red-50">
          Logout
        </button>
      </div>
    </nav>
    <MarqueeNews />
    <BannerSlot slot="popup" />
    </>
  );
}