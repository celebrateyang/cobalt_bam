# Buy Me a Coffee entry products (2026-10-14)

The owner requested two USD 0.99 products, then approved USD 1.00 for both
after the Shop editor rejected 0.99 with "Sorry, a product must be at least $1."

| Shop ID | Product | Price | Site product key |
| --- | --- | --- | --- |
| 587018 | 1-Day Service Membership (One-time Purchase) | USD 1.00 | member_1day_buymeacoffee |
| 587019 | 500 Processing Credits (One-time Purchase) | USD 1.00 | buymeacoffee_usd_100 |

The membership grants the same entitlements and fair-use limits as existing
BMC passes for one day, starting at verified fulfillment. Repeat purchases
extend an eligible existing pass. Credits grant 500 points once per verified
transaction. Email matching, exact amount/currency checks and transaction
deduplication use the existing fulfillment path.

Both products use confirmation messages and the verified account email at
checkout. They do not require a payment-code answer. External titles remain
brand-neutral. Quantity selection is disabled.

## Release order

1. Deploy the API changes before opening either product for purchase.
2. Confirm production recognizes IDs 587018 and 587019, price 100 cents, and
   the membership plan member_1day. The existing expanded-products gate applies.
3. Publish/activate both Shop products and verify public price and checkout.
4. The owner runs the web production build and deploys the account-page update
   so the new one-day membership has its correct localized name and subtitle.

No production deployment or paid transaction is part of local validation.

Current external state: 587018 is a saved draft; 587019 is deactivated.
Both stored descriptions and prices are USD 1.00. Saving a newly drafted
credit product from the edit screen exposed it briefly; it was deactivated
before completion and remains unavailable for purchase pending API release.

Validation: all 19 BMC API tests passed, including new 500-point fulfillment,
one-day extension and duplicate-payment checks. Web check reported 0 errors
and 107 warnings. Translation interpolation, completeness and encoding checks
passed for all 11 locales. No production build was run.
