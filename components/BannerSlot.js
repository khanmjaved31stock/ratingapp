"use client";

import { useEffect, useState } from "react";

export default function BannerSlot({ slot, className = "" }) {
  const [banners, setBanners] = useState([]);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/banners?slot=${encodeURIComponent(slot)}`, { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load banners.");
        if (!cancelled) {
          const items = result.banners || [];
          let dismissedIds = [];
          if (slot === "popup") {
            try {
              dismissedIds = JSON.parse(window.sessionStorage.getItem("ratewell-dismissed-popups") || "[]");
              if (!Array.isArray(dismissedIds)) dismissedIds = [];
            } catch {
              dismissedIds = [];
            }
          }
          setBanners(items.filter((item) => !dismissedIds.includes(item.id)));
        }
      })
      .catch((error) => console.error("Banner loading failed:", error))
    return () => { cancelled = true; };
  }, [slot]);
  if (!banners.length) return null;
  const closePopup = () => {
    const previous = (() => {
      try {
        const parsed = JSON.parse(window.sessionStorage.getItem("ratewell-dismissed-popups") || "[]");
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    })();
    window.sessionStorage.setItem("ratewell-dismissed-popups", JSON.stringify([...new Set([...previous, ...banners.map((item) => item.id)])]));
    setDismissed(true);
  };
  if (slot === "popup") {
    const banner = banners[0];
    if (!banner || dismissed) return null;
    const content = <img className="max-h-[65vh] w-full rounded-xl object-contain" src={banner.imageUrl} alt={banner.title} />;
    const track = () => fetch("/api/banners", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: banner.id }),
    }).then(async (response) => {
      if (!response.ok) throw new Error("Banner click tracking failed.");
    }).catch((error) => console.error("Banner click tracking failed:", error));
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4" role="dialog" aria-modal="true" aria-label={banner.title}>
        <div className="relative w-full max-w-2xl rounded-2xl bg-white p-4 shadow-2xl">
          <button type="button" onClick={closePopup} className="absolute right-2 top-2 z-10 rounded-full bg-white px-3 py-1.5 text-sm font-bold shadow" aria-label="Close advertisement">Close</button>
          {banner.href ? <a href={banner.href} onClick={track}>{content}</a> : content}
          <p className="mt-2 text-sm text-slate-600">{banner.title}</p>
        </div>
      </div>
    );
  }
  return (
    <aside className={`grid gap-3 sm:grid-cols-2 ${className}`} aria-label="Sponsored content">
      {banners.map((banner) => {
        const content = <><img className="max-h-56 w-full rounded-xl object-cover" src={banner.imageUrl} alt={banner.title} /><span className="sr-only">{banner.title}</span></>;
        const track = () => {
          fetch("/api/banners", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: banner.id }) })
            .then(async (response) => {
              if (!response.ok) throw new Error("Banner click tracking failed.");
            })
            .catch((error) => console.error("Banner click tracking failed:", error));
        };
        return banner.href ? <a key={banner.id} href={banner.href} onClick={track} aria-label={banner.title}>{content}</a> : <div key={banner.id}>{content}</div>;
      })}
    </aside>
  );
}
