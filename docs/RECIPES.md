# Recipes

After reading this you will be able to chain Seller API functions to get five real jobs done: make a first call, put a product in a show, handle orders after a show, keep stock in sync, and pull month-end numbers.

Whatnot API Demo, a free tool by Mood Swings Design.

Each recipe gives the goal, the functions in order, a curl for each step, and a real answer excerpt from `fixtures/` where we have one. Fixture answers were recorded on 2026-10-31 on a private test show. Long fields are trimmed with `...`, and buyer names are blanked ("redacted").

## Before you start

Put your token in an environment variable and set the API address. Never paste a real token into a file you share. See `GETTING-A-TOKEN.md` for how to get one and which permissions each recipe needs.

```bash
export WHATNOT_API_KEY="paste-your-token-here"
export BASE="https://api.whatnot.com/seller-api/rest/v2"
```

In PowerShell the same two lines are:

```powershell
$env:WHATNOT_API_KEY = "paste-your-token-here"
$env:BASE = "https://api.whatnot.com/seller-api/rest/v2"
```

All the curl examples below use the bash form. Words in capitals, such as `PRODUCT_ID`, are placeholders for ids you get from an earlier step. Ids are text, so keep them in quotes inside JSON.

Several recipes **change your real account**. Whatnot has no documented test environment. Use a clearly named test product, as the recorded run did.

---

## Recipe A: your first call

**Goal.** Prove your token works, then look at your shows.

**Permissions.** Any valid token for step 1. `read:shows` for step 2.

**Functions in order.** `get_the_current_user`, then `list_shows`.

### Step 1: who am I?

```bash
curl -s "$BASE/users/me" \
  -H "Authorization: Bearer $WHATNOT_API_KEY"
```

Real answer (`fixtures/get_the_current_user.json`, ids, names and the image link redacted):

```json
{
  "id": "redacted",
  "username": "redacted",
  "display_name": "redacted",
  "image": { "id": "redacted", "url": "redacted", "alt": null },
  "seller_currency": "USD",
  "country_code": "US",
  "can_go_live": true
}
```

If you get a 401 instead, the token is wrong, expired or deleted. See `ERRORS.md`.

### Step 2: list my shows

Without `status`, you only get `scheduled` shows. Here we ask for live ones.

```bash
curl -s "$BASE/shows?status=live&limit=5" \
  -H "Authorization: Bearer $WHATNOT_API_KEY"
```

Real answer (`fixtures/list_shows.json`, trimmed):

```json
{
  "data": [
    {
      "id": "086df56b-c77d-436d-bff5-5ac154016aac",
      "title": "Boring Show",
      "description": null,
      "status": "live",
      "visibility": "private",
      "scheduled_start_at": "2026-10-31T08:20:07.760Z",
      "ended_at": null
    }
  ],
  "next_cursor": null
}
```

Keep a show `id`. Recipe B uses it as `SHOW_ID`.

---

## Recipe B: put a product in a show

**Goal.** Create a product and get it into a show so buyers can buy it.

**Permissions.** `write:inventory` and `write:merchandising`. Also `read:shows` for the last step.

**Functions in order.** `create_a_product`, `list_product_variants`, `update_product_variants`, `set_inventory`, `update_a_product_s_merchandising` (strategy ADD), `list_a_product_s_shows`.

**The two rules.** Creating a product does **not** put it on sale. A new product's variant starts with no price, no image and no stock. Whatnot will refuse to put a product in a show until it has:

1. **an image**, and
2. **a price on every variant** (for the format you are selling in).

At least one variant must also have stock. So do image and price first, then merchandise last.

### Step 1: create the product

You need a category id and a package size (dimension profile). The recorded run used category `265` and package size `123059`. Category ids come from Whatnot's public taxonomy at https://github.com/Whatnot-Inc/product-taxonomy. Package sizes come from `list_dimension_profiles`.

```bash
curl -s -X POST "$BASE/products" \
  -H "Authorization: Bearer $WHATNOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "API DEMO TEST ITEM (safe to delete)",
    "description": "A test item. Delete me.",
    "category": { "id": "265" },
    "dimension_profile": { "id": "123059" },
    "external_id": "api-demo-2026-10-31"
  }'
```

Real answer, status 201 (`fixtures/create_a_product.json`, trimmed). Keep the `id` as `PRODUCT_ID`:

```json
{
  "id": "652907899",
  "title": "API DEMO TEST ITEM (safe to delete)",
  "category": { "id": "265", "name": "Deal Hunting" },
  "options": [],
  "media": [],
  "dimension_profile": { "id": "123059", "name": "0-1 oz", "ownership": "whatnot", "active": true }
}
```

### Step 2: find the variant id

A product with no options gets one default variant.

```bash
curl -s "$BASE/products/PRODUCT_ID/variants" \
  -H "Authorization: Bearer $WHATNOT_API_KEY"
```

Real answer (`fixtures/list_product_variants.json`). Note the empty price and zero stock:

```json
{
  "data": [
    {
      "id": "4b774eda-39fe-4195-95d2-2e6c0e01b060",
      "product_id": "652907899",
      "sku": null,
      "pricing": { "buy_it_now": { "price": null }, "auction": { "start_price": null } },
      "inventory": { "available_quantity": 0 },
      "media": []
    }
  ],
  "next_cursor": null
}
```

This answer was recorded on 2026-10-31. On 2026-11-05 Whatnot moved variant pricing to a single `price` field, so its current docs show `price` (an amount and a currency, or null) where this shows the `pricing` block.

Keep the variant `id` as `VARIANT_ID`.

### Step 3: give it a price and an image

`update_product_variants` takes up to 10 variants. Each variant has one `price`, in whole currency units, written as text. It applies under the product's `transaction_type`, so the same field sets a buy it now price or an auction start price. The older `pricing.buy_it_now.price` and `pricing.auction.start_price` fields are deprecated. Whatnot still accepts them for now, but only the one that matches the product's `transaction_type` is applied, and sending only the one that does not match fails with `pricing_transaction_type_mismatch`. The `media` list takes exactly one image, as a URL. Image processing happens in the background, so the new image may not show in the answer straight away.

```bash
curl -s -X PATCH "$BASE/products/PRODUCT_ID/variants" \
  -H "Authorization: Bearer $WHATNOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "allow_partial_updates": false,
    "variants": [
      {
        "id": "VARIANT_ID",
        "sku": "APIDEMO-001",
        "price": { "amount": "1", "currency": "USD" },
        "media": [ { "url": "https://example.com/photo.jpg" } ]
      }
    ]
  }'
```

Real answer, status **207** (`fixtures/update_product_variants.json`, which set the SKU and price only). A 207 comes back even when everything worked, so check the items. See `ERRORS.md`.

```json
{
  "variants": [
    {
      "id": "4b774eda-39fe-4195-95d2-2e6c0e01b060",
      "sku": "APIDEMO-001",
      "pricing": {
        "buy_it_now": { "price": { "amount": "1", "currency": "USD" } },
        "auction": { "start_price": null }
      },
      "inventory": { "available_quantity": 0 }
    }
  ]
}
```

This answer was recorded on 2026-10-31. On 2026-11-05 Whatnot moved variant pricing to a single `price` field, so its current docs show `price` (an amount and a currency, or null) where this shows the `pricing` block.

### Step 4: set the stock

`idempotency_key` is a label you make up. Sending the same key twice applies the change once.

```bash
curl -s -X POST "$BASE/inventory/set" \
  -H "Authorization: Bearer $WHATNOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      { "variant_id": "VARIANT_ID", "quantity": 2, "idempotency_key": "my-set-0001" }
    ]
  }'
```

Real answer, status 207 (`fixtures/set_inventory.json`):

```json
{
  "results": [
    {
      "variant_id": "4b774eda-39fe-4195-95d2-2e6c0e01b060",
      "idempotency_key": "api-demo-set-1",
      "status": "applied",
      "previous_quantity": 0,
      "new_quantity": 2,
      "warnings": []
    }
  ]
}
```

### Step 5: add it to the show

`transaction_type` is `buy_it_now` or `auction`. A buy-it-now product is sold on your profile shop unless `reserve_for_live` is true. Auctions are always reserved for live. The strategy is `ADD` (keep its other shows and add these), `REMOVE`, or `REPLACE`, with up to 25 show ids.

```bash
curl -s -X POST "$BASE/merchandising/products/PRODUCT_ID" \
  -H "Authorization: Bearer $WHATNOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "transaction_type": "buy_it_now",
    "reserve_for_live": true,
    "shows": { "strategy": "ADD", "show_ids": ["SHOW_ID"] }
  }'
```

Real answer, status 200 (`fixtures/update_a_product_s_merchandising.json`). Note the request says `reserve_for_live` and the answer says `reserved_for_live`. The answer does not list the shows.

```json
{
  "product_id": "652907899",
  "transaction_type": "buy_it_now",
  "reserved_for_live": true
}
```

If you get `422 merchandising-rejected` here, the product is missing an image or a price. The recorded run hit both. Fix it and send the same call again. If you only just added the image, wait a few seconds first.

### Step 6: check which shows it is in

Since the answer above does not list shows, ask:

```bash
curl -s "$BASE/merchandising/products/PRODUCT_ID/shows" \
  -H "Authorization: Bearer $WHATNOT_API_KEY"
```

Real answer (`fixtures/list_a_product_s_shows.json`): a page of full show records, here exactly one, "Boring Show". An empty `data` list means it is in no show.

To take the product back out, use the same merchandising call with `"shows": { "strategy": "REMOVE", "show_ids": ["SHOW_ID"] }`. (`fixtures/update_a_product_s_merchandising.remove.json` is the real answer.)

---

## Recipe C: after the show

**Goal.** See what sold, then mark orders as shipped.

**Permissions.** `read:orders` and `read:shipments`. Add `read:customers` to see buyer names and addresses. Without it those fields are `null`. The last step needs `write:shipments`.

**Functions in order.** `list_orders`, `get_an_order`, `list_order_items`, `list_shipments`, then **either** `request_a_shipping_label` **or** `add_a_tracking_code_to_order_items`.

### Step 1: list the newest orders

```bash
curl -s "$BASE/orders?limit=10" \
  -H "Authorization: Bearer $WHATNOT_API_KEY"
```

Real answer (`fixtures/list_orders.json`, one order, trimmed; the buyer is blanked here):

```json
{
  "data": [
    {
      "id": "1485136575",
      "status": "failed",
      "show_id": "b2bf815b-ea29-4247-a64b-15ddc7bfebc1",
      "transaction_type": "buy_it_now",
      "buyer": { "id": "redacted", "username": "redacted", "display_name": "redacted" },
      "amounts": {
        "subtotal": { "amount": "4", "currency": "USD" },
        "shipping": { "amount": "0", "currency": "USD" },
        "tax": { "amount": "0.25", "currency": "USD" },
        "applied_discount": null,
        "total": { "amount": "0", "currency": "USD" }
      },
      "created_at": "2026-10-28T05:09:54.623Z",
      "cancelled_at": null
    }
  ],
  "next_cursor": "gAAAAABq5aee..."
}
```

Look at `status`. All the recorded orders were `failed` ones. Pass `next_cursor` back as `cursor` to see more (see `LIMITS-AND-PAGING.md`).

### Step 2: open one order

```bash
curl -s "$BASE/orders/ORDER_ID" \
  -H "Authorization: Bearer $WHATNOT_API_KEY"
```

You get one order record like the ones above.

### Step 3: see what was in it

```bash
curl -s "$BASE/orders/ORDER_ID/items" \
  -H "Authorization: Bearer $WHATNOT_API_KEY"
```

Real answer (`fixtures/list_order_items.json`, trimmed):

```json
{
  "data": [
    {
      "id": "1485132344",
      "order_id": "1485136575",
      "product_id": "645510725",
      "purchased_item": { "title": "Kayou My Little Pony Trading Card Game ...", "sku": null },
      "quantity": 1,
      "unit_price": { "amount": "4", "currency": "USD" },
      "shipment_id": null
    }
  ],
  "next_cursor": null
}
```

An item's `shipment_id` is `null` until it is part of a shipment. Keep the item `id` values. You need them to add tracking.

### Step 4: list shipments

```bash
curl -s "$BASE/shipments?limit=10" \
  -H "Authorization: Bearer $WHATNOT_API_KEY"
```

Real answer (`fixtures/list_shipments.json`, one shipment, trimmed). Here the address is `null` and the recipient is blanked:

```json
{
  "id": "519027322",
  "status": "in_transit",
  "fulfillment_method": "shipping",
  "recipient": { "id": "redacted", "username": "redacted", "display_name": "redacted" },
  "destination_address": null,
  "weight": { "value": 12, "unit": "ounce" },
  "tracking": {
    "carrier": "usps",
    "service": "usps_first_class_package_international_service",
    "tracking_code": "redacted"
  },
  "seller_paid_shipping_cost": { "amount": "0", "currency": "USD" }
}
```

### Step 5: ship it. Read this first.

> **These two calls are real.** One spends your money. The other tells a buyer their order has shipped. Neither can be taken back easily. The recorded run only ever sent them with the impossible id `1`, so Whatnot answered "not found" and nothing happened. Only do these on a real order you actually mean to ship, and check the id twice.

**Option 1: buy a label through Whatnot** (`write:shipments`). **This costs real money.** No body is needed.

```bash
curl -s -X POST "$BASE/shipments/SHIPMENT_ID/generate_label" \
  -H "Authorization: Bearer $WHATNOT_API_KEY"
```

Whatnot answers with the shipment id to say the request was accepted. Its pages do not say more about the label. The recorded error, with the impossible id (`fixtures/request_a_shipping_label.json`):

```json
{
  "type": "shipment-not-found",
  "title": "Shipment not found",
  "status": 404,
  "detail": "Shipment 1 was not found."
}
```

**Option 2: you bought the label yourself, so add the tracking code** (`write:shipments`). Up to 100 order items per call, one carrier, one code.

```bash
curl -s -X POST "$BASE/shipments/add_tracking_code" \
  -H "Authorization: Bearer $WHATNOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "order_item_ids": ["ORDER_ITEM_ID"],
    "tracking_code": "YOUR_TRACKING_CODE",
    "carrier": "usps"
  }'
```

The recorded error, with the impossible id (`fixtures/add_a_tracking_code_to_order_items.json`, status 422):

```json
{
  "type": "invalid-parameter",
  "title": "Invalid parameter",
  "status": 422,
  "detail": "Order items 1 were not found.",
  "param": "order_item_ids"
}
```

If an order has to be cancelled, `cancel_an_order` (`POST /orders/ORDER_ID/cancel`, needs `write:orders`) takes a reason: `item_damaged`, `item_sold`, `item_missing`, `break_did_not_fill` or `other`. That also affects a real buyer. See `ERRORS.md` for the real "not found" answer.

---

## Recipe D: keep stock in sync

**Goal.** Make Whatnot's stock match your own system, without hitting the rate limit.

**Permissions.** `read:inventory` to read, `write:inventory` to set stock.

**Functions in order.** `list_products` (paged), `list_product_variants`, `set_inventory` (batches of 10).

### Step 1: walk through all your products

Ask for 50 at a time. Loop until `next_cursor` is `null`.

```bash
curl -s "$BASE/products?limit=50" \
  -H "Authorization: Bearer $WHATNOT_API_KEY"

# next page: pass the next_cursor from the answer
curl -s -G "$BASE/products" \
  --data-urlencode "limit=50" \
  --data-urlencode "cursor=PASTE_NEXT_CURSOR_HERE" \
  -H "Authorization: Bearer $WHATNOT_API_KEY"
```

Real answer (`fixtures/list_products.json`, first product, trimmed):

```json
{
  "id": "647559331",
  "title": "5",
  "external_id": null,
  "category": { "id": "8", "name": "Yu-Gi-Oh! Cards" },
  "options": [],
  "dimension_profile": { "id": "905466", "name": "Giveaway Envelope PWE", "ownership": "seller" }
}
```

Match each product to your own records using `external_id` (a field you set yourself) or `sku`. Cache the mapping so you do not re-fetch it every time.

### Step 2: get each product's variants

Stock lives on variants, not products. Each variant has `inventory.available_quantity`.

```bash
curl -s "$BASE/products/PRODUCT_ID/variants" \
  -H "Authorization: Bearer $WHATNOT_API_KEY"
```

Keep a list of `VARIANT_ID` against your own stock count.

### Step 3: set stock, ten at a time

Send up to 10 variants per call. Give every item its own `idempotency_key`. If a call fails with a 5xx or 429, **send the same call again with the same keys**. Items that already went through then report `already_applied` instead of happening twice.

```bash
curl -s -X POST "$BASE/inventory/set" \
  -H "Authorization: Bearer $WHATNOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      { "variant_id": "VARIANT_ID_1", "quantity": 12, "idempotency_key": "sync-2026-10-31-0001" },
      { "variant_id": "VARIANT_ID_2", "quantity": 0,  "idempotency_key": "sync-2026-10-31-0002" }
    ]
  }'
```

Check each item in the 207 answer (see `fixtures/set_inventory.json` in Recipe B). A `status` other than `applied` or `already_applied` needs a look.

Use `set_inventory` when you know the right total. Use `adjust_inventory` (`POST /inventory/adjust`, items with `variant_id`, `delta` and `idempotency_key`) when you only know the change, such as minus 1 after an offline sale. The recorded run took stock from 2 to 1 with a `delta` of -1.

Pace yourself. The limit is 10 requests a second, so a full sync of 1,000 variants is 100 set calls. Space them out. See `LIMITS-AND-PAGING.md`.

---

## Recipe E: month end

**Goal.** Get a financial report for the month, then look at one show's numbers.

**Permissions.** `write:reports` to ask for a report. `read:reports` to check on it, list reports and read show analytics.

**Functions in order.** `generate_a_report`, `list_reports`, `get_a_report`, download the CSV, `get_show_analytics`.

### Step 1: ask for the report

Three kinds exist: `seller_financial_report` (what you earned), `analytics_overview_report` and `analytics_livestreams_report`. For the financial one, give a start and end date in this exact form (UTC, with milliseconds).

```bash
curl -s -X POST "$BASE/reports" \
  -H "Authorization: Bearer $WHATNOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "report_parameters": {
      "report_type": "seller_financial_report",
      "start_date": "2026-10-01T00:00:00.000Z",
      "end_date": "2026-10-31T00:00:00.000Z"
    }
  }'
```

Real answer, status 201, for a livestreams report on the test show (`fixtures/generate_a_report.json`). The report is built in the background, so it starts out `pending` with no link. Keep the `id` as `REPORT_ID`.

```json
{
  "id": "01a1911a-8d28-773c-a427-ae298ad31906",
  "report_type": "analytics_livestreams_report",
  "status": "pending",
  "report_url": null,
  "created_at": "2026-10-31T08:36:38.824Z"
}
```

### Step 2: find it again later

If you lose the id, list your reports. Newest first. `status` is optional.

```bash
curl -s "$BASE/reports?status=completed&limit=10" \
  -H "Authorization: Bearer $WHATNOT_API_KEY"
```

### Step 3: check on it

Statuses are `pending`, `in_progress`, `completed`, `failed` and `cancelled`. Poll every few seconds until it is `completed`.

```bash
curl -s "$BASE/reports/REPORT_ID" \
  -H "Authorization: Bearer $WHATNOT_API_KEY"
```

Real answer, a few seconds later (`fixtures/get_a_report.json`). It was already `completed`. In the saved copy the link is blanked, because the real one is a signed download link.

```json
{
  "id": "01a1911a-8d28-773c-a427-ae298ad31906",
  "report_type": "analytics_livestreams_report",
  "status": "completed",
  "report_url": "redacted (signed 7-day download link to the CSV ...)",
  "updated_at": "2026-10-31T08:36:39.357Z"
}
```

### Step 4: download the CSV within 7 days

`report_url` is a signed link to a CSV file. In the recorded run it was valid for 7 days. After that, call `get_a_report` again for a fresh one, or generate the report again. The link is already signed, so it does not need your token, and you should not send your token to it.

```bash
curl -s -L "REPORT_URL" -o october-financial-report.csv
```

Whatnot lists the CSV columns at https://developers.whatnot.com/reports. The financial report has 33 columns, the overview analytics one 23 and the livestreams one 25.

### Step 5: one show's numbers

```bash
curl -s "$BASE/analytics/shows/SHOW_ID" \
  -H "Authorization: Bearer $WHATNOT_API_KEY"
```

Real answer for the private test show (`fixtures/get_show_analytics.json`, trimmed). Whatnot says `WILL_NOT_BE_CALCULATED`, so every number is `null`. An ordinary show gets real figures in the same fields: sales, orders count, buyers count, total views and more.

```json
{
  "show_id": "086df56b-c77d-436d-bff5-5ac154016aac",
  "title": "Boring Show",
  "calculation_status": "WILL_NOT_BE_CALCULATED",
  "sales": null,
  "orders_count": null,
  "buyers_count": null,
  "total_views": null
}
```

Check `calculation_status` before you trust the numbers. Buyer names are not in this answer, only counts. Names live in the orders from Recipe C, and those need `read:customers`.

---

## What Whatnot's pages do not say

- How long a report takes. The recorded one was `completed` about 17 seconds after it was requested.
- Which `calculation_status` values exist besides `WILL_NOT_BE_CALCULATED`, or how long after a show the numbers are ready.
- What the response to a successful label request contains beyond the shipment id.

Source: Whatnot's developer guide and its OpenAPI document, gathered on 2026-10-31, plus the recorded run in `fixtures/`. Details are in `spec/NOTES.md`.
