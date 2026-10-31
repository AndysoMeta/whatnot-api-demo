# Limits and paging

After reading this you will know how fast you may call the Seller API, what to do when Whatnot says "slow down", and how to walk through a long list one page at a time.

Whatnot API Demo, a free tool by Mood Swings Design.

## The rate limit

Whatnot allows **10 requests per second, per seller, per connected app**. Whatnot says this number may change, so read the headers (below) instead of hard-coding it.

"Per seller per app" means two things. Two different apps working on the same seller each get their own allowance. One app working on two sellers also gets a separate allowance for each.

### The three headers

Requests that count against the limit come back with these headers:

| Header | What it tells you |
|---|---|
| `RateLimit-Limit` | The policy, for example `10, 10;w=1`. That reads as "10 requests in a window of 1 second". |
| `RateLimit-Remaining` | How many requests you have left in this window. Whatnot calls it a hint, so do not treat it as exact. |
| `RateLimit-Reset` | How many seconds until the window resets. |

Requests that do not count, such as a 401 for a bad token, carry none of these headers.

### When you go over: 429

If you send too many, Whatnot answers **429 Too Many Requests**. The body is a `problem+json` error with type `rate-limited` (see `ERRORS.md`). The response has a `Retry-After` header, in seconds. It is the same number as `RateLimit-Reset`.

What to do:

1. **Wait** at least as long as `Retry-After` says.
2. **Back off with jitter** if it keeps happening. That means waiting a little longer each time, plus a small random amount, so that several workers do not all retry at the same instant.
3. **Pace big jobs.** If you are syncing thousands of products, spread the calls out instead of firing them as fast as you can.
4. **Batch.** `set_inventory`, `adjust_inventory` and `update_product_variants` each take up to 10 variants in one request. One call instead of ten.
5. **Cache** data that rarely changes, such as categories and package sizes (dimension profiles). Do not fetch them again for every product.

### What this tool does

The explorer's local server paces your live runs to **one call a second**, which is well under the limit. If Whatnot does answer 429, the server waits for `Retry-After` once and tries the call one more time. If that also fails, you see what Whatnot said.

### The connector is lower

The recorded run in `fixtures/` was made through the Whatnot connector (the hosted MCP server), not straight against the REST API. On every call it saw `ratelimit-limit: 2, 2;w=1`, which is 2 requests per second. So the connector appears to have its own, lower policy. The recorded run never went below 1 remaining and never saw a 429. Whatnot's pages do not explain the difference. If you call the REST API with your own token, the documented figure is 10 per second.

### Request ids

`X-Request-ID` is a label for one request. You can send your own. If you do not, Whatnot generates one. If you ever need help from Whatnot support, quote that id.

## Paging

Every list function returns a page of results, not everything at once. The list functions are `list_shows`, `list_reports`, `list_products`, `list_product_variants`, `list_a_product_s_shows`, `list_dimension_profiles`, `list_orders`, `list_order_items`, `list_shipments` and `list_shipment_items`.

### The inputs

| Input | Meaning |
|---|---|
| `limit` | How many results you want, from 1 to 50. The default is 10. |
| `cursor` | A marker for where to carry on. Leave it out for the first page. For the next page, pass the `next_cursor` from the previous answer. |
| `reverse` | The default is `true`, which means newest first. Send `false` for oldest first. |

`list_shows` also takes `status` (`scheduled`, `live`, `stopped`, `ended` or `cancelled`). If you leave it out you get `scheduled` shows only. `list_reports` also takes `status`.

### The shape of a page

Every page looks like this:

```json
{
  "data": [ { "id": "..." }, { "id": "..." } ],
  "next_cursor": "gAAAAABq5aeeGHLTAWWd..."
}
```

`data` is the list. `next_cursor` is a string when there is more to fetch, and `null` when you have reached the end. A real list from `fixtures/list_orders.json` (three orders, with `limit: 3`) ended with a long `next_cursor` string, so there were more orders to read. `fixtures/list_shows.json` came back with `"next_cursor": null`, so that list was complete.

Treat the cursor as an opaque string. Do not try to read it, build one, or store it for long. Pass it back exactly as you got it.

### A paging loop, in words

1. Ask for the first page with the `limit` you want and no `cursor`.
2. Handle everything in `data`.
3. Look at `next_cursor`. If it is `null`, stop.
4. Otherwise ask again with the same inputs plus `cursor` set to that value.
5. Go back to step 2.

Keep `limit` and `reverse` the same on every page of one walk. Pace yourself between pages (see above).

### Example: fetch page two with curl

First page, three orders:

```bash
curl -s "https://api.whatnot.com/seller-api/rest/v2/orders?limit=3" \
  -H "Authorization: Bearer $WHATNOT_API_KEY"
```

Copy the `next_cursor` from that answer, then ask for the next page:

```bash
curl -s "https://api.whatnot.com/seller-api/rest/v2/orders?limit=3&cursor=PASTE_NEXT_CURSOR_HERE" \
  -H "Authorization: Bearer $WHATNOT_API_KEY"
```

If the cursor has characters that need escaping in a URL, pass it with `--data-urlencode` and `-G` instead:

```bash
curl -s -G "https://api.whatnot.com/seller-api/rest/v2/orders" \
  --data-urlencode "limit=3" \
  --data-urlencode "cursor=PASTE_NEXT_CURSOR_HERE" \
  -H "Authorization: Bearer $WHATNOT_API_KEY"
```

Add `-i` to any of these to see the response headers, including the `RateLimit-*` ones and `X-Request-ID`.

## What Whatnot's pages do not say

- How long a cursor stays valid.
- Whether the rate limit window is a sliding one or a fixed one. They only say the window is one second.
- Why the connector's policy is lower than the REST API's.

Source: Whatnot's developer guide and its OpenAPI document, gathered on 2026-10-31, plus the recorded run. Details are in `spec/NOTES.md`.
