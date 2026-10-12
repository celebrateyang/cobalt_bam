# Buy Me a Coffee email fulfillment (2026-10-12)

The account checkout displays the account email and a payment link. Users enter
that address in the provider's Contact information > Email field. They do not
copy or submit a payment code. The same flow covers fixed credit products and
one-time membership passes. Old code-bearing callbacks remain compatible.

Clerk matching uses the official [`getUserList` email filter](https://clerk.com/docs/reference/backend/user/get-user-list)
and checks the exact address's verification status. A unique Clerk profile must
also correspond to one local enabled user. No account is created from unverified
provider contact information. If matching fails, the paid receipt remains in
the admin list with a reason. Temporary Clerk or database failures trigger
provider retries with HTTP 500.

Orders are reserved under the payment receipt lock before fulfillment. The
assignment survives process failure and retry. Fulfillment locks receipt before
order, checks both credit and membership orders, and grants benefits within the
existing order/balance or order/subscription transaction. Paid transactions and
manual fulfillments are skipped before account lookup, even if a later callback
contains another email or code. Refunds remain visible for manual review; this
change does not introduce automatic reversal of spent credits.

## Manual reconciliation

`POST /user/admin/buymeacoffee-receipts/:transactionId/resolve` requires the
existing admin JWT, a verified successful unrefunded provider receipt, and a
valid enabled local `userId`. The admin must check the receipt and intended
account before resolving a payment.

```json
{ "userId": 8523, "mode": "record_manual", "note": "1200 credits already added manually" }
```

`record_manual` records the fulfillment and marks the corresponding order paid
without adding points or changing subscriptions. `grant` grants the validated
product once to the explicitly selected account. The transaction cannot be used
again for either kind of benefit. An existing immutable binding to another
account is rejected. Admin identity and resolution notes are retained.

## Rollout

1. Reconcile all payments already added through the balance editor before
   deploying the new webhook handler. In particular, Michelle's known transaction
   `pi_3UPPFUR4GZQ7vxAN1KoUPc18`, local user `8523`, order `1185`, already had
   1200 points added manually. This transaction was reconciled in production on
   2026-10-12 using the utility: order 1185 is paid and the receipt is recorded as
   manually fulfilled. The balance stayed at 1200, and a second utility run
   returned `ALREADY_RECORDED`. Other already-granted payments still need review.
   The utility below can run in the previous production image before deployment
   by copying it into `src/util/` first.
2. Deploy the API and frontend through the normal project workflow. Receipt
   columns are added idempotently on first receipt recording/listing. The user
   runs the frontend production build manually.
3. In Buy Me a Coffee, disable the payment-code question for each credit and
   membership Shop product and replace code-related product and thank-you copy.
   Suggested text: "Use the same verified email as your FreeSaveVideo account
   in Contact information > Email at checkout. Credits or membership are added
   automatically after payment. No payment code is needed. If not received,
   contact celebrateyang@gmail.com with your receipt. Do not pay again."
4. Verify one real same-email credit payment and one membership payment without
   a code, including website order polling. Then replay a signed callback and
   confirm the balance/expiry is unchanged. No live purchase or production
   deployment was performed as part of local implementation validation. The
   production change above only reconciled the previously granted payment.

The utility only records benefits the administrator already granted; it never
adds points. It validates the receipt, target order, product, amount and currency
inside a transaction, then locks receipt before order and checks both order
tables. With no `--confirm`, it prints the matching records without changing
anything. Run with the production DB configuration and the order already
created by that user:

```text
node src/util/record-bmc-manual-fulfillment.js pi_3UPPFUR4GZQ7vxAN1KoUPc18 1185 --confirm
```

## Local validation

```text
pnpm -C api test:buymeacoffee
pnpm -C web test:bmc-checkout
pnpm -C web test:bmc-translations
pnpm -C web i18n:check-encoding
pnpm -C web i18n:check-completeness
pnpm -C web check
```

Database tests use PGlite; they exercise actual grant functions for credits,
membership activation/extension, duplicate transactions across both kinds,
receipt retry binding, refunds, and manual fulfillment. They are local tests,
not a production concurrency or browser-payment validation.
