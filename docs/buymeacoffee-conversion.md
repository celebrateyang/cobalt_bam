# Buy Me a Coffee credit checkout

## Initial audit and external updates (2026-10-04, Asia/Shanghai)

Read-only production query found 16 Buy Me a Coffee site orders: 2 PAID and
14 CREATED. The USD 1.99 package has 13 pending orders from 8 distinct users;
the USD 4.99 package has 1 pending order from 1 user. These user counts are
per package/status and must not be summed to infer globally distinct buyers.

The authenticated platform Shop Orders view lists 2 purchases of USD 1.99.
Both transaction IDs and submitted payment codes match the two PAID site
orders. No extra unmatched Shop payment was found in that view. Test versus
real-customer classification has not been established.

Both Shop titles, descriptions, success messages and payment-code questions
were saved through the existing authenticated browser session. The public
600-credit and 2,000-credit pages were checked for the updated titles and
one-time/no-renewal/no-expiry copy. Prices remain USD 1.99 and USD 4.99.

The Shop view displayed a warning that the shop was unlisted until payout
setup was completed. A subsequent user-provided Payouts screenshot shows
"Instant Payout via Stripe" as "Connected". The earlier conclusion that the
owner needed to connect a payout account was incorrect; no reconnection is
needed based on this evidence. The warning's cause and the shop's listing
status remain unverified. It does not establish that direct-link payments
are blocked or explain the low payment conversion.
Anonymous/mobile checkout and buyer payment methods were not verified;
the available Chrome session is the creator's session.

Repository changes require the usual release before appearing on FreeSaveVideo.

## Product copy ready for the Shop editor

Use these titles for the existing fixed-price Shop products:

- Product 581332: `600 Processing Credits (One-time Purchase)` - USD 1.99
- Product 581334: `2,000 Processing Credits (One-time Purchase)` - USD 4.99

Updated live on 2026-10-04 at the owner's request to omit the project brand
from Shop product titles, descriptions, confirmation messages and questions.

Description (replace the credit count and amount for each product):

> Buy 600 processing credits for US$1.99. One-time purchase, no subscription
> or automatic renewal. Credits never expire and are deducted as you use them.
>
> Before paying, copy your payment code from your account's payment window. After paying, stay
> on the thank-you page, paste the complete code starting with cpt_ into the
> payment-code question, and submit your answer. Payment alone does not add credits.
>
> If you paid but have not received credits, email celebrateyang@gmail.com
> with your payment code and receipt. Do not pay again or send card details.

Keep the existing post-purchase question:

> Paste your payment code here (starts with cpt_).

Thank-you message:

> One more step to receive your processing credits: paste your complete
> payment code into the question on this page and submit your answer. Return
> to your account to check status. If you need help, email
> celebrateyang@gmail.com with your code and receipt. Do not pay again.

Both descriptions and confirmation messages retain the one-time purchase,
no automatic renewal, no expiry and non-transferable processing-service
terms. Credits cannot be resold, withdrawn or redeemed for cash.

Keep quantity selection and pay-what-you-want disabled. Verify the actual
checkout total, any buyer-paid fees, available payment methods, and mobile
checkout before promising an exact total or a particular payment method.

## Reconciliation

The orders console includes a paginated section for Buy Me a Coffee receipts
awaiting review. It lists verified live successful payments without a credited
site order, and refunds requiring review. No email-based automatic crediting
or manual credit button is added.

Receipts are stored by provider transaction ID; repeated callbacks do not
create duplicates. An updated callback with a valid code follows the existing
order validation and idempotent crediting path. A receipt disappears from the
unmatched list once its transaction is linked to a PAID order. Refund flags
remain set even if an earlier successful callback arrives later.

The `buymeacoffee_receipts` table is created lazily on the first receipt or
admin-list request, using the existing PostgreSQL connection. No separate
production schema command is required. Receipt storage failures cause a 500
webhook response rather than acknowledging and losing a payment record.

Only callbacks received after this release are captured. For older payments,
compare the platform transaction export against site orders, or replay the
original signed callbacks if the platform provides that function. Missing
callbacks and payments on a different product will not be inferred from site
order counts. Confirm transaction, product, amount, currency and intended
account before resolving an unmatched payment.

## Funnel measurement

Existing browser events:

- `view_item_list`, with `item_list_id=credit_products_buymeacoffee`: package views.
- `begin_checkout`, with `payment_type=buymeacoffee`: site order created.
- `purchase`, with `payment_type=buymeacoffee`: site order confirmed and credited.

New `payment_step` events have `payment_type=buymeacoffee`, numeric `order_id`,
and `step=code_copied`, `checkout_opened`, or `help_opened`. No receipt, email,
or payment code is sent in these new events. Register step and payment_type as
event dimensions in GA4 if needed. Clarity receives matching `bmc_*` events.

`checkout_opened` means the link was clicked; it does not prove that the external
checkout loaded. Provider payment success is measured from platform receipts,
not browser click events. Analytics may be blocked, so use provider transactions
and database orders for financial totals. Compare both distinct users and orders
over the same date range and allow time for code submission.

## Release checks

- Run `pnpm -C api test:buymeacoffee` and `pnpm -C web check`.
- Run i18n completeness and encoding checks.
- Verify copy success, manual copy after clipboard failure, external checkout,
  post-payment answer submission, return status and help on mobile.
- Verify an authenticated admin can view receipts and an unauthenticated caller
  cannot access `/user/admin/buymeacoffee-receipts`.
- Update the external Shop copy separately; repository changes do not update it.
