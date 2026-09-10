import assert from "node:assert/strict";
import test from "node:test";

import {
    createNowPayment,
    createNowPaymentsSignature,
    getNowPaymentsConfig,
    getNowPaymentsMinimumAmount,
    isDecimalAtLeast,
    minorUnitsToDecimal,
    parseDecimalToMinorUnits,
    parseDecimalToCeilMinorUnits,
    sortNowPaymentsPayload,
    verifyNowPaymentsIpnSignature,
} from "./nowpayments.js";

test("defaults to low-minimum customer crypto choices first", () => {
    const previousPayCurrencies = process.env.NOWPAYMENTS_PAY_CURRENCIES;
    const previousPayoutCurrency = process.env.NOWPAYMENTS_PAYOUT_CURRENCY;
    delete process.env.NOWPAYMENTS_PAY_CURRENCIES;
    delete process.env.NOWPAYMENTS_PAYOUT_CURRENCY;
    try {
        const config = getNowPaymentsConfig();
        assert.deepEqual(config.payCurrencies, ["usdcmatic", "eth", "usdttrc20", "btc"]);
        assert.equal(config.payoutCurrency, "usdttrc20");
    } finally {
        if (previousPayCurrencies === undefined) {
            delete process.env.NOWPAYMENTS_PAY_CURRENCIES;
        } else {
            process.env.NOWPAYMENTS_PAY_CURRENCIES = previousPayCurrencies;
        }
        if (previousPayoutCurrency === undefined) {
            delete process.env.NOWPAYMENTS_PAYOUT_CURRENCY;
        } else {
            process.env.NOWPAYMENTS_PAYOUT_CURRENCY = previousPayoutCurrency;
        }
    }
});

test("creates a custody payment with an explicit payout currency", async () => {
    const previous = {
        apiKey: process.env.NOWPAYMENTS_API_KEY,
        callbackUrl: process.env.NOWPAYMENTS_IPN_CALLBACK_URL,
        payCurrencies: process.env.NOWPAYMENTS_PAY_CURRENCIES,
        fetch: globalThis.fetch,
    };
    process.env.NOWPAYMENTS_API_KEY = "test-api-key";
    process.env.NOWPAYMENTS_IPN_CALLBACK_URL = "https://example.com/payments/nowpayments/ipn";
    process.env.NOWPAYMENTS_PAY_CURRENCIES = "usdcmatic,eth,usdttrc20,btc";
    let requestBody = null;
    globalThis.fetch = async (_url, options) => {
        requestBody = JSON.parse(options.body);
        return new Response(
            JSON.stringify({
                payment_id: 123,
                payment_status: "waiting",
                pay_currency: "usdcmatic",
            }),
            { status: 200, headers: { "content-type": "application/json" } },
        );
    };
    try {
        await createNowPayment({
            outTradeNo: "cpt_example",
            amountFen: 199,
            payCurrency: "usdcmatic",
            payoutCurrency: "usdcmatic",
            points: 600,
        });
        assert.equal(requestBody.pay_currency, "usdcmatic");
        assert.equal(requestBody.payout_currency, "usdcmatic");
        assert.equal(requestBody.price_amount, "1.99");
    } finally {
        globalThis.fetch = previous.fetch;
        for (const [name, value] of [
            ["NOWPAYMENTS_API_KEY", previous.apiKey],
            ["NOWPAYMENTS_IPN_CALLBACK_URL", previous.callbackUrl],
            ["NOWPAYMENTS_PAY_CURRENCIES", previous.payCurrencies],
        ]) {
            if (value === undefined) delete process.env[name];
            else process.env[name] = value;
        }
    }
});

test("checks minimums from the selected crypto into the USDT payout wallet", async () => {
    const previousApiKey = process.env.NOWPAYMENTS_API_KEY;
    const previousPayCurrencies = process.env.NOWPAYMENTS_PAY_CURRENCIES;
    const previousFetch = globalThis.fetch;
    process.env.NOWPAYMENTS_API_KEY = "test-api-key";
    process.env.NOWPAYMENTS_PAY_CURRENCIES = "usdttrc20,usdcmatic,btc,eth";
    let requestedUrl = "";
    globalThis.fetch = async (url) => {
        requestedUrl = String(url);
        return new Response(JSON.stringify({ min_amount: "0.0001", fiat_equivalent: "12.345" }), {
            status: 200,
            headers: { "content-type": "application/json" },
        });
    };
    try {
        const minimum = await getNowPaymentsMinimumAmount({
            currencyFrom: "btc",
            currencyTo: "usdttrc20",
        });
        const query = new URL(requestedUrl).searchParams;
        assert.equal(query.get("currency_from"), "btc");
        assert.equal(query.get("currency_to"), "usdttrc20");
        assert.equal(query.get("fiat_equivalent"), "usd");
        assert.equal(minimum.minimumFen, 1235);
    } finally {
        globalThis.fetch = previousFetch;
        if (previousApiKey === undefined) delete process.env.NOWPAYMENTS_API_KEY;
        else process.env.NOWPAYMENTS_API_KEY = previousApiKey;
        if (previousPayCurrencies === undefined) {
            delete process.env.NOWPAYMENTS_PAY_CURRENCIES;
        } else {
            process.env.NOWPAYMENTS_PAY_CURRENCIES = previousPayCurrencies;
        }
    }
});

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
        sortNowPaymentsPayload({
            z: 1,
            nested: { y: 2, a: 3 },
            list: [{ b: 1, a: 2 }],
        }),
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
        assert.equal(verifyNowPaymentsIpnSignature({ signature, payload }), true);
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
