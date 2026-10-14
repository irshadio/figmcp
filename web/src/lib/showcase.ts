import images from "./showcase-images.json";

export type ShowcaseImage = { src: string; width: number; height: number };
export type ShowcaseScreen = ShowcaseImage & { name: string };

export type ShowcaseProject = {
  slug: keyof typeof images;
  name: string;
  kind: string;
  platform: string;
  summary: string;
  style: string;
  facts: [string, string][];
  prompts: string[];
  accent: string;
  figma: string;
  desktop?: boolean;
};

export const projects: ShowcaseProject[] = [
  {
    slug: "voltline",
    name: "Voltline",
    kind: "Electronics store app",
    platform: "iOS · 390 × 844",
    summary:
      "A full Magento-style shop: sign-in with OTP, a CMS home with banners and category scrollers, layered navigation, a configurable product, cart rules with a coupon, checkout with a map pin, delivery slots and payment, then order tracking.",
    style: "Light and retail: Plus Jakarta Sans, teal for actions, red only for discounts, prices in AED with VAT included.",
    facts: [
      ["Screens", "18 in 4 flows"],
      ["Components", "7 sets with variants"],
      ["Variables", "30 colours, spacing and radii"],
      ["Text styles", "11 · Plus Jakarta Sans"],
    ],
    prompts: [
      "Design a full electronics store app for the UAE, with the screens a Magento store needs: auth, CMS home, cart, checkout, address, map and delivery.",
      "The home page needs more content: category product scrollers, a 2×2 offer grid and single banners.",
      "Make the cart, checkout and order totals agree, with the coupon, express delivery and VAT.",
    ],
    accent: "#12a594",
    figma: "https://www.figma.com/design/uzjFXsA6uxhSuPAqLefn7m/figmacp?node-id=2002-9545",
  },
  {
    slug: "forkful",
    name: "Forkful",
    kind: "Food delivery app",
    platform: "Android · 360 × 800",
    summary:
      "A full ordering flow, from phone sign-in to rating the delivery: restaurant discovery, menus with veg and non-veg marks, item customisation, coupons, payment options and live tracking.",
    style: "Standard production look: Inter, white surfaces, dense lists, thin dividers and small radii.",
    facts: [
      ["Screens", "16 in 4 flows"],
      ["Components", "13, with variants"],
      ["Variables", "26 colours, spacing and radii"],
      ["Text styles", "9 · Inter"],
    ],
    prompts: [
      "Design a food delivery app for Indian users: standard Android look, not a showpiece.",
      "Add item customisation with a required portion, spice level and up to 3 add-ons.",
      "Make the cart total add up: items, coupon, tip, fees and GST.",
    ],
    accent: "#d6336c",
    figma: "https://www.figma.com/design/uzjFXsA6uxhSuPAqLefn7m/figmacp?node-id=2002-3",
  },
  {
    slug: "partner",
    name: "Forkful Partner",
    kind: "Restaurant dashboard",
    platform: "Web · 1440 px",
    summary:
      "The web app restaurant owners use behind Forkful: live orders with accept and reject, an order drawer, menu and stock management, an item editor, reviews, payouts and opening hours.",
    style: "Desktop SaaS: sidebar navigation, data tables, KPI cards, charts, a drawer and a modal.",
    facts: [
      ["Screens", "9 desktop screens"],
      ["Components", "12 sets and 9 icons"],
      ["Variables", "33, with paired status colours"],
      ["Text styles", "11 · Inter"],
    ],
    prompts: [
      "Build the restaurant-owner dashboard for Forkful: overview, orders, menu, reviews, payouts, settings.",
      "Open order #4821 in a side drawer with the bill, prep time and an auto-reject timer.",
      "Edit an item in a modal: photos, sizes and prices, add-ons and availability.",
    ],
    accent: "#d6336c",
    figma: "https://www.figma.com/design/uzjFXsA6uxhSuPAqLefn7m/figmacp?node-id=2002-4",
    desktop: true,
  },
  {
    slug: "tradewell",
    name: "Tradewell",
    kind: "Stock trading app",
    platform: "iOS · 390 × 844 · dark",
    summary:
      "An investing app with KYC onboarding, market explore, stock detail with an intraday chart, a limit-order flow, portfolio with sector allocation, watchlists, orders, mutual fund SIPs and adding money.",
    style: "Dark theme in Manrope. Gains and losses keep their colours everywhere; charts are drawn from price data.",
    facts: [
      ["Screens", "12 in 3 flows"],
      ["Components", "6 sets with variants"],
      ["Variables", "18 colours and tokens"],
      ["Text styles", "10 · Manrope"],
    ],
    prompts: [
      "Design a stock trading app with a dark theme: explore, stock detail, buy flow, portfolio and watchlist.",
      "Draw the intraday chart within the day's low and high, with the previous close marked.",
      "Compute the portfolio totals from the holdings so every screen agrees.",
    ],
    accent: "#5b6cff",
    figma: "https://www.figma.com/design/uzjFXsA6uxhSuPAqLefn7m/figmacp?node-id=2002-5",
  },
  {
    slug: "haven",
    name: "Haven",
    kind: "Coffee ordering app",
    platform: "iOS · 390 × 844",
    summary:
      "A small ordering flow for a café: welcome, home with a promo and product grid, product detail with size and milk options, cart and order status.",
    style: "Warm and editorial: Fraunces headings, DM Sans for UI, cream surfaces and photography.",
    facts: [
      ["Screens", "5 and a cover"],
      ["Components", "6"],
      ["Variables", "21 colours, spacing and radii"],
      ["Text styles", "7 · Fraunces and DM Sans"],
    ],
    prompts: [
      "Design a welcome screen for Haven: full-bleed café photo, a dark fade, a serif headline and two buttons.",
      "Build the home screen from the design system: greeting, search, a promo banner and product cards.",
      "Show the order being brewed: a progress ring, a step timeline and the pick-up code.",
    ],
    accent: "#c8793a",
    figma: "https://www.figma.com/design/uzjFXsA6uxhSuPAqLefn7m/figmacp?node-id=2002-2",
  },
];

export function screensOf(slug: ShowcaseProject["slug"]): ShowcaseScreen[] {
  return images[slug].screens;
}

export function systemOf(slug: ShowcaseProject["slug"]): ShowcaseImage {
  return images[slug].system;
}

export function coverOf(slug: ShowcaseProject["slug"]): ShowcaseImage | null {
  const entry = images[slug] as { cover?: ShowcaseImage };
  return entry.cover ?? null;
}

export const totalScreens = projects.reduce((n, p) => n + images[p.slug].screens.length, 0);
