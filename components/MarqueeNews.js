"use client";

import { useEffect, useState } from "react";

export default function MarqueeNews() {
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/news", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load announcement.");
        if (!cancelled) setMessage(result.message || "");
      })
      .catch((error) => console.error("Loading portal announcement failed:", error));
    return () => { cancelled = true; };
  }, []);

  if (!message) return null;
  return (
    <div className="w-full basis-full overflow-hidden border-y border-emerald-200 bg-emerald-50 py-2 text-sm font-medium text-emerald-950" role="status">
      <p className="animate-ratewell-marquee w-max whitespace-nowrap px-4">{message}</p>
    </div>
  );
}
