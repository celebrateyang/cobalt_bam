import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import {
  parseBuyMeACoffeePurchaseEvent,
  verifyBuyMeACoffeeSignature,
} from "./buymeacoffee.js";

test("verifies the Buy Me a Coffee raw-body signature", () => {
  process.env.BUYMEACOFFEE_WEBHOOK_SECRET = "test-secret";
  const rawBody = JSON.stringify({ event_id: 1 });
  const signature = crypto
    .createHmac("sha256", "test-secret")
    .update(rawBody)
    .digest("hex");
  assert.equal(verifyBuyMeACoffeeSignature({ rawBody, signature }), true);
  assert.equal(
    verifyBuyMeACoffeeSignature({ rawBody, signature: "0".repeat(64) }),
    false,
  );
});

test("parses a live fixed-product purchase with an order code", () => {
  const result = parseBuyMeACoffeePurchaseEvent({
    event_id: 10,
    type: "extra_purchase.created",
    live_mode: true,
    data: {
      transaction_id: "pi_test",
      status: "succeeded",
      refunded: "false",
      amount: 1.99,
      currency: "USD",
      created_at: 1719825600,
      extras: [
        {
          id: 581332,
          quantity: 1,
          question_answers: ["cpt_abcdefghijklmnopqrst"],
        },
      ],
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.product.points, 600);
  assert.equal(result.outTradeNo, "cpt_abcdefghijklmnopqrst");
  assert.equal(result.amountFen, 199);
});

test("never credits dashboard test events", () => {
  assert.deepEqual(
    parseBuyMeACoffeePurchaseEvent({
      type: "extra_purchase.created",
      live_mode: false,
      data: {},
    }),
    { ok: true, test: true },
  );
});

const purchase = (type, answers = []) => ({
  type,
  live_mode: true,
  data: {
    transaction_id: "pi_post_purchase",
    status: "succeeded",
    refunded: "false",
    amount: 1.99,
    currency: "USD",
    extras: [{ id: 581332, quantity: 1, question_answers: answers }],
  },
});

test("waits for a post-purchase answer, then accepts the updated purchase", () => {
  const created = purchase("extra_purchase.created");
  assert.deepEqual(parseBuyMeACoffeePurchaseEvent(created), {
    ok: false, code: "ORDER_CODE_MISSING",
  });
  const updated = purchase("extra_purchase.updated", ["cpt_abcdefghijklmnopqrst"]);
  const result = parseBuyMeACoffeePurchaseEvent(updated);
  assert.equal(result.ok, true);
  assert.equal(result.transactionId, created.data.transaction_id);
  assert.equal(result.outTradeNo, "cpt_abcdefghijklmnopqrst");
});

test("updated events still require a successful, unrefunded, exact-price purchase", () => {
  for (const [patch, code] of [
    [{ status: "pending" }, "PAYMENT_NOT_SUCCEEDED"],
    [{ refunded: "true" }, "PAYMENT_NOT_SUCCEEDED"],
    [{ amount: 0.01 }, "AMOUNT_MISMATCH"],
    [{ currency: "EUR" }, "AMOUNT_MISMATCH"],
    [{ transaction_id: "" }, "TRANSACTION_ID_MISSING"],
    [{ extras: [{ id: 581332, quantity: 2 }] }, "INVALID_PRODUCT_QUANTITY"],
  ]) {
    const event = purchase("extra_purchase.updated", ["cpt_abcdefghijklmnopqrst"]);
    Object.assign(event.data, patch);
    assert.deepEqual(parseBuyMeACoffeePurchaseEvent(event), { ok: false, code });
  }
  const testEvent = purchase("extra_purchase.updated");
  testEvent.live_mode = false;
  assert.deepEqual(parseBuyMeACoffeePurchaseEvent(testEvent), { ok: true, test: true });
  assert.equal(parseBuyMeACoffeePurchaseEvent(purchase("extra_purchase.refunded")).code,
    "UNSUPPORTED_EVENT");
});
