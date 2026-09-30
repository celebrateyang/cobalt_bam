export const WECHAT_MEMBERSHIP_PRODUCTS = Object.freeze([
    Object.freeze({
        key: "member_3day",
        planKey: "member_3day",
        durationDays: 3,
        amountFen: 600,
        currency: "CNY",
    }),
    Object.freeze({
        key: "member_monthly",
        planKey: "member_monthly",
        durationDays: 30,
        amountFen: 5000,
        currency: "CNY",
    }),
    Object.freeze({
        key: "member_yearly",
        planKey: "member_yearly",
        durationDays: 365,
        amountFen: 29800,
        currency: "CNY",
    }),
]);

const NOWPAYMENTS_MEMBERSHIP_ENTITLEMENTS = Object.freeze([
    "member_download",
    "video_recording",
]);
const NOWPAYMENTS_MEMBERSHIP_LIMITS = Object.freeze({
    dailySuccessfulDownloads: 300,
    monthlySuccessfulDownloads: 5000,
});

export const NOWPAYMENTS_MEMBERSHIP_PRODUCTS = Object.freeze([
    Object.freeze({
        key: "member_monthly_nowpayments",
        planKey: "member_monthly_crypto",
        durationDays: 30,
        amountFen: 499,
        currency: "USD",
        billingType: "one_time",
        entitlements: NOWPAYMENTS_MEMBERSHIP_ENTITLEMENTS,
        limits: NOWPAYMENTS_MEMBERSHIP_LIMITS,
    }),
    Object.freeze({
        key: "member_3day_nowpayments",
        planKey: "member_3day_crypto",
        durationDays: 3,
        amountFen: 199,
        currency: "USD",
        billingType: "one_time",
        entitlements: NOWPAYMENTS_MEMBERSHIP_ENTITLEMENTS,
        limits: NOWPAYMENTS_MEMBERSHIP_LIMITS,
    }),
    Object.freeze({
        key: "member_yearly_nowpayments_founder",
        planKey: "member_yearly_crypto",
        durationDays: 365,
        amountFen: 1999,
        currency: "USD",
        billingType: "one_time",
        entitlements: NOWPAYMENTS_MEMBERSHIP_ENTITLEMENTS,
        limits: NOWPAYMENTS_MEMBERSHIP_LIMITS,
    }),
]);

export const getWechatMembershipProductByKey = (key) =>
    WECHAT_MEMBERSHIP_PRODUCTS.find((product) => product.key === key);

export const getNowPaymentsMembershipProductByKey = (key) =>
    NOWPAYMENTS_MEMBERSHIP_PRODUCTS.find((product) => product.key === key);

export const getMembershipProductDescription = (key) => {
    if (key === "member_3day") return "3-day membership";
    if (key === "member_yearly") return "Yearly membership";
    if (key === "member_monthly") return "Monthly membership";
    if (key === "member_3day_nowpayments") return "3-day crypto membership pass";
    if (key === "member_monthly_nowpayments") return "30-day crypto membership pass";
    if (key === "member_yearly_nowpayments_founder") {
        return "FreeSaveVideo Founding Annual Pass";
    }
    throw new Error(`Unsupported membership product description: ${key}`);
};
