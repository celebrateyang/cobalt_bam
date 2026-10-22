import assert from "node:assert/strict";
import test from "node:test";
import { selectCreditOffer, selectPassOffer, shareWebsiteUrl, whatsappRewardUrl } from "../src/lib/points/download-offer.mjs";

test("offers only enabled products with enough credit and the advertised pass terms", () => {
    const credit = { key: "buymeacoffee_usd_199", points: 1200, amountFen: 199, currency: "USD", enabled: true };
    assert.equal(selectCreditOffer([credit], 360), credit);
    assert.equal(selectCreditOffer([credit], 1201), undefined);
    assert.equal(selectCreditOffer([{ ...credit, enabled: false }], 1), undefined);
    assert.equal(selectCreditOffer([{ ...credit, enabled: undefined }], 1), undefined);
    assert.equal(selectCreditOffer([{ ...credit, amountFen: -1 }], 1), undefined);
    const pass = { ...credit, key: "member_3day_buymeacoffee", durationDays: 3, billingType: "one_time",
        entitlements: ["member_download"], limits: { dailySuccessfulDownloads: 300 } };
    assert.equal(selectPassOffer([pass]), pass);
    for (const override of [{ enabled: false }, { billingType: "subscription" }, { durationDays: 1 }, { entitlements: [] }, { limits: {} }]) {
        assert.equal(selectPassOffer([{ ...pass, ...override }]), undefined);
    }
});

test("public share URL contains only the locale; private claim message round-trips email and newlines", () => {
    assert.equal(shareWebsiteUrl("ja"), "https://freesavevideo.online/ja/");
    const message = "Claim 300 points\nEmail: a+b@example.com\nProof to follow";
    const url = new URL(whatsappRewardUrl("https://wa.me/66863855255", message));
    assert.equal(url.origin, "https://wa.me");
    assert.equal(url.searchParams.get("text"), message);
    assert.equal(shareWebsiteUrl("en").includes("example.com"), false);
});
