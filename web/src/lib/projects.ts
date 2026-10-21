import tekvo from "./tekvo.json";

export type ProjectImage = { src: string; width: number; height: number };
export type NamedImage = ProjectImage & { name: string };
export type FlowScreen = { code: string; name: string; light?: ProjectImage; dark?: ProjectImage };
export type Flow = { key: string; name: string; screens: FlowScreen[] };
export type ProductKey = "customer" | "rider" | "admin" | "hub";

export type Product = {
  key: ProductKey;
  name: string;
  platform: string;
  summary: string;
  device: "mobile" | "desktop";
  flows: Flow[];
};

const products: Record<ProductKey, Omit<Product, "key" | "flows">> = {
  customer: {
    name: "Customer app",
    platform: "iOS and Android · 393 × 852",
    summary:
      "From the splash to a delivered order: sign in with a mobile number, browse and search, product pages with specs, reviews and Q&A, cart, checkout with a map pin, delivery or click and collect, payment, tracking, cancellations, returns, account, rewards and Tekvo Plus.",
    device: "mobile",
  },
  rider: {
    name: "Rider app",
    platform: "iOS and Android · 393 × 852",
    summary:
      "The staff app the dispatch team assigns Express and Normal runs to: start a shift, navigate to pickups, scan parcels, hand over with a delivery code, photo proof or cash, handle failed drops, install large items, and close the run at the hub.",
    device: "mobile",
  },
  admin: {
    name: "Admin dashboard",
    platform: "Web · 1440 and 1920",
    summary:
      "Head-office operations: live orders and assignment, routing rules, riders and hubs, catalog, inventory and purchase orders, customers, promotions and content, returns, refunds, cash reconciliation, VAT invoices, reports and settings.",
    device: "desktop",
  },
  hub: {
    name: "Hub and store",
    platform: "Web · 1440 and 1920 · iPad tablet",
    summary:
      "The dashboard each hub and store shares: accept routed orders, run an orders board, assign their own drivers and vehicles, track parcel custody and driver cash through to remittance, manage stock, transfers and returns, plus the picking and packing tablet.",
    device: "desktop",
  },
};

export const tekvoProject = {
  slug: "tekvo",
  name: "Tekvo",
  kind: "Electronics e-commerce platform",
  summary:
    "A complete product, not a set of hero shots: the customer app, the rider app, the head-office admin and the hub and store dashboard, designed end to end from one design system. Every flow has its happy path, edge cases, empty and error states, in light and dark.",
  accent: "#1f6feb",
  figma: "https://www.figma.com/design/YLHqrIhMPhlsa5Xg1fvB0U/figmcp-tekvo?node-id=92-1225",
  prototype: "https://www.figma.com/proto/YLHqrIhMPhlsa5Xg1fvB0U/figmcp-tekvo?node-id=92-7048",
  embed:
    "https://embed.figma.com/proto/YLHqrIhMPhlsa5Xg1fvB0U/figmcp-tekvo?node-id=92-7048&starting-point-node-id=92-7048&scaling=scale-down-width&content-scaling=fixed&hide-ui=1&footer=false&viewport-controls=false&bg-color=000000&embed-host=figmcp",
  products: tekvo.products.map((p) => ({ ...products[p.key as ProductKey], key: p.key as ProductKey, flows: p.flows })) as Product[],
  blueprint: tekvo.blueprint as NamedImage,
  covers: tekvo.covers as NamedImage[],
  system: tekvo.system as { name: string; images: NamedImage[] }[],
  store: tekvo.store as NamedImage[],
};

export const projectLinks = [{ href: "/projects/tekvo", name: "Tekvo", kind: "E-commerce platform · 4 products" }];

export type JourneyActor = "customer" | "office" | "hub" | "rider";
export type JourneyStep = { actor: JourneyActor; title: string; text: string; phones?: string[]; screen?: string };

export const journeyActors: Record<JourneyActor, { label: string; color: string }> = {
  customer: { label: "Customer app", color: "#3b82f6" },
  office: { label: "Head office", color: "#a78bfa" },
  hub: { label: "Hub and store", color: "#f59e0b" },
  rider: { label: "Rider app", color: "#a3e635" },
};

const story = (name: string) => `/showcase/tekvo/story/${name}.jpg`;

export const tekvoHero = {
  dashboard: story("d01-live-operations-dark"),
  phones: [story("09-home-light"), story("14-product-details-dark"), story("r07-navigation-to-p1-light")],
  poster: story("09-home-dark"),
};

export const tekvoJourney: JourneyStep[] = [
  {
    actor: "customer",
    title: "Checkout and pay",
    text: "Items split into shipments by delivery date. The customer pays by Apple Pay, a saved card or cash on delivery, and gets an order number, the delivery window and the reward points.",
    phones: [story("19-payment-and-review-light"), story("20-order-placed-light")],
  },
  {
    actor: "office",
    title: "Route to the best location",
    text: "Paid orders are offered to a hub or store ranked by stock, distance, capacity and the Express cut-off. An offer that isn’t accepted in 3 minutes re-routes to the next one.",
    screen: story("d46-routing-light"),
  },
  {
    actor: "hub",
    title: "Accept the offer",
    text: "The hub has a countdown to accept or reject. Accepting reserves the stock and starts the pick timer; large items also book a truck slot and installers.",
    screen: story("s01-incoming-orders-light"),
  },
  {
    actor: "hub",
    title: "Pick and pack on the tablet",
    text: "Every item is scanned with its serial, the box and tamper tape are checked, the weight is matched, and the label carries the COD amount and the delivery-code barcode.",
    screen: story("h03-hub-tablet-packing-light"),
  },
  {
    actor: "hub",
    title: "Assign one of their own drivers",
    text: "Drivers are ranked by vehicle, distance and cash in hand. Custody only moves to the rider when they scan the parcel at the bay.",
    screen: story("s04-assign-driver-light"),
  },
  {
    actor: "rider",
    title: "Run assigned, parcels scanned",
    text: "An Express run arrives with its SLA clock, pickups and drops in route order. The rider scans each parcel at pickup before the run can start.",
    phones: [story("r03-run-assigned-express-light"), story("r09-scan-parcels-light")],
  },
  {
    actor: "customer",
    title: "Track it, hand it over with a code",
    text: "The customer follows the rider live. At the door the parcel is only handed over once the 4-digit delivery code from the app or SMS is verified.",
    phones: [story("22-track-order-light"), story("r12-delivery-code-light")],
  },
  {
    actor: "rider",
    title: "Collect payment and prove delivery",
    text: "For cash on delivery the app works out the change and logs the cash the rider holds. The customer gets a receipt and photo proof of delivery.",
    phones: [story("r14-collect-payment-light"), story("45-delivered-proof-light")],
  },
  {
    actor: "hub",
    title: "Count the cash at hand-over",
    text: "Each driver’s cash is counted against their receipts, differences need a signed note, and drivers over the limit get no new COD orders.",
    screen: story("s08-driver-cash-light"),
  },
  {
    actor: "hub",
    title: "Remit to head office",
    text: "The hub deposits the day’s cash with a stamped slip, and head office matches the deposit to every driver receipt.",
    screen: story("s09-remittance-light"),
  },
];
