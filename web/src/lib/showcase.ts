import images from "./showcase-images.json";
import type { ShowcaseKind } from "@/components/showcase-filter";

export type ShowcaseImage = { src: string; width: number; height: number };
export type ShowcaseScreen = ShowcaseImage & { name: string };

export type ShowcaseProject = {
  slug: keyof typeof images;
  name: string;
  kind: string;
  type: ShowcaseKind;
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
    type: "mobile",
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
    slug: "kindred",
    type: "mobile",
    name: "Kindred",
    kind: "Dating app",
    platform: "iOS · 390 × 844",
    summary:
      "A dating app for Kerala and beyond: phone sign-in, onboarding with intentions, languages, photos and interests, the swipe deck, full profiles with prompts, filters, the match moment, likes, chat, video calls, selfie verification, reporting and a paid plan.",
    style: "Warm and modern: cream surfaces, a coral accent, Instrument Serif headlines over Figtree, and photos first.",
    facts: [
      ["Screens", "19 in 4 flows"],
      ["Components", "7, with variants"],
      ["Variables", "31 colours, spacing and radii"],
      ["Text styles", "11 · Instrument Serif and Figtree"],
    ],
    prompts: [
      "Design a dating app like the popular ones, without copying their look: onboarding, swipe deck, matches, chat and safety.",
      "Make it local to Kerala: Malayalam and English, language filters and places people know.",
      "Price a Gold plan for 1, 3 and 6 months and show the real savings.",
    ],
    accent: "#e4573d",
    figma: "https://www.figma.com/design/uzjFXsA6uxhSuPAqLefn7m/figmacp?node-id=2004-5741",
  },
  {
    slug: "tripora",
    type: "mobile",
    name: "Tripora",
    kind: "Travel booking app",
    platform: "iOS · 390 × 844 · English and Arabic",
    summary:
      "Flights and hotels for a Kochi to Dubai trip: airport search, a fare calendar, results with fare families, a seat map, travellers and add-ons, payment, the e-ticket, Dubai hotels on a list and a map, rooms, checkout, my trips, a boarding pass and price alerts, plus Arabic right-to-left screens.",
    style: "Bright and practical: electric indigo, sunshine yellow for deals, Rubik for both English and Arabic. Every total adds up from fare to coins.",
    facts: [
      ["Screens", "19 in 4 flows"],
      ["Components", "7 sets and 4 airline logos"],
      ["Variables", "32 colours, spacing and radii"],
      ["Text styles", "12 · Rubik"],
    ],
    prompts: [
      "Design a travel booking app like the big Indian ones, without copying their look: flights, hotels and trips.",
      "Add a seat map and a fare summary where seats, meals, insurance and the coupon add up.",
      "Make Arabic versions of the home and results screens, mirrored right to left with prices in dirhams.",
    ],
    accent: "#3d3bd9",
    figma: "https://www.figma.com/design/uzjFXsA6uxhSuPAqLefn7m/figmacp?node-id=2013-287",
  },
  {
    slug: "paylark",
    type: "web",
    name: "Paylark",
    kind: "Marketing website",
    platform: "Web · 1440 and 390",
    summary:
      "A responsive marketing site for an invoicing and payments product for small businesses in India: a long home page with a product shot, features, stories, pricing and FAQ, a pricing page with a yearly toggle and plan comparison, and sign-up, each rebuilt for phones.",
    style: "Calm and confident: forest green, a lime accent and warm off-white, Bricolage Grotesque headlines over Geist.",
    facts: [
      ["Pages", "3 desktop, 4 mobile"],
      ["Components", "6, including the product shot"],
      ["Variables", "32 colours, spacing and radii"],
      ["Text styles", "15 · Bricolage Grotesque and Geist"],
    ],
    prompts: [
      "Design a marketing website for an invoicing product for Indian small businesses: home, pricing and sign-up.",
      "Show the product in the hero with a real dashboard, not a stock photo.",
      "Make mobile versions of each page and an open menu.",
    ],
    accent: "#c6f432",
    figma: "https://www.figma.com/design/uzjFXsA6uxhSuPAqLefn7m/figmacp?node-id=2014-4728",
  },
  {
    slug: "plotline",
    type: "web",
    name: "Plotline",
    kind: "Project management app",
    platform: "Web · 1440 · light and dark",
    summary:
      "A project tool for a product team mid-cycle: my work, a board with a card being dragged, a grouped list with bulk actions, a timeline with dependencies and milestones, a calendar, a full issue page, an inbox, a command palette, a cycle report and member settings, plus the board in dark mode.",
    style: "Quiet and dense: neutral surfaces, one orange accent, colour kept for status, priority and labels. Inter with Geist Mono for issue IDs. Every count agrees from board to report.",
    facts: [
      ["Screens", "11 desktop screens"],
      ["Components", "7, with variants"],
      ["Variables", "35 colours in light and dark sets"],
      ["Text styles", "14 · Inter and Geist Mono"],
    ],
    prompts: [
      "Design a project management web app like Linear or Asana, with a detailed board, list, timeline and issue page.",
      "Show a card mid-drag on the board, with a drop target in the next column.",
      "Make a dark version of the board from a second set of tokens with the same names.",
    ],
    accent: "#f2621f",
    figma: "https://www.figma.com/design/uzjFXsA6uxhSuPAqLefn7m/figmacp?node-id=2015-8845",
    desktop: true,
  },
  {
    slug: "mendly",
    type: "mobile",
    name: "Mendly",
    kind: "Healthcare app",
    platform: "iOS · 390 × 844",
    summary:
      "A family healthcare app from symptom to recovery: symptom search, doctors with ratings and fees, booking a video consult and paying, the call, a digital prescription, medicine delivery from it, a home lab pickup, reports against normal ranges, dose reminders, visits and a parent’s health profile.",
    style: "Calm and trustworthy: clear blue, mint for good news, amber for things due, coral only for alerts. Nunito, large numbers and doses written the way doctors write them.",
    facts: [
      ["Screens", "16 in 4 flows"],
      ["Components", "7, with variants"],
      ["Variables", "32 colours, spacing and radii"],
      ["Text styles", "11 · Nunito"],
    ],
    prompts: [
      "Design a healthcare app like Practo or 1mg: find a doctor, video consult, prescription, medicines, lab tests and records.",
      "Order exactly the medicines the prescription needs: 1 – 1 – 1 for 3 days is 9 tablets.",
      "Show lab values against their normal ranges with a plain explanation.",
    ],
    accent: "#1d6fe0",
    figma: "https://www.figma.com/design/uzjFXsA6uxhSuPAqLefn7m/figmacp?node-id=2016-16771",
  },
  {
    slug: "deck",
    type: "deck",
    name: "plugd Series A",
    kind: "Pitch deck",
    platform: "Deck · 12 slides at 1920 × 1080",
    summary:
      "A Series A pitch for plugd: problem, solution, product, how dark stores deliver in 2 hours, market sizing, traction, unit economics per order, business model, competition, team and a ₹120 Cr ask with use of funds.",
    style: "Built on the plugd brand: charge yellow, black and ion blue, Unbounded headlines. Charts are drawn from the numbers, and every figure agrees from slide to slide.",
    facts: [
      ["Slides", "12 at 1920 × 1080"],
      ["Charts", "GMV bars, unit waterfall, market circles, funds donut"],
      ["Numbers", "GMV ₹6.1 → ₹21.4 Cr, ₹412 contribution per order"],
      ["Brand", "plugd · Unbounded and Space Grotesk"],
    ],
    prompts: [
      "Make a Series A pitch deck for plugd using its brand.",
      "Show monthly GMV as a bar chart and per-order unit economics as a waterfall.",
      "Check that every number adds up across the slides.",
    ],
    accent: "#ffd60a",
    figma: "https://www.figma.com/design/uzjFXsA6uxhSuPAqLefn7m/figmacp?node-id=2019-48131",
  },
  {
    slug: "plugd",
    type: "brand",
    name: "plugd",
    kind: "Brand identity",
    platform: "Brand kit · 14 boards at 1920 × 1080",
    summary:
      "A bold identity for an online electronics store with 2-hour delivery: a smiling socket-face logo with six moods for app states, charge yellow on black, a charge-bar motif, then packaging, the app, the website, a sale campaign, delivery livery and merch.",
    style: "Charge yellow, off-black, ion blue and a pulse pink for sales. Unbounded for headlines, Space Grotesk for text and Geist Mono for specs. Packaging uses real box photos with the brand tape applied.",
    facts: [
      ["Boards", "14 brand book boards"],
      ["Logo", "5 lock-ups in 5 colourways"],
      ["Colour", "16 colours with HEX, RGB and CMYK"],
      ["Type", "9 styles · Unbounded, Space Grotesk, Geist Mono"],
    ],
    prompts: [
      "Create a brand for an electronics e-commerce store. Make it bold and make it look great.",
      "Give the logo moods the app can use for loading, offline, order placed and sale.",
      "Use a real cardboard box photo with our branded tape instead of drawn boxes.",
    ],
    accent: "#ffd60a",
    figma: "https://www.figma.com/design/uzjFXsA6uxhSuPAqLefn7m/figmacp?node-id=2019-23508",
  },
  {
    slug: "kora",
    type: "brand",
    name: "Kora",
    kind: "Brand identity",
    platform: "Brand kit · 14 boards at 1920 × 1080",
    summary:
      "A full identity for a specialty coffee roaster from Coorg: story and voice, a K-and-bean monogram with lock-ups and usage rules, colour with print values and contrast checks, type, a pattern and icons, then packaging, stationery, the café, social media, digital and merchandise.",
    style: "Forest green, parchment and coffee-cherry red. Young Serif for headlines over Outfit; packaging and mock-ups are drawn in Figma with shading, not stock mock-ups.",
    facts: [
      ["Boards", "14 brand guideline boards"],
      ["Logo", "5 lock-ups in 4 colourways"],
      ["Colour", "16 colours with HEX, RGB and CMYK"],
      ["Type", "9 styles · Young Serif and Outfit"],
    ],
    prompts: [
      "Create a brand identity kit for a specialty coffee roaster: logo, colour, type and guidelines.",
      "Show the brand on a coffee bag, business cards, the café, Instagram and merchandise.",
      "Make the packaging look real: heat seal, valve, shading and shadows.",
    ],
    accent: "#b8432f",
    figma: "https://www.figma.com/design/uzjFXsA6uxhSuPAqLefn7m/figmacp?node-id=2017-19128",
  },
  {
    slug: "forkful",
    type: "mobile",
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
    type: "web",
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
    type: "mobile",
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
    type: "mobile",
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
