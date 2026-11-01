# Examples

Part of the Whatnot API Demo, a free tool by Mood Swings Design.

Small starting points you can copy into your own project. Each one is a single
file with no dependencies: Node 22 or newer for the `.mjs` files, Python 3 for
the `.py` file. None of these write anything to your Whatnot account. They only
read, and the webhook files never talk to Whatnot at all.

| File | What it does |
|---|---|
| `first-call.mjs` | Calls `GET /users/me` and prints "Signed in as" your username, or explains the error (401, 403, 429) with the request id. |
| `first-call.py` | The same in Python 3, standard library only. |
| `list-all-products.mjs` | Walks every page of `GET /products` (50 per page), pacing itself under the rate limit, and prints one line per product plus a count. Exports `pages()` for your own lists. |
| `verify-webhook.mjs` | Pure functions to check a webhook signature: `secretKey`, `sign`, `verify`. |
| `webhook-receiver.mjs` | A small HTTP server that verifies, dedupes and logs webhooks. |
| `send-test-webhook.mjs` | Signs a sample webhook and posts it to the local receiver. |

## Set your token

Make a personal access token in the Whatnot developer dashboard
(https://www.whatnot.com/dashboard/developer?tab=tokens). It is shown once, so
copy it straight away.

PowerShell:

```powershell
$env:WHATNOT_API_KEY="your-token"
node examples/first-call.mjs
```

bash:

```bash
export WHATNOT_API_KEY=your-token
node examples/first-call.mjs
```

Then try `python examples/first-call.py` or `node examples/list-all-products.mjs`
the same way. The scripts never print your token.

## Webhooks

Whatnot delivers webhooks only to a public HTTPS URL, and subscriptions are made
in the developer dashboard, not through the API. To test on your own computer,
put a tunnel in front of the receiver and give Whatnot the tunnel's HTTPS
address.

You can see the whole loop work locally without Whatnot. Pick any secret (the
real one comes from the dashboard and starts with `wn_wh_`). This makes one:

```bash
node -e "console.log('wn_wh_' + require('crypto').randomBytes(24).toString('base64'))"
```

Start the receiver in one terminal.

PowerShell:

```powershell
$env:WHATNOT_WEBHOOK_SECRET="wn_wh_..."
node examples/webhook-receiver.mjs
```

bash:

```bash
export WHATNOT_WEBHOOK_SECRET=wn_wh_...
node examples/webhook-receiver.mjs
```

In a second terminal, set the same secret and run:

```bash
node examples/send-test-webhook.mjs
```

The sender prints `Receiver answered 200 {"ok":true}` and the receiver logs a
line like:

```
orders.created 2026-10-31T12:00:00.000Z seller sample-seller id sample-order-1
```

The receiver listens on port 7491. Set `PORT` (for both) to use another.
A bad signature gets a 401 with a short reason, and a repeated `webhook-id` gets
a 200 without being logged again.
