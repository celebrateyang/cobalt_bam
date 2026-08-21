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

export const PAYPAL_MEMBERSHIP_PRODUCTS = Object.freeze([
    Object.freeze({
        key: "member_monthly_recurring",
        planKey: "member_monthly",
        durationDays: 30,
        amountFen: 799,
        currency: "USD",
        billingType: "subscription",
        paypalPlanEnv: "PAYPAL_MEMBERSHIP_MONTHLY_PLAN_ID",
    }),
    Object.freeze({
        key: "member_yearly_recurring",
        planKey: "member_yearly",
        durationDays: 365,
        amountFen: 7999,
        currency: "USD",
        billingType: "subscription",
        paypalPlanEnv: "PAYPAL_MEMBERSHIP_YEARLY_PLAN_ID",
    }),
    Object.freeze({
        key: "member_monthly_onetime",
        planKey: "member_monthly",
        durationDays: 30,
        amountFen: 999,
        currency: "USD",
        billingType: "one_time",
    }),
]);

export const getWechatMembershipProductByKey = (key) =>
    WECHAT_MEMBERSHIP_PRODUCTS.find((product) => product.key === key);

export const getPayPalMembershipProductByKey = (key) =>
    PAYPAL_MEMBERSHIP_PRODUCTS.find((product) => product.key === key);

export const getPayPalMembershipPlanId = (product) =>
    product?.paypalPlanEnv
        ? String(process.env[product.paypalPlanEnv] || "").trim()
        : "";

export const getMembershipProductDescription = (key) => {
    if (key === "member_3day") return "3-day membership";
    if (key === "member_yearly") return "Yearly membership";
    if (key === "member_monthly") return "Monthly membership";
    if (key === "member_monthly_onetime") return "One-month membership pass";
    if (key === "member_monthly_recurring") return "Monthly membership subscription";
    if (key === "member_yearly_recurring") return "Yearly membership subscription";
    throw new Error(`Unsupported membership product description: ${key}`);
};
