# Whatnot API Demo: shared contract

Project: `C:\Users\FirmB\Documents\MetaFour\whatnot-api-demo`
Product name in UI text: "Whatnot API Demo". Byline: "Mood Swings Design".
Owner: Andy (Whatnot seller `andysometa`, user id 1506502, USD, US).

## What this is

A small local tool that shows every function of Whatnot's Seller API
working for real. The Seller API is REST at
`https://api.whatnot.com/seller-api/rest/v2` (Bearer token). Whatnot also
hosts an MCP server at `https://mcp.whatnot.com` that exposes the same
34 functions to Claude. Andy has the MCP connected in Claude; he has no
REST token on disk. So:

- The **recorded run** (fixtures/) is made through the MCP connector by a
  Claude agent, once, against Andy's private test show.
- The **explorer app** shows each function, its request, the recorded live
  response, and can run it live against REST with a token the user pastes
  into the page (or `WHATNOT_API_KEY` in the environment).
- The **/whatnot-api skill** lets Claude re-run any function live through
  the MCP connector and refresh its fixture.

## The 34 functions (exact MCP tool names, after the connector prefix)

Tag Users: get_the_current_user, disconnect_the_current_application
Tag Shows: list_shows, get_a_show
Tag Analytics: get_show_analytics, generate_a_report, get_a_report, list_reports
Tag Products: list_products, create_a_product, get_a_product, update_a_product,
  delete_a_product, list_product_variants, get_a_product_variant,
  update_product_variants, list_a_product_s_shows
Tag Inventory: set_inventory, adjust_inventory
Tag Merchandising: get_a_product_s_merchandising, update_a_product_s_merchandising
Tag Shipping: list_dimension_profiles, get_a_dimension_profile
Tag Orders: list_orders, get_an_order, list_order_items, get_an_order_item,
  cancel_an_order, add_a_tracking_code_to_order_items
Tag Shipments: list_shipments, get_a_shipment, list_shipment_items,
  get_a_shipment_item, request_a_shipping_label

MCP connector tool prefix in Claude: `mcp__49be34e3-a436-4499-8096-f03eda44191f__`
Every MCP result is `{status, headers, body}` (raw HTTP). Rate limit header
seen: `ratelimit-limit: 2, 2;w=1` so pace at most 1 call per second.
Lists paginate with `limit` (1..50), `cursor`, `reverse`; responses carry
`data[]` and `next_cursor`.

## Safety classes

- `read`: GET only. Always safe to run.
- `write`: creates or changes Andy's own inventory data. Run only on the
  demo product this tool created (title starts with `API DEMO TEST ITEM`).
- `destructive`: cancel_an_order, add_a_tracking_code_to_order_items,
  request_a_shipping_label (costs money), delete_a_product,
  disconnect_the_current_application. Never run against real orders or
  shipments. The recorded run demonstrates the first three with an
  impossible id (`"1"`) so the real error response is captured
  (`mode: "error_demo"`). delete_a_product runs once, on the demo product.
  disconnect_the_current_application is never run (`mode: "not_run"`): it
  would break Andy's connector.

## Known ids (live, 2026-10-31)

- Private test show, LIVE: `086df56b-c77d-436d-bff5-5ac154016aac` ("Boring Show")
- A category that accepts simple items: `{"id":"265"}` (Deal Hunting)
- A Whatnot-owned dimension profile: `123059` ("0-1 oz", 1 ounce)
- A seller-owned dimension profile: `905466` ("Giveaway Envelope PWE")
- Existing products: 647559331, 646712667 (titles "5", "10")
- Orders and shipments exist but belong to real buyers: read only, and
  redact them in fixtures (see below).

## Fixture format

One file per function: `fixtures/<function_name>.json`

```json
{
  "function": "get_a_show",
  "tag": "Shows",
  "safety": "read",
  "mode": "live",
  "recorded_at": "2026-10-31T08:40:00.000Z",
  "args": { "show_id": "086df56b-c77d-436d-bff5-5ac154016aac" },
  "status": 200,
  "body": { "...": "the response body exactly as returned" },
  "note": "One or two plain sentences on what the call did and what the response shows."
}
```

`mode` is `live`, `error_demo` or `not_run`. For `not_run`, `status` and
`body` are null and `note` says why. `args` is exactly the object passed
to the MCP tool (so for body-taking calls it is `{"body": {...}}`, plus
path params such as `product_id`). Do not store the `headers` object.

Plus `fixtures/_run.json`:

```json
{
  "recorded_at": "...",
  "show_id": "086df56b-...",
  "demo_product_id": "...",
  "demo_variant_id": "...",
  "report_id": "...",
  "order": ["get_the_current_user", "list_shows", "..."],
  "cleanup": { "removed_from_show": true, "product_deleted": true },
  "notes": ["anything surprising"]
}
```

### Redaction (required)

In orders, order items, shipments and shipment items: replace
`buyer.username`, `buyer.display_name`, `recipient.username`,
`recipient.display_name` with `"redacted"`, and set any
`destination_address` or address-like object to `null`. Keep ids, amounts,
statuses, timestamps and tracking codes. Products and shows are Andy's own
and need no redaction.

## Explorer app contract

- Node 22+, zero npm dependencies, ESM (`"type": "module"`).
- `npm start` runs `node server.mjs`, default port **7490** (env `PORT`).
  Never 7474, 7475, 7477, 7480 or 3000 (other projects on this machine).
- `catalog.mjs` exports `FUNCTIONS`: one entry per function with
  `name`, `tag`, `safety`, `method`, `path` (REST path with `{param}`
  placeholders under the v2 base), `summary` (one plain sentence for a
  non-programmer), `params` (path + query), `body` (shape, from the MCP
  schema), and `demo` (default args using tokens `{{SHOW_ID}}`,
  `{{PRODUCT_ID}}`, `{{VARIANT_ID}}`, `{{REPORT_ID}}` resolved from
  `_run.json` at runtime).
- `GET /api/catalog`, `GET /api/fixtures` (all), `GET /api/fixtures/:name`,
  `POST /api/run` `{name, args, allowWrites?, confirm?}` proxies to REST
  with the Bearer token. The token comes from the `X-Whatnot-Token` request
  header first, then env `WHATNOT_API_KEY`, trimmed; over 4096 characters
  (or containing spaces or control characters) is a 400. With neither it
  answers 409 `{error:"no_token"}` and the UI says so plainly. `write`
  needs `allowWrites: true` (boolean) in the POST, or env
  `ALLOW_WRITES=true` for the old setup; `destructive` additionally needs
  `confirm: true` (boolean); `disconnect_the_current_application` is
  refused always. The token is never logged, stored or echoed, and any copy
  in a reply or error becomes `[token]`. `GET /api/status` reports only
  whether an env token exists.
- Origin: the server binds 127.0.0.1 and sends no CORS headers. Any request
  whose `Origin` header is present and is not `http://localhost:<port>` or
  `http://127.0.0.1:<port>` gets 403 `{error:"bad_origin"}`.
- Token section in the UI: password input, Save token, Clear, Test token
  (runs get_the_current_user, shows "Signed in as <username>" or Whatnot's
  error in plain words), and "Remember on this computer" (off: the token is
  in sessionStorage; on: localStorage). The status line shows at most the
  last four characters. Write functions show the "I understand this changes
  data on my Whatnot account" box (resets per function); destructive ones
  add the red confirm box.
- UI at `/`: functions grouped by tag on the left; detail on the right with
  summary, method + path, args editor (JSON textarea prefilled from demo),
  the recorded response (status + pretty body), and a "Run live" button.
  Also a "Tour" view that steps through the recorded run in `_run.json`
  order. Keyboard reachable, works at 1000 px wide and up, dark and light.
- Tests: `npm test` runs `node --test "test/*.test.mjs"`. Cover: catalog has exactly the
  34 names above with no duplicates; every entry has the required fields;
  server routes with an injected fake fetch (token missing, write gate,
  destructive gate, disconnect always refused, token passed as Bearer,
  header token beats env, over-long token, Origin check, no token in
  errors);
  fixture loader tolerates a missing fixtures folder.

## Rules

- No em dashes anywhere (code, comments, UI, docs). Use commas or full stops.
- No "Cadance", "Cadence", "Wave", "Claude" or "AI" in UI text. (The README
  and skill may say "Claude" since they describe the connector.)
- Scratch files go in the agent's scratchpad, not in this project.
- This folder is its own git repo. Agents do not run git here; the main session commits.
- Nothing is posted to Whatnot chat and nothing is clicked in Whatnot.
  The only Whatnot writes allowed are the Seller API calls described
  above, on the demo product only.

## Developer additions (third pass, 2026-10-31)

Source of truth for API facts: `spec/NOTES.md` (gathered from
developers.whatnot.com) and `spec/openapi.json` (Whatnot's OpenAPI 3.1
document, version 2.0.0, 35 operations: our 34 plus `GET /` health check,
which also needs a token and is not in the connector).

- `catalog.mjs`: every function carries `scopes: { required: [...], inferred }`
  and the orders/shipments reads carry `customerFields: true`; `SCOPES` lists
  the 12 scopes with Whatnot's meaning.
- `ui/snippets.mjs`: `buildSnippets()` returns curl, JavaScript (Node fetch),
  Python (stdlib) and a raw HTTP request for the selected function and the
  current args. The token never appears; snippets read `WHATNOT_API_KEY`.
- Explorer detail: Permissions line, Code block with four tabs and Copy,
  live results show the RateLimit headers and the request id.
- `server.mjs`: sends `X-Request-ID`, returns a whitelisted `headers` object
  with a live result (ratelimit-*, retry-after, x-request-id, content-type).
- `docs/`: GETTING-A-TOKEN, LIMITS-AND-PAGING, ERRORS, WEBHOOKS, RECIPES.
- `examples/`: first-call (Node and Python), list-all-products (paging),
  verify-webhook + webhook-receiver + send-test-webhook (port 7491 default).
- Rate limit per the guide is 10 per second per seller per app; the recorded
  connector run saw a 2 per second policy. The proxy still paces to 1 per
  second.
