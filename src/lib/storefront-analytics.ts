export type StorefrontEvent =
  "page_view" | "view_item" | "add_to_cart" | "begin_checkout" | "purchase" | "search";

type AnalyticsConfig = {
  brandId: string;
  gaId: string | null;
  metaId: string | null;
  analyticsAllowed: boolean;
  marketingAllowed: boolean;
};

let config: AnalyticsConfig | null = null;

export function setStorefrontAnalyticsConfig(next: AnalyticsConfig | null) {
  config = next;
}

export function trackStorefrontEvent(
  event: StorefrontEvent,
  payload: Record<string, unknown> = {},
  dedupeKey?: string,
) {
  if (!config || typeof window === "undefined") return;
  if (dedupeKey) {
    const key = `boutq-event:${config.brandId}:${event}:${dedupeKey}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  }
  const w = window as any;
  if (config.analyticsAllowed && config.gaId && typeof w.gtag === "function") {
    w.gtag("event", event, { ...payload, send_to: config.gaId });
  }
  if (config.marketingAllowed && config.metaId && typeof w.fbq === "function") {
    const names: Record<StorefrontEvent, string> = {
      page_view: "PageView",
      view_item: "ViewContent",
      add_to_cart: "AddToCart",
      begin_checkout: "InitiateCheckout",
      purchase: "Purchase",
      search: "Search",
    };
    w.fbq("trackSingle", config.metaId, names[event], payload);
  }
}
