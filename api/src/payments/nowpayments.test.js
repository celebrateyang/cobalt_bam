import assert from "node:assert/strict";
import test from "node:test";

import {
    createNowPaymentsSignature,
    isDecimalAtLeast,
    minorUnitsToDecimal,
    parseDecimalToMinorUnits,
    parseDecimalToCeilMinorUnits,
    sortNowPaymentsPayload,
    verifyNowPaymentsIpnSignature,
} from "./nowpayments.js";

test("formats and parses NOWPayments USD amounts exactly", () => {
    assert.equal(minorUnitsToDecimal(199), "1.99");
    assert.equal(minorUnitsToDecimal(4999), "49.99");
    assert.equal(parseDecimalToMinorUnits("1.99"), 199);
    assert.equal(parseDecimalToMinorUnits(5), 500);
    assert.ok(Number.isNaN(parseDecimalToMinorUnits("1.999")));
});

test("rounds NOWPayments minimum amounts up to the next cent", () => {
    assert.equal(parseDecimalToCeilMinorUnits("19.20910391"), 1921);
    assert.equal(parseDecimalToCeilMinorUnits("19.9900"), 1999);
    assert.equal(parseDecimalToCeilMinorUnits("20"), 2000);
    assert.equal(Number.isNaN(parseDecimalToCeilMinorUnits("1e2")), true);
});

test("compares crypto decimal amounts without floating-point rounding", () => {
    assert.equal(isDecimalAtLeast("15", "15.000000"), true);
    assert.equal(isDecimalAtLeast("15.000001", "15"), true);
    assert.equal(isDecimalAtLeast("14.999999", "15"), false);
    assert.equal(isDecimalAtLeast("invalid", "15"), false);
});

test("sorts nested IPN payload keys without reordering arrays", () => {
    assert.deepEqual(
        sortNowPaymentsPayload({ z: 1, nested: { y: 2, a: 3 }, list: [{ b: 1, a: 2 }] }),
        { list: [{ a: 2, b: 1 }], nested: { a: 3, y: 2 }, z: 1 },
    );
});

test("verifies NOWPayments HMAC-SHA512 signatures", () => {
    const previous = process.env.NOWPAYMENTS_IPN_SECRET;
    process.env.NOWPAYMENTS_IPN_SECRET = "test-ipn-secret";
    try {
        const payload = {
            payment_status: "finished",
            payment_id: 123456789,
            order_id: "cpt_example",
            price_amount: 4.99,
            price_currency: "usd",
        };
        const signature = createNowPaymentsSignature(payload, "test-ipn-secret");
        assert.equal(
            verifyNowPaymentsIpnSignature({ signature, payload }),
            true,
        );
        assert.equal(
            verifyNowPaymentsIpnSignature({
                signature,
                payload: { ...payload, order_id: "cpt_tampered" },
            }),
            false,
        );
    } finally {
        if (previous === undefined) delete process.env.NOWPAYMENTS_IPN_SECRET;
        else process.env.NOWPAYMENTS_IPN_SECRET = previous;
    }
});
