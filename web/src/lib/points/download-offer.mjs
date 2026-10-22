export const SHARE_REWARD_POINTS = 300;

// These intents resolve the same provider and product on the account page.
export const OFFER_PROVIDER = "buymeacoffee";
export const CREDIT_PRODUCT_KEY = "buymeacoffee_usd_199";
export const PASS_PRODUCT_KEY = "member_3day_buymeacoffee";

/**
 * @typedef {Object} OfferProduct
 * @property {string} key
 * @property {number} amountFen
 * @property {string} currency
 * @property {boolean} [enabled]
 * @property {number} [points]
 * @property {number} [durationDays]
 * @property {string} [billingType]
 * @property {string[]} [entitlements]
 * @property {{dailySuccessfulDownloads?: number}} [limits]
 */
/** @param {OfferProduct | null | undefined} product */
export const isAvailableOffer = (product) => Boolean(product &&
    product.enabled === true && product.currency === "USD" &&
    Number.isSafeInteger(product.amountFen) && product.amountFen > 0);

/** @param {OfferProduct[]} products @param {number} gap */
export const selectCreditOffer = (products, gap) => products.find(product =>
    product.key === CREDIT_PRODUCT_KEY && isAvailableOffer(product) &&
    typeof product.points === "number" && Number.isSafeInteger(product.points) && product.points >= gap);

/** @param {OfferProduct[]} products */
export const selectPassOffer = (products) => products.find(product =>
    product.key === PASS_PRODUCT_KEY && isAvailableOffer(product) &&
    product.billingType === "one_time" && product.durationDays === 3 &&
    product.entitlements?.includes("member_download") &&
    typeof product.limits?.dailySuccessfulDownloads === "number" && Number.isSafeInteger(product.limits.dailySuccessfulDownloads) &&
    product.limits.dailySuccessfulDownloads > 0);

/** @param {string | undefined} lang */
export const shareWebsiteUrl = (lang) =>
    `https://freesavevideo.online/${encodeURIComponent(lang || "en")}/`;

/** @param {string} contactUrl @param {string} message */
export const whatsappRewardUrl = (contactUrl, message) => {
    const url = new URL(contactUrl);
    url.searchParams.set("text", message);
    return url.toString();
};
