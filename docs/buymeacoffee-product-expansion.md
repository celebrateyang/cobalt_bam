# Buy Me a Coffee product expansion - review draft

Status: approved and implemented locally on 2026-10-04. All six new Shop
products are saved and verified as drafts, with actual IDs mapped in code.
They are not yet published or enabled in production. Existing Shop copy
remains brand-neutral.

## Product catalog

Match the current Crypto catalog to avoid different prices or entitlements
for the same purchase across payment channels. All prices below are USD.

| Type | Quantity / duration | Price | Shop title | Status |
| --- | --- | --- | --- | --- |
| Credits | 600 | 1.99 | 600 Processing Credits (One-time Purchase) | Existing |
| Credits | 2,000 | 4.99 | 2,000 Processing Credits (One-time Purchase) | Existing |
| Credits | 5,000 | 9.99 | 5,000 Processing Credits (One-time Purchase) | Proposed |
| Credits | 12,000 | 19.99 | 12,000 Processing Credits (One-time Purchase) | Proposed |
| Credits | 35,000 | 49.99 | 35,000 Processing Credits (One-time Purchase) | Proposed |
| Pass | 3 days | 1.99 | 3-Day Download Pass (One-time Purchase) | Proposed |
| Pass | 30 days | 4.99 | 30-Day Download Pass (One-time Purchase) | Proposed |
| Pass | 365 days | 19.99 | 365-Day Download Pass (One-time Purchase) | Proposed |

Credits never expire, are consumed according to the operation's credit cost,
and do not grant membership. Passes grant membership for the purchased
duration; they do not add credits. A pass expires and is not renewed or charged
automatically. Do not apply the credits-never-expire claim to passes.

The annual price matches Crypto's current founding annual product. It is
approximately USD 1.67/month, substantially below USD 4.99 for 30 days.
Keep the existing price for channel consistency, but review service costs and
actual usage before promoting it heavily. No invented countdown, limited stock,
historical price or lifetime-access promise.

## Membership entitlements

Match Crypto's actual entitlements, not the general membership marketing copy:

- Standard downloads without point deductions within fair-use limits.
- Browser video recording.
- Up to 300 successful downloads per day and 5,000 per month, using the
  existing membership quota periods and enforcement.
- AI video processing and random video chat are not included.
- All three durations have the same entitlements. No bundled credit balance.

Implemented activation rules: start on verified payment plus successful account
association; for an existing eligible pass with the same entitlements, append
the purchased duration to its expiration. Preserve the existing cross-provider
extension behavior. To avoid downgrading a full membership, the UI and order
creation block BMC pass purchases while an active membership has additional
entitlements; fulfillment rechecks this in its transaction. An incompatible
paid receipt remains available for manual review. Provider paidAt is preserved
on the order; BMC pass duration starts at successful fulfillment so delayed
code submission does not consume purchased days.

## Saved Shop drafts and release

| Product | Actual Shop ID |
| --- | --- |
| 5,000 credits | 583004 |
| 12,000 credits | 583005 |
| 35,000 credits | 583006 |
| 3-day pass | 583007 |
| 30-day pass | 583009 |
| 365-day pass | 583011 |

Edit a draft at `https://studio.buymeacoffee.com/extras/edit/ID`.
Saved titles, descriptions, prices and confirmation messages have been
reopened and verified. All confirmation messages use the correct cpt_/mbr_
prefix; quantity selection remains disabled. No project brand appears in copy.

The new products default to unavailable until
`BUYMEACOFFEE_EXPANDED_PRODUCTS_ENABLED=true`. Helm exposes this as
`buymeacoffee.expandedProductsEnabled` (default false). The two original credit
products remain available. Per-product ID/URL env overrides remain supported.

Release order:

1. Deploy the tested API change with the expansion gate false.
2. The owner runs the frontend production build as required by AGENTS.md;
   deploy the resulting Cloudflare Pages frontend.
3. Publish the six saved Shop drafts, after confirming the new API receiver is
   live. Its parser recognizes the IDs regardless of the order-creation gate.
4. Set the Helm expansion gate true, then verify catalog, credit checkout and
   membership checkout in the deployed account page. Keep the value in the
   production Helm configuration so later releases do not reset it.

No production deployment, real payment, or Shop publication was performed
during this implementation. Refunds are recorded for manual review; they do
not automatically revoke membership or subtract credits.

## Account page presentation

- Keep the payment-channel selection shared by credits and memberships.
- Separate "Buy credits" from "Download membership" with explanatory text:
  occasional use / operations charged in credits versus frequent standard
  downloads / access for a fixed period.
- Show 600, 2,000, 5,000 and 12,000 credits initially. Put 35,000 under
  "More packages" to keep the initial choice manageable.
- Mark 2,000 credits "Recommended". Mark only 35,000 "Lowest price per credit",
  since it is the actual minimum unit price. Remove the old 2,000 best-value tag.
- Show 30-day, 3-day and 365-day passes; recommend the 30-day pass.
- Buttons describe the purchase, such as "Buy 2,000 credits - US$4.99" or
  "Buy 30-day pass - US$4.99"; the provider is secondary branding.
- Show "One-time payment. No automatic renewal." before checkout for all
  products. Show "Credits never expire" only for credits and the expiration
  duration only for passes.
- Make benefits follow the selected provider/product. The current generic
  membership introduction mentions AI video and random chat, while Crypto
  passes do not grant those features.

## Shop copy templates

Continue omitting the project brand from product titles, descriptions,
confirmation messages and payment-code questions, as requested by the owner.
Keep processing-service descriptions accurate.

Credits: reuse the live neutral credit copy from buymeacoffee-conversion.md,
substituting quantity and price.

Pass description (substitute duration and price):

> Buy a 30-day download pass for US$4.99. One-time payment. No subscription or
> automatic renewal. This pass grants access for 30 days; it is not a credit pack.
>
> Includes standard downloads without point deductions within fair-use limits
> (up to 300 successful downloads per day and 5,000 per month), plus browser
> video recording. AI video processing and random video chat are not included.
>
> Before paying, copy your payment code from your account's payment window.
> After paying, paste the complete code into the payment-code question on the
> thank-you page and submit your answer. Return to your account to confirm
> activation and your expiration date. Payment alone does not link the pass
> to your account.
>
> Paid but no access? Email celebrateyang@gmail.com with your payment code
> and receipt. Do not pay again or send card details.
>
> This pass is non-transferable and can only be used for the listed services.
> It cannot be resold, withdrawn or redeemed for cash.

Question:

> Paste your complete payment code here (starts with mbr_).

Pass confirmation:

> Thank you for your purchase! One more step to activate your download pass:
> paste your complete payment code (starts with mbr_) into the question on this
> page and submit your answer. Copy the code from your account's payment window,
> then return to your account to confirm activation and your expiration date.
>
> This is a one-time purchase with no automatic renewal. Your pass is valid
> for the purchased duration. It is not a credit pack.
>
> Paid but no access? Email celebrateyang@gmail.com with your payment code
> and receipt. Do not pay again or send card details.

Retain the non-transferable/no-cash terms in the full confirmation as well.
Disable buyer-selected quantity and pay-what-you-want. Keep each product mapped
to a single fixed amount, currency, credit quantity or duration.

## Implementation details

Implemented locally below; production rollout remains in the release section.

1. Extend BMC product configuration with explicit credits/membership kind;
   retain the two existing IDs. New IDs and checkout URLs must come from the
   actual Shop products, never placeholders. Keep unmapped products disabled.
2. Add BMC membership listing and authenticated order creation. Use membership
   orders and existing entitlement/activation logic; do not credit a balance
   as a substitute for membership. Use distinct mbr_ order codes.
3. Extend signed live Shop created/updated webhook handling to dispatch by
   product kind. Verify product ID, quantity, amount, currency, code and order
   provider, and apply each transaction once.
4. Extend unmatched receipts reconciliation to join both credits and membership
   orders; a successfully activated pass must not remain unmatched. Preserve
   refund flags and do not activate refunded/test/pending events.
5. Update frontend membership checkout, saved-order recovery, polling, success
   notice and help wording. Existing BMC wording assumes credits/cpt_ and must
   be made product-specific. Keep analytics kind correct for memberships.
6. Add localized product/benefit/expiry copy in all existing locales; validate
   UTF-8 encoding and use targeted Svelte checks, not a production build.
7. Test missing/later code, duplicated and reordered callbacks, wrong product,
   price or currency, refund, membership renewal and cross-provider purchases.
8. Create and verify the actual Shop products with approved copy; confirm IDs,
   then enable only after the receiving backend supports both order kinds.
   Review the code and a concrete rollout plan before production release.

## Conversion measurement

Measure each kind/product separately: package selection, order creation, code
copy, checkout opened, verified provider payment, crediting/pass activation,
and help opened. Deduplicate by order/transaction rather than counting repeated
clicks or callback deliveries. Compare unique buyers and order attempts as
separate metrics. Membership uptake does not by itself prove improved payment
completion.

## Validation performed

- `pnpm -C api test:buymeacoffee`: 11 passing tests, including real PostgreSQL
  semantics via PGlite for activation, extension, replay protection, refunds,
  reconciliation and incompatible-membership protection.
- Changed API modules pass `node --check`.
- Focused Svelte/TypeScript check of changed account/admin pages and dependencies:
  zero errors, two existing account-page warnings. Full workspace checking was
  limited by machine memory; a focused config retained normal project aliases.
- All 11 locale files pass completeness and UTF-8 encoding checks.
- Helm lint passes with non-secret placeholder database/admin/JWT values.
- All six Shop drafts were reopened to verify saved title, price, description,
  confirmation, draft status and absence of the project brand.
- No live payment was made. Post-deployment checkout still needs verification.

## Reference

- Current Crypto credits: api/src/routes/payments.js, NOWPAYMENTS_CREDIT_PRODUCTS.
- Current Crypto passes: api/src/payments/membership-products.js.
- Actual entitlement/activation behavior: api/src/db/membership-orders.js.
- Current BMC checkout supports credits only; BMC membership listing is empty.
- BMC describes Shop purchases as one-time payments:
  https://help.buymeacoffee.com/en/articles/9076381-why-is-there-a-charge-from-buy-me-a-coffee-on-my-account
- BMC native monthly/yearly memberships use subscriptions:
  https://help.buymeacoffee.com/en/articles/4368555-things-you-should-know-before-subscribing-to-a-membership-plan

Recommendation: sell fixed-duration passes through Shop for this iteration,
preserving the same one-time model as Crypto. This draft does not establish
platform approval for a product or account.
