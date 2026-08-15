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
        amountFen: 50000,
        currency: "CNY",
    }),
]);

export const getWechatMembershipProductByKey = (key) =>
    WECHAT_MEMBERSHIP_PRODUCTS.find((product) => product.key === key);

export const getMembershipProductDescription = (key) => {
    if (key === "member_3day") return "3-day membership";
    if (key === "member_yearly") return "Yearly membership";
    if (key === "member_monthly") return "Monthly membership";
    throw new Error(`Unsupported membership product description: ${key}`);
};
