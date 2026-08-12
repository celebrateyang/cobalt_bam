import assert from "node:assert/strict";
import test from "node:test";

import {
    formatPayPalAmount,
    getCompletedPayPalCapture,
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
