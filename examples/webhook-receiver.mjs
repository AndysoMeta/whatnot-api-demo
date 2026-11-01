// A small Whatnot webhook receiver. Node 22+, no dependencies.
// Run: node webhook-receiver.mjs  (needs WHATNOT_WEBHOOK_SECRET; PORT defaults to 7491)
//
// Whatnot only delivers to a public HTTPS URL. To try this on your own
// computer, put a tunnel in front of it (any tool that gives you a public
// HTTPS address forwarding to this port). Subscriptions and the signing
// secret are made in the Whatnot developer dashboard, not through the API.
//
// It answers 200 straight away and does its work after, because Whatnot
// waits only 5 seconds. Delivery is at least once, so ids already seen are
// answered 200 and skipped.

import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { secretKey, verify } from "./verify-webhook.mjs";

const MAX_BODY = 1024 * 1024;
const MAX_SEEN = 5000;

function reply(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

function summary(data) {
  if (data && typeof data === "object") {
    const id = data.id ?? data.order?.id ?? data.product?.id ?? data.show?.id ?? data.shipment?.id;
    if (id !== undefined && id !== null) return `id ${id}`;
    const keys = Object.keys(data);
    return keys.length ? `fields ${keys.slice(0, 5).join(", ")}` : "empty data";
  }
  return "no data";
}

export function createReceiver({ key, log = console.log }) {
  const seen = new Set();

  return createServer((req, res) => {
    if (req.method !== "POST") return reply(res, 405, { ok: false, reason: "post-only" });

    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size <= MAX_BODY) chunks.push(chunk);
    });
    req.on("end", () => {
      if (size > MAX_BODY) return reply(res, 413, { ok: false, reason: "too-large" });
      const rawBody = Buffer.concat(chunks);

      const check = verify({ key, headers: req.headers, rawBody });
      if (!check.ok) return reply(res, 401, { ok: false, reason: check.reason });

      const id = req.headers["webhook-id"];
      if (seen.has(id)) return reply(res, 200, { ok: true });

      let event;
      try {
        event = JSON.parse(rawBody.toString("utf8"));
      } catch {
        return reply(res, 400, { ok: false, reason: "bad-json" });
      }

      seen.add(id);
      if (seen.size > MAX_SEEN) seen.delete(seen.values().next().value);

      reply(res, 200, { ok: true });
      log(`${event.type} ${event.timestamp} seller ${event.seller_id} ${summary(event.data)}`);
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const secret = process.env.WHATNOT_WEBHOOK_SECRET;
  if (!secret) {
    console.log("WHATNOT_WEBHOOK_SECRET is not set. Copy the signing secret from your webhook in the developer dashboard.");
    process.exit(1);
  }
  let key;
  try {
    key = secretKey(secret);
  } catch (err) {
    console.log(err.message);
    process.exit(1);
  }
  const port = Number(process.env.PORT) || 7491;
  createReceiver({ key }).listen(port, "127.0.0.1", () => {
    console.log(`Listening for webhooks on http://127.0.0.1:${port}/`);
  });
}
