# Webhooks

After reading this you will know what webhooks are, which events Whatnot can send you, and how to check that a message really came from Whatnot before you trust it.

Whatnot API Demo, a free tool by Mood Swings Design.

A webhook is Whatnot calling you. Instead of asking "any new orders?" over and over, you give Whatnot a web address, and Whatnot sends a message to it each time something happens. The explorer in this project does not receive webhooks. This page and `examples/webhook-receiver.mjs` are for people building their own tool.

## Setting them up

Webhooks are set up in the developer dashboard, **per app**. You add your HTTPS address, choose the topics you want and get a signing secret. They are not set up through the REST API. The secret starts with `wn_wh_`.

The address must be HTTPS. Whatnot sends each event as an HTTPS POST with a JSON body.

## Topics

Each topic needs a scope on the app (see `GETTING-A-TOKEN.md`). If the app does not have `read:customers`, buyer and address fields inside the payloads are `null`.

| Group | Topics | Scope needed |
|---|---|---|
| Orders | `orders.created`, `orders.updated` | `read:orders` |
| Shows | `shows.created`, `shows.updated`, `shows.started`, `shows.ended`, `shows.cancelled` | `read:shows` |
| Merchandising | `merchandising.products.added_to_show`, `merchandising.products.removed_from_show` | `read:merchandising` |
| Shipments | `shipments.created`, `shipments.label_generated`, `shipments.tracking_code_added`, `shipments.parcel_updated`, `shipments.items.added`, `shipments.items.removed` | `read:shipments` |
| Products | `products.created`, `products.updated`, `products.deleted` | `read:inventory` |

## What a delivery looks like

### Headers

| Header | Meaning |
|---|---|
| `webhook-id` | A unique id for this message. It is **the same on every retry** of the same message, so use it to spot duplicates. |
| `webhook-timestamp` | Unix time in seconds. It is **new on every attempt**. |
| `webhook-signature` | One or more signatures. Each looks like `v1,<base64 HMAC-SHA256>`. There can be more than one. |

### Body

Every message has the same envelope:

| Field | Meaning |
|---|---|
| `type` | The topic, such as `orders.created`. |
| `timestamp` | When the event happened, in ISO 8601 UTC with milliseconds. |
| `data` | The thing that changed. |
| `version` | Always `"v2"` for now. |
| `seller_id` | The seller the event is for. |

This guide does not describe the contents of `data` for each topic, and we have not recorded a live delivery.

## How to verify a webhook

Anyone who finds your address could post to it. The signature proves the message came from Whatnot and was not changed. Whatnot follows the Standard Webhooks method. There are five steps:

1. **Prepare the key.** Take the secret from the dashboard. **Remove the `wn_wh_` prefix first**, then base64-decode what is left. The bytes you get are the key. The trap: if you decode the whole string, prefix and all, you get the wrong key and every check fails.
2. **Check the clock.** Read `webhook-timestamp`. If it is more than 5 minutes away from your own clock, reject the message. This stops someone replaying an old one.
3. **Build the signed text.** Join three things with full stops: the `webhook-id`, the `webhook-timestamp` and the **raw request body**, exactly as the bytes arrived.
4. **Sign it.** Compute HMAC-SHA256 of that text with the key, and base64-encode the result.
5. **Compare.** Compare your result to each `v1` entry in `webhook-signature`, using a constant-time comparison (not `==`). If any one matches, the message is good. If none match, answer with a 4xx and do nothing else.

Use the raw bytes in step 3. If your web framework parses the JSON first and you re-serialise it, the spacing or key order can change and the signature will not match. Read the body untouched, verify it, then parse it.

A short sketch in Node:

```js
import { createHmac, timingSafeEqual } from "node:crypto";

function verify(secret, headers, rawBody) {
  const key = Buffer.from(secret.replace(/^wn_wh_/, ""), "base64");
  const id = headers["webhook-id"];
  const ts = headers["webhook-timestamp"];
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const expected = createHmac("sha256", key)
    .update(`${id}.${ts}.`)
    .update(rawBody)
    .digest();
  return headers["webhook-signature"].split(" ").some((entry) => {
    const [version, sig] = entry.split(",");
    if (version !== "v1") return false;
    const got = Buffer.from(sig, "base64");
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}
```

That sketch splits the signature header on spaces, which is what the Standard Webhooks method uses between entries.

## The example receiver

`examples/webhook-receiver.mjs` is a small Node program with no dependencies. It listens for Whatnot's deliveries and checks each signature using the steps above before it does anything with the message. It is the quickest way to see a working receiver. Open the file to see how to run it.

## How Whatnot delivers

- **At least once.** The same message can arrive more than once. Use `webhook-id` to skip ones you have already handled.
- **No promised order.** An `orders.updated` can arrive before the `orders.created` it follows. Do not assume order. If order matters, use the timestamps, or fetch the current state from the API.
- **Retries.** If your endpoint does not answer with a 2xx, Whatnot tries again, up to 11 times over about 2.5 days, with growing gaps. Only a 2xx counts as success.
- **Timeout.** Your endpoint has **5 seconds** to answer.
- **Failing endpoints.** An endpoint that keeps failing is throttled, then Whatnot emails you, and in the end it is unsubscribed.

## Good habits

- **Answer fast, work later.** Check the signature, answer 2xx at once, and do the real work afterwards (a queue, or just a background task). Slow work risks the 5 second timeout.
- **Dedupe on `webhook-id`.** Keep the ids you have seen for a while.
- **Reject bad signatures with a 4xx.** Do not process them.
- **Reconcile now and then.** Webhooks can be lost if you are down for longer than the retry window. Every so often, ask the API what changed (for example with `list_orders`, newest first) and fix any gaps.
- **Treat the body as untrusted until verified.**
- **Keep the secret secret**, like a token. See `GETTING-A-TOKEN.md` for what to do if something leaks.

## What Whatnot's pages do not say

- The fields inside `data` for each topic.
- What the retry gaps are, beyond "with backoff".
- How to rotate a webhook secret, or why a header might carry more than one signature.

Source: Whatnot's developer guide, gathered on 2026-10-31. Details are in `spec/NOTES.md`.
