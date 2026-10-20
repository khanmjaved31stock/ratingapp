"use client";

import { useEffect, useState } from "react";

export default function PortalLogo() {
  const [logo, setLogo] = useState("");
  useEffect(() => {
    fetch("/api/branding", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load the portal logo.");
        setLogo(result.userLogoUrl || "");
      })
      .catch((error) => console.error("Loading public portal logo failed:", error));
  }, []);
  return logo
    ? <img src={logo} alt="Ratewell" className="max-h-12 max-w-48 object-contain" />
    : <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-forest text-lg font-bold text-white">R</span>;
}
