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

export const trackPaymentLinkOpened = (kind: "credit" | "membership") => {
  const target = analyticsWindow();
  target.gtag?.("event", "payment_link_opened", {
    payment_type: "wechat",
    checkout_kind: kind,
  });
  target.clarity?.("set", "payment_link_kind", kind);
  target.clarity?.("event", "payment_link_opened");
};

export const trackTopupPrompt = (
  action: "view" | "topup" | "membership" | "referral" | "dismiss",
  source: "points_insufficient" | "low_points_balloon",
  currentPoints: number,
  requiredPoints?: number,
) => {
  const target = analyticsWindow();
  target.gtag?.("event", "topup_prompt", {
    action,
    source,
    current_points: currentPoints,
    ...(requiredPoints === undefined
      ? {}
      : { required_points: requiredPoints }),
  });
  target.clarity?.("set", "topup_prompt_source", source);
  target.clarity?.("set", "topup_prompt_action", action);
  target.clarity?.("event", "topup_prompt");
};

export const trackCreditProductListViewed = (
  provider: string,
  products: Array<{
    key: string;
    points: number;
    amountFen: number;
    currency: string;
  }>,
) => {
  if (!products.length) return;
  const dedupeKey = `fsv_credit_products_viewed:${provider}`;
  try {
    if (window.sessionStorage.getItem(dedupeKey) === "1") return;
    window.sessionStorage.setItem(dedupeKey, "1");
  } catch {
    // Tracking remains best-effort when storage is unavailable.
  }

  const target = analyticsWindow();
  target.gtag?.("event", "view_item_list", {
    item_list_id: `credit_products_${provider}`,
    item_list_name: `${provider} credit products`,
    currency: products[0].currency,
    items: products.map((product, index) => ({
      item_id: product.key,
      item_name: `${product.points} credits`,
      item_category: "credit",
      price: product.amountFen / 100,
      index,
      quantity: 1,
    })),
  });
  target.clarity?.("set", "credit_products_provider", provider);
  target.clarity?.("event", "credit_products_viewed");
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

export const trackReferralShared = (
  source: "account" | "payment_success",
) => {
  const target = analyticsWindow();
  target.gtag?.("event", "share", {
    method: "copy_link",
    content_type: "referral_invite",
    item_id: source,
  });
  target.clarity?.("set", "referral_share_source", source);
  target.clarity?.("event", "referral_shared");
};
