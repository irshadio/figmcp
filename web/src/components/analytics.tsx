"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import { GA_ID, track } from "@/lib/analytics";

const CONSENT_KEY = "figmcp-consent";
const OPEN_EVENT = "figmcp-consent-open";

const CONSENT_REGIONS = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IS", "IE", "IT", "LV", "LI", "LT",
  "LU", "MT", "NL", "NO", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "CH", "GB",
];

const init = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;
gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',region:${JSON.stringify(CONSENT_REGIONS)},wait_for_update:500});
gtag('consent','default',{analytics_storage:'granted',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
try{var c=localStorage.getItem('${CONSENT_KEY}');if(c)gtag('consent','update',{analytics_storage:c==='granted'?'granted':'denied'});}catch(e){}
gtag('js',new Date());gtag('config','${GA_ID}');`;

export function openConsent() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

function savedChoice() {
  try {
    return localStorage.getItem(CONSENT_KEY);
  } catch {
    return "unknown";
  }
}

function ConsentBanner() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const european = Intl.DateTimeFormat().resolvedOptions().timeZone.startsWith("Europe/");
    const id = setTimeout(() => setOpen(european && !savedChoice()), 800);
    const reopen = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, reopen);
    return () => {
      clearTimeout(id);
      window.removeEventListener(OPEN_EVENT, reopen);
    };
  }, []);

  const choose = (value: "granted" | "denied") => {
    try {
      localStorage.setItem(CONSENT_KEY, value);
    } catch {}
    window.gtag?.("consent", "update", { analytics_storage: value });
    setOpen(false);
  };

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed inset-x-4 bottom-4 z-[90] mx-auto max-w-xl animate-[fadeUp_.3s_ease-out_both] rounded-2xl border border-line-2 bg-[#0a0e17]/95 p-5 shadow-[0_20px_60px_-10px_#000] backdrop-blur-xl sm:inset-x-6"
    >
      <p className="text-sm leading-relaxed text-muted">
        We use Google Analytics cookies to count visits and see which docs help. No ads, and nothing is sold.{" "}
        <a href="/privacy" className="text-sky underline decoration-sky/40 underline-offset-2">
          Privacy
        </a>
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => choose("denied")}
          className="rounded-lg border border-line-2 px-4 py-2 text-sm text-fg transition hover:bg-white/[0.05]"
        >
          Decline
        </button>
        <button
          type="button"
          onClick={() => choose("granted")}
          className="rounded-lg bg-fg px-4 py-2 text-sm font-medium text-bg transition hover:bg-white"
        >
          Accept
        </button>
      </div>
    </div>
  );
}

export function Analytics() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-track]");
      if (el) track(el.dataset.track!, { label: el.dataset.trackLabel, location: el.dataset.trackLocation });
    };
    const onToggle = (e: Event) => {
      const d = e.target as HTMLDetailsElement;
      if (d.tagName === "DETAILS" && d.open && d.dataset.faq) track("faq_open", { question: d.dataset.faq });
    };
    document.addEventListener("click", onClick, { capture: true });
    document.addEventListener("toggle", onToggle, { capture: true });
    return () => {
      document.removeEventListener("click", onClick, { capture: true });
      document.removeEventListener("toggle", onToggle, { capture: true });
    };
  }, []);

  return (
    <>
      {process.env.NODE_ENV === "production" && (
        <>
          <Script id="ga-init" strategy="afterInteractive">
            {init}
          </Script>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
        </>
      )}
      <ConsentBanner />
    </>
  );
}
