import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { secretKey, sign, verify } from "../examples/verify-webhook.mjs";
import { pages } from "../examples/list-all-products.mjs";
import { createReceiver } from "../examples/webhook-receiver.mjs";

const SECRET = `wn_wh_${randomBytes(24).toString("base64")}`;
const KEY = secretKey(SECRET);
const NOW = 1_800_000_000_000;
const TS = String(NOW / 1000);

function signed(body, { id = "msg_1", ts = TS } = {}) {
  const raw = Buffer.from(body, "utf8");
  return { raw, headers: { "webhook-id": id, "webhook-timestamp": ts, "webhook-signature": `v1,${sign(KEY, id, ts, raw)}` } };
}

test("verify: a signature made by sign verifies", () => {
  const { raw, headers } = signed('{"type":"orders.created"}');
  assert.deepEqual(verify({ key: KEY, headers, rawBody: raw, now: NOW }), { ok: true });
});

test("verify: header names are case-insensitive", () => {
  const { raw, headers } = signed("{}");
  const upper = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toUpperCase(), v]));
  assert.deepEqual(verify({ key: KEY, headers: upper, rawBody: raw, now: NOW }), { ok: true });
  assert.deepEqual(verify({ key: KEY, headers: new Headers(headers), rawBody: raw, now: NOW }), { ok: true });
});

test("verify: a tampered body fails with no-match", () => {
  const { headers } = signed('{"amount":1}');
  const r = verify({ key: KEY, headers, rawBody: Buffer.from('{"amount":9}'), now: NOW });
  assert.deepEqual(r, { ok: false, reason: "no-match" });
});

test("verify: a timestamp 10 minutes old fails with stale-timestamp", () => {
  const old = String(NOW / 1000 - 600);
  const { raw, headers } = signed("{}", { ts: old });
  assert.deepEqual(verify({ key: KEY, headers, rawBody: raw, now: NOW }), { ok: false, reason: "stale-timestamp" });
});

test("verify: missing or bad headers are refused", () => {
  const { raw, headers } = signed("{}");
  const { "webhook-signature": _, ...noSig } = headers;
  assert.deepEqual(verify({ key: KEY, headers: noSig, rawBody: raw, now: NOW }), { ok: false, reason: "missing-headers" });
  assert.deepEqual(verify({ key: KEY, headers: {}, rawBody: raw, now: NOW }), { ok: false, reason: "missing-headers" });
  const bad = { ...headers, "webhook-timestamp": "yesterday" };
  assert.deepEqual(verify({ key: KEY, headers: bad, rawBody: raw, now: NOW }), { ok: false, reason: "bad-timestamp" });
});

test("secretKey: wn_wh_ and whsec_ prefixes and no prefix give the same key", () => {
  const bare = SECRET.slice("wn_wh_".length);
  assert.ok(secretKey(bare).equals(KEY));
  assert.ok(secretKey(`whsec_${bare}`).equals(KEY));
  assert.equal(KEY.length, 24);
});

test("verify: several entries, only the second matches, passes", () => {
  const { raw, headers } = signed("{}");
  const wrong = randomBytes(32).toString("base64");
  const multi = { ...headers, "webhook-signature": `v1,${wrong} ${headers["webhook-signature"]}` };
  assert.deepEqual(verify({ key: KEY, headers: multi, rawBody: raw, now: NOW }), { ok: true });
  const otherVersion = { ...headers, "webhook-signature": `v1a,${headers["webhook-signature"].slice(3)}` };
  assert.deepEqual(verify({ key: KEY, headers: otherVersion, rawBody: raw, now: NOW }), { ok: false, reason: "no-match" });
});

function jsonResponse(status, body, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

test("pages: forwards the cursor and yields rows in order", async () => {
  const urls = [];
  const answers = [
    { data: [{ id: "1" }, { id: "2" }], next_cursor: "c1" },
    { data: [{ id: "3" }], next_cursor: "c2" },
    { data: [{ id: "4" }], next_cursor: null },
  ];
  const fetchImpl = async (url, init) => {
    urls.push(new URL(url));
    assert.equal(init.headers.Authorization, "Bearer t");
    assert.ok(init.headers["X-Request-ID"]);
    return jsonResponse(200, answers[urls.length - 1]);
  };
  const sleeps = [];
  const rows = [];
  for await (const page of pages("/products", "t", { limit: 50 }, { fetchImpl, sleep: async (ms) => sleeps.push(ms) })) {
    rows.push(...page);
  }
  assert.deepEqual(rows.map((r) => r.id), ["1", "2", "3", "4"]);
  assert.equal(urls.length, 3);
  assert.equal(urls[0].pathname, "/seller-api/rest/v2/products");
  assert.equal(urls[0].searchParams.get("limit"), "50");
  assert.equal(urls[0].searchParams.get("cursor"), null);
  assert.equal(urls[1].searchParams.get("cursor"), "c1");
  assert.equal(urls[2].searchParams.get("cursor"), "c2");
  assert.deepEqual(sleeps, [150, 150]);
});

test("pages: a 429 is retried once after Retry-After", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    if (calls === 1) return jsonResponse(429, { type: "rate-limited", status: 429 }, { "Retry-After": "0" });
    return jsonResponse(200, { data: [{ id: "a" }], next_cursor: null });
  };
  const sleeps = [];
  const rows = [];
  for await (const page of pages("/products", "t", {}, { fetchImpl, sleep: async (ms) => sleeps.push(ms) })) rows.push(...page);
  assert.equal(calls, 2);
  assert.deepEqual(rows, [{ id: "a" }]);
  assert.deepEqual(sleeps, [0]);
});

test("pages: a second 429 in a row is thrown with the problem type", async () => {
  const fetchImpl = async () => jsonResponse(429, { type: "rate-limited", detail: "slow down" }, { "Retry-After": "0" });
  await assert.rejects(async () => {
    for await (const _ of pages("/products", "t", {}, { fetchImpl, sleep: async () => {} }));
  }, (err) => err.status === 429 && /rate-limited/.test(err.message));
});

test("receiver: verifies, dedupes and refuses bad signatures", async (t) => {
  const lines = [];
  const server = createReceiver({ key: KEY, log: (line) => lines.push(line) });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  t.after(() => new Promise((done) => server.close(done)));
  const url = `http://127.0.0.1:${server.address().port}/`;

  const ts = String(Math.floor(Date.now() / 1000));
  const envelope = JSON.stringify({ type: "orders.created", timestamp: "2026-10-31T12:00:00.000Z", version: "v2", seller_id: "s1", data: { id: "o1" } });
  const { raw, headers } = signed(envelope, { id: "msg_dup", ts });

  const post = (h, body = raw) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...h }, body });

  let res = await post(headers);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^orders\.created 2026-10-31T12:00:00\.000Z seller s1 id o1$/);

  res = await post(headers);
  assert.equal(res.status, 200);
  await res.text();
  assert.equal(lines.length, 1);

  res = await post({ ...headers, "webhook-id": "msg_other", "webhook-signature": `v1,${randomBytes(32).toString("base64")}` });
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { ok: false, reason: "no-match" });
  assert.equal(lines.length, 1);
});
