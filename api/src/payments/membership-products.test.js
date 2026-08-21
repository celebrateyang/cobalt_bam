import assert from "node:assert/strict";
import test from "node:test";

import {
    PAYPAL_MEMBERSHIP_PRODUCTS,
    WECHAT_MEMBERSHIP_PRODUCTS,
    getMembershipProductDescription,
    getPayPalMembershipProductByKey,
    getWechatMembershipProductByKey,
} from "./membership-products.js";

test("offers PayPal recurring monthly/yearly plans and a one-month pass", () => {
    assert.deepEqual(
        PAYPAL_MEMBERSHIP_PRODUCTS.map(
            ({ key, planKey, durationDays, amountFen, currency, billingType }) => ({
                key,
                planKey,
                durationDays,
                amountFen,
                currency,
                billingType,
            }),
        ),
        [
            {
                key: "member_monthly_recurring",
                planKey: "member_monthly",
                durationDays: 30,
                amountFen: 799,
                currency: "USD",
                billingType: "subscription",
            },
            {
                key: "member_yearly_recurring",
                planKey: "member_yearly",
                durationDays: 365,
                amountFen: 7999,
                currency: "USD",
                billingType: "subscription",
            },
            {
                key: "member_monthly_onetime",
                planKey: "member_monthly",
                durationDays: 30,
                amountFen: 999,
                currency: "USD",
                billingType: "one_time",
            },
        ],
    );
    assert.equal(
        getPayPalMembershipProductByKey("member_monthly_onetime")?.amountFen,
        999,
    );
    assert.equal(getPayPalMembershipProductByKey("member_3day"), undefined);
});

test("offers the new membership prices without reselling the legacy 7-day plan", () => {
    assert.deepEqual(WECHAT_MEMBERSHIP_PRODUCTS, [
        {
            key: "member_3day",
            planKey: "member_3day",
            durationDays: 3,
            amountFen: 600,
            currency: "CNY",
        },
        {
            key: "member_monthly",
            planKey: "member_monthly",
            durationDays: 30,
            amountFen: 5000,
            currency: "CNY",
        },
        {
            key: "member_yearly",
            planKey: "member_yearly",
            durationDays: 365,
            amountFen: 50000,
            currency: "CNY",
        },
    ]);
    assert.equal(getWechatMembershipProductByKey("member_weekly"), undefined);
});

test("uses a 3-day WeChat Pay description for the new short-term plan", () => {
    assert.equal(
        getMembershipProductDescription("member_3day"),
        "3-day membership",
    );
    assert.throws(
        () => getMembershipProductDescription("member_weekly"),
        /Unsupported membership product description/,
    );
});
