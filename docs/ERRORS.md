# Errors

After reading this you will be able to read any error the Seller API sends, tell which ones are worth retrying, and make batch calls safe to repeat.

Whatnot API Demo, a free tool by Mood Swings Design.

## The usual error shape

Most errors come back as `application/problem+json` (the standard is RFC 9457). The fields are:

| Field | Meaning |
|---|---|
| `type` | A short, stable name for the kind of error, such as `order-not-found`. **Branch your code on this.** |
| `title` | A short human title. |
| `status` | The HTTP status, repeated in the body. |
| `detail` | A sentence for humans. Whatnot says the wording may change, so do not match on it. |
| extras | Some errors add fields, such as `param` (which input was wrong) or `required_scopes` (which permissions were missing). |

A real one, recorded in `fixtures/cancel_an_order.json`. We asked to cancel order `1`, an id that cannot belong to this seller, so nothing real was touched:

```json
{
  "type": "order-not-found",
  "title": "Order not found",
  "status": 404,
  "detail": "Order 1 was not found."
}
```

Another real one, from `fixtures/add_a_tracking_code_to_order_items.json`, with an extra `param` field:

```json
{
  "type": "invalid-parameter",
  "title": "Invalid parameter",
  "status": 422,
  "detail": "Order items 1 were not found.",
  "param": "order_item_ids"
}
```

## The validation shape (422)

There is one exception. When a request fails Whatnot's input checking, the 422 body is plain `application/json` and looks different:

```json
{
  "detail": [
    {
      "loc": ["body", "items", 0, "quantity"],
      "msg": "...",
      "type": "...",
      "input": "...",
      "ctx": {}
    }
  ]
}
```

This is the shape from Whatnot's OpenAPI document. We have not recorded a live one, so the values above are placeholders. Each entry in `detail` says where the problem is (`loc` starts with `body`, `query` or `path`, then the field), a message, an error type, the value you sent (`input`) and sometimes extra context (`ctx`). So handle two cases: a `detail` that is a string (problem+json) and a `detail` that is a list (validation).

## What each status means

| Status | Meaning | Retry? |
|---|---|---|
| 200 | OK. | n/a |
| 201 | Created. | n/a |
| 204 | OK, nothing to send back (the delete answers this). | n/a |
| 207 | Batch accepted. Some items may still have failed, so **check each item**. | Only the failed items. |
| 400 | The request was malformed. | No. Fix it. |
| 401 | No token, or an invalid or expired token. | No. Get a good token. |
| 403 | A missing scope, or the seller is not enrolled or approved for this. | No. |
| 403 with a Cloudflare body | Not from the Seller API at all. Whatnot sits behind Cloudflare, which blocks some default user agents (Python's `urllib` gets Cloudflare error 1010). The body is plain JSON with a `type` that is a Cloudflare support link. | Yes, after setting any `User-Agent` header, such as `whatnot-api-demo/1.0`. |
| 404 | Not found. | No. |
| 405 | Wrong HTTP method for that address. | No. |
| 409 | The thing is in a state that does not allow this. | No, unless the state changes. |
| 422 | The input did not validate, or the change was rejected. | No. Fix the input. |
| 429 | Too many requests. | Yes, after `Retry-After`. |
| 500, 503 | Whatnot had a problem. | Yes, with backoff. |

## The problem types

Whatnot publishes the list of `type` values. It does not describe each one in detail. The meanings below come from the type names and from the response descriptions in Whatnot's OpenAPI document. The ones marked "seen" we saw in a real answer.

| Type | Plain meaning | Likely fix |
|---|---|---|
| `invalid-parameter` | An input was wrong or unknown (seen: an unknown order item id, 422). | Read `param` and `detail`, correct that input. |
| `invalid-product` | The product data was not acceptable. | Check the product fields you sent. |
| `missing-scope` | Your token lacks a permission the call needs (403). | Read `required_scopes`, then add those scopes. See `GETTING-A-TOKEN.md`. |
| `product-not-found` | No such product for this seller (seen, 404). | Check the product id. |
| `product-not-deletable` | The product cannot be deleted in its current state (409). | Check the product's state, then try again. |
| `seller-not-approved` | The seller is not approved for this action, or it is not enabled (403). | Contact Whatnot. The pages do not say what approval means. |
| `merchandising-rejected` | The product is not ready to be put on sale (422, seen). | Fix what the answer lists. See the next section. |
| `variant-not-found` | No such variant (404). | Check the variant id. |
| `variants-disabled` | Variants are not available for this product or seller. | Check whether variants are switched on for your account. |
| `inventory-writes-disabled` | Inventory writes are not enabled for this seller (403). | Contact Whatnot. |
| `variant-batch-rejected` | A variant batch with partial updates off was refused as a whole (422). | Fix the bad entry, or set `allow_partial_updates` to true. |
| `shipment-not-found` | No such shipment (seen, 404). | Check the shipment id. |
| `shipment-item-not-found` | No such shipment item (404). | Check the item id. |
| `label-generation-rejected` | The shipment's state or settings stop a label being made (409). | Check the shipment and your shipping setup. |
| `seller-verification-required` | The seller must be verified first (403). | Finish verification with Whatnot. |
| `tracking-code-not-allowed` | The order items cannot take this tracking code (409). | Check the items and whether they already have one. |
| `tracking-code-rejected` | The tracking code was refused. | Check the code and the carrier. |
| `invalid-tracking-code` | The tracking code is not valid (422). | Correct the code. |
| `dimension-profile-not-found` | No such package size (404). | List them and pick an existing id. |
| `show-not-found` | No such show, or it belongs to another seller (404). | Check the show id. |
| `order-not-found` | No such order (seen, 404). | Check the order id. |
| `order-not-cancellable` | The order cannot be cancelled now (409). | Look at its status. |
| `order-item-not-found` | No such order item (404). | Check the item id. |
| `disconnect-failed` | The application could not be disconnected (500). | Try again later. |
| `malformed-request` | The request could not be read (400). | Check the JSON and the headers. |
| `unauthenticated` | No valid token (401, seen on the health check). | Send a good token. |
| `endpoint-not-found` | No such address (404). | Check the path. |
| `method-not-allowed` | Wrong HTTP method (405). | Check GET, POST, PATCH or DELETE. |
| `rate-limited` | Too many requests (429). | Wait `Retry-After`, then slow down. See `LIMITS-AND-PAGING.md`. |
| `service-unavailable` | Whatnot, or just that feature, is not available (503). | Retry with backoff. |
| `internal-error` | Something went wrong on Whatnot's side (500). | Retry with backoff. Quote the `X-Request-ID` if it persists. |
| `about:blank` | A plain HTTP error with no Seller API type. | Go by the status. |

## Two rejections seen live: merchandising-rejected

Putting a product in a show (`update_a_product_s_merchandising` with strategy ADD) can come back `422 merchandising-rejected`. Whatnot's reference says that when a product is not ready to publish, `errors` lists each field to fix. We met two reasons for it.

**No image.** The first attempt in the recorded run came back with the message "This product isn't ready to publish: 1 thing(s) to fix." and named the media field: "Add at least one image". Images are processed in the background, so if you just added one, wait a few seconds and try again. The retry in the recorded run went through about 9 seconds later.

**No price.** A later live run found the second rule: "Every variant must have a price before this product can be merchandised."

So a product needs an image and a price on every variant before it can go in a show. `RECIPES.md` puts the steps in the right order.

## Batch answers: 207

`set_inventory`, `adjust_inventory` and `update_product_variants` answer **207 Multi-Status**, even when every item worked. Always look inside.

Inventory calls return one result per item, in the same order as you sent them. This is a real excerpt from `fixtures/set_inventory.json`:

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

The item `status` is one of `applied`, `already_applied`, `variant_not_found`, `inventory_level_not_found` or `inventory_not_supported`. The only warning Whatnot lists is `result_clamped_to_zero`. It is a non-fatal note about the result being held at zero.

Variant updates return `variants` (the updated ones, in input order). From `fixtures/update_product_variants.json`:

```json
{
  "variants": [
    {
      "id": "4b774eda-39fe-4195-95d2-2e6c0e01b060",
      "product_id": "652907899",
      "sku": "APIDEMO-001",
      "pricing": {
        "buy_it_now": { "price": { "amount": "1", "currency": "USD" } },
        "auction": { "start_price": null }
      },
      "inventory": { "available_quantity": 0 },
      "media": []
    }
  ]
}
```

That excerpt leaves out a few empty fields. When you send `allow_partial_updates: true`, the answer may also carry an `errors` list for the patches that were not applied. Each has the patch `id`, a `code` (`variant_not_found`, `variant_not_editable`, `pricing_not_supported` or `variants_not_supported`) and a `message`. With `allow_partial_updates` false (the default), one bad entry rejects the whole batch with a 422 and nothing is written.

## Retry rules

- **Retry** 429 and 5xx errors, with backoff. For 429, wait at least `Retry-After` seconds first. Add a little random jitter.
- **Never retry any other 4xx unchanged.** It will fail the same way. Fix the cause first.
- **In a 207, retry only the failed items.**
- Keep a log of the `X-Request-ID` for anything that fails.

## idempotency_key: making a retry safe

Every item in `set_inventory` and `adjust_inventory` carries an `idempotency_key`. It is a label you make up. If an item with the same key is sent again, Whatnot applies it at most once and reports `already_applied` the second time. Keys belong to the seller. Use a new key for each distinct change, such as a random UUID, and **reuse the same key when you retry** the same change.

This matters most for `adjust_inventory`. If you send "minus 1" twice by mistake, stock drops by 2. With the same key on both sends, it drops by 1.

## What Whatnot's pages do not say

- How long an idempotency key is remembered.
- The exact JSON layout of the `errors` list inside a `merchandising-rejected` answer. The recorded run kept the message text, not the raw body.

Source: Whatnot's developer guide and its OpenAPI document, gathered on 2026-10-31, plus the recorded run. Details are in `spec/NOTES.md`.
