# Whatnot Seller API: notes from the developer guide

Gathered 2026-10-31 from https://developers.whatnot.com and the OpenAPI
document saved beside this file as `openapi.json`
(https://developers.whatnot.com/api-reference/openapi.json, OpenAPI 3.1.0,
API version 2.0.0, 35 operations, 89 schemas). Facts below are from those
pages unless marked "observed", which means we saw it in a real response.

## Operations

The OpenAPI document lists 35 operations: the 34 in `catalog.mjs` plus
`GET /` (Health check, responses 200 and 503). The health check still needs a
token: observed 2026-10-31, with no token it answers 401 problem+json
`{"type":"unauthenticated","title":"Unauthenticated","status":401,"detail":"You do not have permission to access this resource."}`.
Reports live under the tag "Reports and Statements" in the reference; our
catalog groups them under Analytics.

## Getting a token (personal access tokens)

- Dashboard: https://www.whatnot.com/dashboard/developer?tab=tokens
  ("Personal access tokens" tab of the developer dashboard).
- "Generate new token". Only the account owner can create and manage tokens.
- Fields: name (required, unique), description (optional), expiration
  (7, 30, 60 or 90 days, a custom date, or no expiration), permissions
  (scopes). Write access to a resource includes read access.
- The token is shown once. Copy it straight away.
- Personal access tokens start with `wn_pat_tk_`. Tokens issued to an OAuth
  app start with `wn_access_tk_` (an older page mentions `wn_access_tk_test_`
  for staging keys; no current page describes a staging environment).
- Manage: open a token to see created, last used, expiration, permissions.
  Edit name/description/expiration/permissions (expired tokens cannot be
  edited, regenerate instead). Regenerate = new token, same settings, old one
  stops at once. Delete = revoked at once, cannot be undone.
- Leaked token: regenerate or delete it in the dashboard immediately.
- Header: `Authorization: Bearer <token>`. Requests with a body also need
  `Content-Type: application/json`.

## OAuth (for apps that act for other sellers)

From https://api.whatnot.com/.well-known/oauth-authorization-server/seller-api:
- issuer https://api.whatnot.com/seller-api
- authorization_endpoint https://api.whatnot.com/seller-api/rest/oauth/authorize
- token_endpoint https://api.whatnot.com/seller-api/rest/oauth/token
- revocation_endpoint https://api.whatnot.com/seller-api/rest/oauth/revoke
- response_types: code; grant_types: authorization_code, refresh_token
- scopes_supported: full_access plus the 12 below.
An older page says refresh tokens last about a year and each refresh returns
a new refresh token and invalidates the used one (may have changed).
The hosted MCP server (https://mcp.whatnot.com) uses this flow with client id
bb1bf1ca-0452-4737-ad8f-81175f1601b8 and callback port 8080.
App registration and webhook subscriptions are done in the developer
dashboard, not through the REST API.

## Scopes (from the OpenAPI security scheme)

| Scope | Meaning (Whatnot's words) |
|---|---|
| read:inventory | Read your product inventory |
| write:inventory | Write to your product inventory |
| read:merchandising | Read how and where your products are sold |
| write:merchandising | Change how and where your products are sold |
| read:orders | Read your orders |
| write:orders | Write to your orders |
| read:shipments | Retrieve your shipment details |
| write:shipments | Make changes to your shipments (including generating a shipping label) |
| read:customers | Read your customer's information such as address, email, and phone number |
| read:reports | Read your financial reports |
| write:reports | Generate reports about your finances |
| read:shows | Read your shows |

Per operation, the reference text states a scope only for some operations.
Stated: get_show_analytics read:reports; merchandising write/read:merchandising;
list_a_product_s_shows read:merchandising + read:shows; orders read:orders,
cancel write:orders; reports read:reports / generate write:reports;
get_a_shipment read:shipments; add_a_tracking_code write:shipments;
dimension profiles read:inventory; shows read:shows.
Not stated (infer from the group): products, variants, inventory =
read:inventory / write:inventory; list/get shipments and items =
read:shipments; request_a_shipping_label = write:shipments;
get_the_current_user and disconnect = any token.
Without read:customers, buyer / recipient / destination_address / documents
fields come back null (webhooks page says so explicitly for payloads).
A 403 with type `missing-scope` carries `required_scopes`.

## Rate limits

- 10 requests per second per seller per connected app (may change).
  Observed in the recorded run through the MCP connector: `ratelimit-limit:
  2, 2;w=1`, so the connector has its own lower policy.
- Headers on counted requests: `RateLimit-Limit` (e.g. `10, 10;w=1`),
  `RateLimit-Remaining` (a hint), `RateLimit-Reset` (seconds). Uncounted
  requests (401 etc.) have none.
- 429 body: problem+json type `rate-limited`; `Retry-After` seconds (same as
  RateLimit-Reset). Wait at least that long; back off with jitter after
  repeats; pace backfills; use batch endpoints (inventory set/adjust and
  variant PATCH take up to 10 variants); cache slow-changing data.
- `X-Request-ID`: set your own or Whatnot generates one; quote it to support.

## Paging

Every list takes `limit` (1 to 50, default 10), `cursor` (the previous
page's `next_cursor`) and `reverse` (default true = newest first). Pages are
`{ "data": [...], "next_cursor": "..." | null }`. list_shows also takes
`status` (default scheduled); list_reports takes `status`.

## Errors (RFC 9457)

Most errors: `application/problem+json` with `type` (stable slug, branch on
it), `title`, `status`, `detail` (human, wording may change), plus extras
such as `param` or `required_scopes`. Exception: 422 validation errors are
`application/json` `{ "detail": [ { "loc": ["body"|"query"|"path", ...],
"msg", "type", "input", "ctx" } ] }`.
Statuses: 200 ok, 201 created, 204 no content, 207 batch accepted (check each
item), 400 malformed, 401 no/invalid token, 403 scope or enrollment, 404 not
found, 405 method, 409 state conflict, 422 validation, 429 rate limit, 500/503
server. Retry 429 and 5xx with backoff; never retry other 4xx unchanged; reuse
the same per-item `idempotency_key` on batch retries (only the inventory set and
adjust items carry one; variant updates have no such field).

Problem types: invalid-parameter, invalid-product, missing-scope,
product-not-found, product-not-deletable, seller-not-approved,
merchandising-rejected, variant-not-found, variants-disabled,
inventory-writes-disabled, variant-batch-rejected, shipment-not-found,
shipment-item-not-found, label-generation-rejected,
seller-verification-required, tracking-code-not-allowed,
tracking-code-rejected, invalid-tracking-code, dimension-profile-not-found,
show-not-found, order-not-found, order-not-cancellable, order-item-not-found,
disconnect-failed, malformed-request, unauthenticated, endpoint-not-found,
method-not-allowed, rate-limited, service-unavailable, internal-error,
about:blank (plain HTTP error with no Seller API type).

Observed: merchandising-rejected 422 "Add at least one image" and "Every
variant must have a price before this product can be merchandised." A 207
from set_inventory / update_product_variants comes back even when every item
succeeded; the body lists per-item results (`InventoryBatchResult.results`,
`VariantBatchResult.variants` + `errors`).

## Product lifecycle (Whatnot's own words, Products tag description)

Creating a product does not put it on sale. Variants are created with no
price, image or inventory. Order: 1) POST /products, 2) GET variants for ids,
3) PATCH variants with `price` (see "Variant pricing change" below) and
`media` (at most one image), POST
/inventory/set, 4) POST /merchandising/products/{id} with `transaction_type`
buy_it_now or auction and `shows`. Buy-it-now sells on the profile shop unless
`reserve_for_live` is true; auctions are always reserved for live. Every
variant must be priced for that format and at least one must have inventory.

## Variant pricing change (2026-11-05)

From Whatnot's email of 2026-11-05 and the reference pages read 2026-11-06
(ProductVariant, ProductVariantPatch, Money, VariantError, the PATCH
variants page). `openapi.json` beside this file is the 2026-10-31 copy and
still shows the old fields.

- Variants have one `price` (Money: `amount` string in major units, e.g.
  "42.00", and `currency` ISO 4217). It applies under the product's
  `transaction_type`. Send it in PATCH /products/{id}/variants and read it
  from ProductVariant.
- `pricing.buy_it_now` and `pricing.auction` are deprecated and gone from the
  reference. During migration `pricing` is still accepted: only the input
  matching the product's `transaction_type` is applied; if both are sent and
  differ, the other is ignored; if only a non-matching one is sent, the patch
  fails with `pricing_transaction_type_mismatch`. No end date given.
- VariantError codes now: `variant_not_found`, `variant_not_editable`,
  `variants_not_supported`, `pricing_transaction_type_mismatch`
  (`pricing_not_supported` is no longer listed).
- The saved fixtures were recorded 2026-10-31 and keep the old `pricing`
  shape as recorded.

## Webhooks (dashboard-configured, per app)

Topics and required scope: orders.created/updated (read:orders);
shows.created/updated/started/ended/cancelled (read:shows);
merchandising.products.added_to_show / removed_from_show (read:merchandising);
shipments.created / label_generated / tracking_code_added / parcel_updated /
items.added / items.removed (read:shipments); products.created / updated /
deleted (read:inventory). Customer fields null without read:customers.
Delivery: HTTPS POST, JSON. Headers `webhook-id` (same across retries),
`webhook-timestamp` (unix seconds, new per attempt), `webhook-signature`
(one or more `v1,<base64 HMAC-SHA256>`). Body envelope: `type`, `timestamp`
(ISO 8601 UTC ms), `data`, `version` "v2", `seller_id`.
Verify (Standard Webhooks): strip the `wn_wh_` prefix from the dashboard
secret, base64-decode it, HMAC-SHA256 over `{webhook-id}.{webhook-timestamp}.{raw body}`,
constant-time compare against each v1 entry, reject timestamps more than 5
minutes from your clock, use the raw bytes. Return 4xx on failure.
Delivery is at least once (dedupe by webhook-id), unordered, up to 11 retries
over about 2.5 days with backoff, 5 second timeout, only 2xx counts; failing
endpoints are throttled, emailed, then unsubscribed. Answer 2xx first,
process after, reconcile with the API now and then.

## Reports

Three CSV reports: financial (`seller_financial_report`, 33 columns), overview
analytics (`analytics_overview_report`, 23 columns), livestreams analytics
(`analytics_livestreams_report`, 25 columns). Column lists at
https://developers.whatnot.com/reports. `report_url` is a presigned CSV link
once the run completes (observed: valid 7 days).

## Taxonomy

Category ids for `create_a_product` come from the public taxonomy repo
https://github.com/Whatnot-Inc/product-taxonomy (`data/taxonomy.json`,
fields id, type, label, parent_id, allows_inventory, semver `version`).
Observed id 265 = Deal Hunting.
