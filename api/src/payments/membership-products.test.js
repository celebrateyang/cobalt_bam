import assert from "node:assert/strict";
import test from "node:test";

import {
    WECHAT_MEMBERSHIP_PRODUCTS,
    getMembershipProductDescription,
    getWechatMembershipProductByKey,
} from "./membership-products.js";

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
