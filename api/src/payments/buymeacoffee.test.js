import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import {
  parseBuyMeACoffeeCreatedEvent,
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
  const result = parseBuyMeACoffeeCreatedEvent({
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
    parseBuyMeACoffeeCreatedEvent({
      type: "extra_purchase.created",
      live_mode: false,
      data: {},
    }),
    { ok: true, test: true },
  );
});
