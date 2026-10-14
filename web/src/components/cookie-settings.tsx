"use client";

import { openConsent } from "./analytics";

export function CookieSettings({ className = "" }: { className?: string }) {
  return (
    <button type="button" onClick={openConsent} className={className}>
      Cookie settings
    </button>
  );
}
