import assert from "node:assert/strict";
import test from "node:test";

import {
    canCapturePayPalOrder,
    formatPayPalAmount,
    getCompletedPayPalCapture,
    getPayPalOrderStatus,
    getPayPalPayerActionUrl,
    getPayPalRequestIssue,
    getPayPalSubscriptionApprovalUrl,
    parsePayPalAmount,
} from "./paypal.js";

test("formats and parses PayPal USD amounts without floating-point rounding", () => {
    assert.equal(formatPayPalAmount(199), "1.99");
    assert.equal(formatPayPalAmount(4999), "49.99");
    assert.equal(parsePayPalAmount("1.99"), 199);
    assert.equal(parsePayPalAmount("5"), 500);
    assert.equal(parsePayPalAmount("5.9"), 590);
    assert.ok(Number.isNaN(parsePayPalAmount("1.999")));
});

test("extracts the completed capture and local order reference", () => {
    const result = getCompletedPayPalCapture({
        purchase_units: [
            {
                custom_id: "cpt_example",
                payments: {
                    captures: [
                        {
                            id: "CAPTURE123",
                            status: "COMPLETED",
                            amount: { currency_code: "USD", value: "4.99" },
                        },
                    ],
                },
            },
        ],
    });

    assert.equal(result?.outTradeNo, "cpt_example");
    assert.equal(result?.capture?.id, "CAPTURE123");
});

test("normalizes PayPal order state and payer action links", () => {
    const order = {
        status: "payer_action_required",
        links: [
            { rel: "self", href: "https://api-m.paypal.com/order/123" },
            {
                rel: "payer-action",
                href: "https://www.paypal.com/checkout/123",
            },
        ],
    };

    assert.equal(getPayPalOrderStatus(order), "PAYER_ACTION_REQUIRED");
    assert.equal(canCapturePayPalOrder(order), false);
    assert.equal(canCapturePayPalOrder({ status: "APPROVED" }), true);
    assert.equal(canCapturePayPalOrder({ status: "COMPLETED" }), false);
    assert.equal(
        getPayPalPayerActionUrl(order),
        "https://www.paypal.com/checkout/123",
    );
});

test("extracts the first PayPal request issue", () => {
    const issue = getPayPalRequestIssue({
        data: {
            details: [{ issue: "order_not_approved" }],
        },
    });

    assert.equal(issue, "ORDER_NOT_APPROVED");
    assert.equal(getPayPalRequestIssue({}), null);
});

test("extracts the PayPal subscription approval URL", () => {
    assert.equal(
        getPayPalSubscriptionApprovalUrl({
            links: [
                { rel: "self", href: "https://api-m.paypal.com/subscription/I-1" },
                { rel: "approve", href: "https://www.paypal.com/agree/I-1" },
            ],
        }),
        "https://www.paypal.com/agree/I-1",
    );
    assert.equal(getPayPalSubscriptionApprovalUrl({ links: [] }), null);
});
