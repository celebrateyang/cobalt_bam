type CommerceItem = {
  id: string;
  name: string;
  value: number;
  currency: string;
  provider: string;
  kind: "credit" | "membership";
};

type AnalyticsWindow = Window & {
  gtag?: (...args: unknown[]) => void;
  fbq?: (...args: unknown[]) => void;
  clarity?: (...args: unknown[]) => void;
};

const analyticsWindow = () => window as AnalyticsWindow;

const gaItem = (item: CommerceItem) => ({
  item_id: item.id,
  item_name: item.name,
  item_category: item.kind,
  price: item.value,
  quantity: 1,
});

export const trackCheckoutStarted = (item: CommerceItem) => {
  const target = analyticsWindow();
  target.gtag?.("event", "begin_checkout", {
    currency: item.currency,
    value: item.value,
    payment_type: item.provider,
    items: [gaItem(item)],
  });
  target.fbq?.("track", "InitiateCheckout", {
    content_ids: [item.id],
    content_name: item.name,
    content_type: "product",
    currency: item.currency,
    value: item.value,
  });
  target.clarity?.("set", "checkout_kind", item.kind);
  target.clarity?.("set", "checkout_provider", item.provider);
  target.clarity?.("event", "checkout_started");
};

export const trackPurchaseCompleted = (
  transactionId: string,
  item: CommerceItem,
) => {
  const dedupeKey = `fsv_purchase_tracked:${transactionId}`;
  try {
    if (window.localStorage.getItem(dedupeKey) === "1") return;
  } catch {
    // Tracking still works when storage is unavailable.
  }

  const target = analyticsWindow();
  target.gtag?.("event", "purchase", {
    transaction_id: transactionId,
    currency: item.currency,
    value: item.value,
    payment_type: item.provider,
    items: [gaItem(item)],
  });
  target.fbq?.("track", "Purchase", {
    content_ids: [item.id],
    content_name: item.name,
    content_type: "product",
    currency: item.currency,
    value: item.value,
  });
  target.clarity?.("set", "purchase_kind", item.kind);
  target.clarity?.("set", "purchase_provider", item.provider);
  target.clarity?.("event", "purchase_completed");

  try {
    window.localStorage.setItem(dedupeKey, "1");
  } catch {
    // Ignore storage errors in strict privacy mode.
  }
};
