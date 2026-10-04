import crypto from "node:crypto";

const DEFAULT_PRODUCTS = Object.freeze([
  {
    key: "buymeacoffee_usd_199",
    productId: "581332",
    checkoutUrl: "https://buymeacoffee.com/bambooyang/e/581332",
    points: 600,
    amountFen: 199,
    currency: "USD",
    unitPriceFen: 0.332,
  },
  {
    key: "buymeacoffee_usd_499",
    productId: "581334",
    checkoutUrl: "https://buymeacoffee.com/bambooyang/e/581334",
    points: 2000,
    amountFen: 499,
    currency: "USD",
    unitPriceFen: 0.25,
  },
  ...[[999, 5000, "583004"], [1999, 12000, "583005"], [4999, 35000, "583006"]].map(([amountFen, points, productId]) => ({
    key: `buymeacoffee_usd_${amountFen}`,
    productId,
    checkoutUrl: `https://buymeacoffee.com/bambooyang/e/${productId}`,
    requiresExpansion: true,
    points, amountFen, currency: "USD", unitPriceFen: amountFen / points,
  })),
]);

const clean = (value) => String(value || "").trim();

export const BUYMEACOFFEE_CREDIT_PRODUCTS = DEFAULT_PRODUCTS.map((product) => ({
  ...product,
  kind: "credit",
  productId:
    clean(process.env[`BUYMEACOFFEE_PRODUCT_${product.amountFen}_ID`]) ||
    product.productId,
  checkoutUrl:
    clean(process.env[`BUYMEACOFFEE_PRODUCT_${product.amountFen}_URL`]) ||
    product.checkoutUrl,
}));

export const BUYMEACOFFEE_MEMBERSHIP_PRODUCTS = [
  ["monthly", 30, 799, "583009"], ["3day", 3, 199, "583007"], ["yearly", 365, 5000, "583011"],
].map(([period, durationDays, amountFen, productId]) => ({
  key: `member_${period}_buymeacoffee`, kind: "membership",
  planKey: `member_${period}`, durationDays, amountFen, currency: "USD",
  billingType: "one_time", entitlements: ["member_download", "ai_video_studio", "video_recording", "random_chat"],
  limits: { dailySuccessfulDownloads: 300, monthlySuccessfulDownloads: 5000 },
  productId: clean(process.env[`BUYMEACOFFEE_MEMBER_${durationDays}_ID`]) || productId,
  checkoutUrl: clean(process.env[`BUYMEACOFFEE_MEMBER_${durationDays}_URL`]) || `https://buymeacoffee.com/bambooyang/e/${productId}`,
  requiresExpansion: true,
}));

export const isBuyMeACoffeeProductEnabled = (product) => {
  try {
    const url = new URL(product.checkoutUrl);
    return /^\d+$/.test(product.productId) && url.protocol === "https:" &&
      url.hostname === "buymeacoffee.com" && url.pathname.endsWith(`/e/${product.productId}`);
  } catch { return false; }
};

// New Shop products remain drafts until the backend and frontend are released.
export const isBuyMeACoffeeProductAvailable = (product) =>
  isBuyMeACoffeeProductEnabled(product) && (!product.requiresExpansion ||
    process.env.BUYMEACOFFEE_EXPANDED_PRODUCTS_ENABLED === "true");

export const isBuyMeACoffeeConfigured = () =>
  Boolean(clean(process.env.BUYMEACOFFEE_WEBHOOK_SECRET));

export const getBuyMeACoffeeProductByKey = (key) =>
  [...BUYMEACOFFEE_CREDIT_PRODUCTS, ...BUYMEACOFFEE_MEMBERSHIP_PRODUCTS]
    .find((product) => product.key === key && isBuyMeACoffeeProductEnabled(product)) || null;

export const getBuyMeACoffeeProductById = (productId) =>
  [...BUYMEACOFFEE_CREDIT_PRODUCTS, ...BUYMEACOFFEE_MEMBERSHIP_PRODUCTS].find(
    (product) => product.productId === clean(productId) && isBuyMeACoffeeProductEnabled(product),
  ) || null;

export const verifyBuyMeACoffeeSignature = ({ rawBody, signature }) => {
  const secret = clean(process.env.BUYMEACOFFEE_WEBHOOK_SECRET);
  const received = clean(signature).toLowerCase();
  if (!secret || !rawBody || !/^[a-f0-9]{64}$/.test(received)) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(received, "hex"),
  );
};

export const parseBuyMeACoffeePurchaseEvent = (payload) => {
  if (!["extra_purchase.created", "extra_purchase.updated"].includes(payload?.type)) {
    return { ok: false, code: "UNSUPPORTED_EVENT" };
  }
  if (payload?.live_mode !== true) {
    return { ok: true, test: true };
  }

  const data = payload?.data || {};
  if (data.status !== "succeeded" || String(data.refunded) === "true") {
    return { ok: false, code: "PAYMENT_NOT_SUCCEEDED" };
  }

  const extras = Array.isArray(data.extras) ? data.extras : [];
  if (extras.length !== 1 || Number(extras[0]?.quantity) !== 1) {
    return { ok: false, code: "INVALID_PRODUCT_QUANTITY" };
  }
  const product = getBuyMeACoffeeProductById(extras[0]?.id);
  if (!product) return { ok: false, code: "UNKNOWN_PRODUCT" };

  const answers = Array.isArray(extras[0]?.question_answers)
    ? extras[0].question_answers
    : [];
  const orderCodes = [...new Set(answers
    .map(clean)
    .filter((answer) => /^(cpt|mbr)_[A-Za-z0-9_-]{10,64}$/.test(answer)))];
  if (orderCodes.length > 1) return { ok: false, code: "AMBIGUOUS_ORDER_CODE" };
  const outTradeNo = orderCodes[0];
  if (outTradeNo && !outTradeNo.startsWith(product.kind === "membership" ? "mbr_" : "cpt_")) {
    return { ok: false, code: "ORDER_KIND_MISMATCH" };
  }

  const amountFen = Math.round(Number(data.amount) * 100);
  const currency = clean(data.currency).toUpperCase();
  if (amountFen !== product.amountFen || currency !== product.currency) {
    return { ok: false, code: "AMOUNT_MISMATCH" };
  }

  const transactionId = clean(data.transaction_id);
  if (!transactionId) return { ok: false, code: "TRANSACTION_ID_MISSING" };

  // Shop questions are answered after purchase. A later updated event can
  // include the answer; retrying the original created payload cannot add it.
  if (!outTradeNo) return { ok: false, code: "ORDER_CODE_MISSING" };

  return {
    ok: true,
    product,
    outTradeNo,
    transactionId,
    amountFen,
    paidAt:
      Number(data.created_at) > 0 ? Number(data.created_at) * 1000 : Date.now(),
  };
};
