export const GA_ID = "G-55VJGDZ94M";

type Params = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export function track(event: string, params: Params = {}) {
  try {
    window.gtag?.("event", event, params);
  } catch {}
}
