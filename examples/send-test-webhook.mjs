// Sends one signed sample webhook to the local receiver, so you can see the
// whole loop work without Whatnot. Node 22+, no dependencies.
// Run: node send-test-webhook.mjs  (same WHATNOT_WEBHOOK_SECRET and PORT as the receiver)

import { secretKey, sign } from "./verify-webhook.mjs";

const secret = process.env.WHATNOT_WEBHOOK_SECRET;
if (!secret) {
  console.log("WHATNOT_WEBHOOK_SECRET is not set. Use the same value you gave the receiver.");
  process.exit(1);
}

const url = `http://127.0.0.1:${Number(process.env.PORT) || 7491}/`;
const key = secretKey(secret);

// A made-up envelope in the shape Whatnot sends.
const envelope = {
  type: "orders.created",
  timestamp: new Date().toISOString(),
  version: "v2",
  seller_id: "sample-seller",
  data: { id: "sample-order-1" },
};

const id = `msg_${crypto.randomUUID()}`;
const timestamp = String(Math.floor(Date.now() / 1000));
const body = Buffer.from(JSON.stringify(envelope), "utf8");

try {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "webhook-id": id,
      "webhook-timestamp": timestamp,
      "webhook-signature": `v1,${sign(key, id, timestamp, body)}`,
    },
    body,
  });
  console.log(`Receiver answered ${res.status} ${await res.text()}`);
} catch (err) {
  console.log(`Could not reach the receiver at ${url}. Is it running? (${err.message})`);
  process.exit(1);
}
