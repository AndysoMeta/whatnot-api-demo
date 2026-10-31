// Verify a Whatnot webhook (Standard Webhooks signing). Pure functions, no I/O.
//
// Whatnot sends three headers: webhook-id, webhook-timestamp (unix seconds)
// and webhook-signature (one or more "v1,<base64>" entries, space separated).
// The signature is HMAC-SHA256 over "<id>.<timestamp>.<raw body>" keyed with
// the base64-decoded secret. Always verify the raw bytes you received.

import { createHmac, timingSafeEqual } from "node:crypto";

// The dashboard secret starts with wn_wh_ (whsec_ is accepted too).
export function secretKey(secretFromDashboard) {
  const raw = String(secretFromDashboard ?? "").trim().replace(/^(wn_wh_|whsec_)/, "");
  const key = Buffer.from(raw, "base64");
  if (key.length === 0) throw new Error("The webhook secret is empty or not base64.");
  return key;
}

export function sign(key, id, timestamp, rawBodyBuffer) {
  const body = Buffer.isBuffer(rawBodyBuffer) ? rawBodyBuffer : Buffer.from(String(rawBodyBuffer ?? ""), "utf8");
  return createHmac("sha256", key).update(`${id}.${timestamp}.`).update(body).digest("base64");
}

// Works with Node's req.headers, a plain object in any case, or a fetch Headers.
function header(headers, name) {
  if (!headers) return undefined;
  if (typeof headers.get === "function") return headers.get(name) ?? undefined;
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === name) return Array.isArray(v) ? v.join(" ") : v;
  }
  return undefined;
}

export function verify({ key, headers, rawBody, now = Date.now(), toleranceSeconds = 300 }) {
  const id = header(headers, "webhook-id");
  const timestamp = header(headers, "webhook-timestamp");
  const signature = header(headers, "webhook-signature");
  if (!id || !timestamp || !signature) return { ok: false, reason: "missing-headers" };

  const ts = String(timestamp).trim();
  if (!/^\d+$/.test(ts)) return { ok: false, reason: "bad-timestamp" };
  if (Math.abs(now / 1000 - Number(ts)) > toleranceSeconds) return { ok: false, reason: "stale-timestamp" };

  const expected = Buffer.from(sign(key, id, ts, rawBody ?? Buffer.alloc(0)), "base64");
  for (const entry of String(signature).split(" ")) {
    const comma = entry.indexOf(",");
    if (comma < 0 || entry.slice(0, comma) !== "v1") continue; // other versions are ignored
    const given = Buffer.from(entry.slice(comma + 1), "base64");
    if (given.length === expected.length && timingSafeEqual(given, expected)) return { ok: true };
  }
  return { ok: false, reason: "no-match" };
}
