import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import http from "node:http";
import { startServer, MESSAGES, MAX_TOKEN_LENGTH } from "../server.mjs";

const TOKEN = "test-token-abc123";

// One server, one fake upstream. Each test sets env and the next fake reply.
const env = {};
const calls = [];
const logs = [];
const sleeps = [];
let clock = 1_000_000;
let replies = [];
let server;
let base;
let emptyDir;

function fakeFetch(url, init) {
  calls.push({ url, init });
  const next = replies.shift() ?? { status: 200, body: { ok: true } };
  if (next.throw) return Promise.reject(new Error(next.throw));
  return Promise.resolve(
    new Response(next.body === undefined ? null : JSON.stringify(next.body), {
      status: next.status,
      headers: { "content-type": "application/json", ...(next.headers || {}) },
    }),
  );
}

function reset(newEnv = {}) {
  for (const k of Object.keys(env)) delete env[k];
  Object.assign(env, newEnv);
  calls.length = 0;
  logs.length = 0;
  sleeps.length = 0;
  replies = [];
}

async function run(payload, headers = {}) {
  const res = await fetch(`${base}/api/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  return { code: res.status, data: JSON.parse(text), text };
}

before(async () => {
  emptyDir = await mkdtemp(join(tmpdir(), "wad-empty-"));
  server = await startServer({
    port: 0,
    env,
    fixturesDir: join(emptyDir, "nothing-here"),
    fetchImpl: fakeFetch,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
    now: () => clock,
    log: (line) => logs.push(line),
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((r) => server.close(r));
  await rm(emptyDir, { recursive: true, force: true });
});

test("no token answers 409 no_token and never calls Whatnot", async () => {
  reset({});
  const r = await run({ name: "get_the_current_user", args: {} });
  assert.equal(r.code, 409);
  assert.equal(r.data.error, "no_token");
  assert.equal(r.data.message, MESSAGES.no_token);
  assert.equal(calls.length, 0);
});

test("a blank token counts as no token", async () => {
  reset({ WHATNOT_API_KEY: "   " });
  const r = await run({ name: "list_shows", args: {} });
  assert.equal(r.code, 409);
  assert.equal(calls.length, 0);
});

test("token is sent as a Bearer header with JSON content type", async () => {
  reset({ WHATNOT_API_KEY: TOKEN });
  replies.push({ status: 200, body: { id: "1506502", username: "andysometa" } });
  const r = await run({ name: "get_the_current_user", args: {} });
  assert.equal(r.code, 200);
  assert.equal(r.data.status, 200);
  assert.deepEqual(r.data.body, { id: "1506502", username: "andysometa" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.whatnot.com/seller-api/rest/v2/users/me");
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(calls[0].init.headers["Content-Type"], "application/json");
  assert.equal(calls[0].init.body, undefined);
});

test("the token never appears in responses or logs", async () => {
  reset({ WHATNOT_API_KEY: TOKEN });
  replies.push({ status: 200, body: {} });
  const r = await run({ name: "list_products", args: { limit: 2 } });
  assert.ok(!r.text.includes(TOKEN));
  assert.ok(logs.length > 0);
  for (const line of logs) assert.ok(!line.includes(TOKEN), line);
  const status = await (await fetch(`${base}/api/status`)).text();
  assert.ok(!status.includes(TOKEN));
  assert.deepEqual(JSON.parse(status), { token: true, allowWrites: false });
});

test("path and query params are placed in the URL", async () => {
  reset({ WHATNOT_API_KEY: TOKEN });
  await run({ name: "list_shows", args: { status: "live", limit: 10, cursor: null } });
  assert.equal(calls[0].url, "https://api.whatnot.com/seller-api/rest/v2/shows?status=live&limit=10");
  await run({ name: "get_a_product_variant", args: { product_id: "647559331", id: "abc-1" } });
  assert.equal(calls[1].url, "https://api.whatnot.com/seller-api/rest/v2/products/647559331/variants/abc-1");
});

test("write is refused without ALLOW_WRITES=true", async () => {
  reset({ WHATNOT_API_KEY: TOKEN });
  const r = await run({ name: "create_a_product", args: { body: { title: "API DEMO TEST ITEM" } } });
  assert.equal(r.code, 403);
  assert.equal(r.data.error, "writes_off");
  assert.equal(calls.length, 0);
  reset({ WHATNOT_API_KEY: TOKEN, ALLOW_WRITES: "yes" });
  const r2 = await run({ name: "set_inventory", args: { body: { items: [] } } });
  assert.equal(r2.code, 403);
  assert.equal(calls.length, 0);
});

test("write goes through with ALLOW_WRITES=true and sends the JSON body", async () => {
  reset({ WHATNOT_API_KEY: TOKEN, ALLOW_WRITES: "true" });
  replies.push({ status: 201, body: { id: "999" } });
  const body = { title: "API DEMO TEST ITEM", category: { id: "265" }, dimension_profile: { id: "123059" } };
  const r = await run({ name: "create_a_product", args: { body } });
  assert.equal(r.code, 200);
  assert.equal(r.data.status, 201);
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].url, "https://api.whatnot.com/seller-api/rest/v2/products");
  assert.deepEqual(JSON.parse(calls[0].init.body), body);
});

test("destructive needs ALLOW_WRITES and confirm:true", async () => {
  reset({ WHATNOT_API_KEY: TOKEN });
  let r = await run({ name: "cancel_an_order", args: { order_id: "1", body: { reason: "other" } }, confirm: true });
  assert.equal(r.code, 403);
  assert.equal(r.data.error, "writes_off");

  reset({ WHATNOT_API_KEY: TOKEN, ALLOW_WRITES: "true" });
  r = await run({ name: "cancel_an_order", args: { order_id: "1", body: { reason: "other" } } });
  assert.equal(r.code, 403);
  assert.equal(r.data.error, "confirm_required");
  r = await run({ name: "delete_a_product", args: { product_id: "5" }, confirm: "true" });
  assert.equal(r.code, 403, "a string is not confirm:true");
  assert.equal(calls.length, 0);

  replies.push({ status: 404, body: { error: "not found" } });
  r = await run({ name: "cancel_an_order", args: { order_id: "1", body: { reason: "other" } }, confirm: true });
  assert.equal(r.code, 200);
  assert.equal(r.data.status, 404);
  assert.equal(calls[0].url, "https://api.whatnot.com/seller-api/rest/v2/orders/1/cancel");
});

test("DELETE sends no body", async () => {
  reset({ WHATNOT_API_KEY: TOKEN, ALLOW_WRITES: "true" });
  replies.push({ status: 204 });
  const r = await run({ name: "delete_a_product", args: { product_id: "5" }, confirm: true });
  assert.equal(r.data.status, 204);
  assert.equal(r.data.body, null);
  assert.equal(calls[0].init.method, "DELETE");
  assert.equal(calls[0].init.body, undefined);
});

test("disconnect is always refused, whatever the gates say", async () => {
  for (const e of [{}, { WHATNOT_API_KEY: TOKEN }, { WHATNOT_API_KEY: TOKEN, ALLOW_WRITES: "true" }]) {
    reset(e);
    const r = await run({ name: "disconnect_the_current_application", args: {}, confirm: true });
    assert.equal(r.code, 403);
    assert.equal(r.data.error, "never_run");
    assert.match(r.data.message, /disconnect/);
    assert.equal(calls.length, 0);
  }
});

test("unknown function is 404 and bad JSON is 400", async () => {
  reset({ WHATNOT_API_KEY: TOKEN });
  const r = await run({ name: "drop_tables", args: {} });
  assert.equal(r.code, 404);
  const res = await fetch(`${base}/api/run`, { method: "POST", body: "{nope" });
  assert.equal(res.status, 400);
  assert.equal(calls.length, 0);
});

test("unresolved tokens and missing path params are refused before calling", async () => {
  reset({ WHATNOT_API_KEY: TOKEN });
  let r = await run({ name: "get_a_show", args: { show_id: "{{SHOW_ID}}" } });
  assert.equal(r.code, 400);
  assert.equal(r.data.error, "unresolved_token");
  assert.deepEqual(r.data.tokens, ["SHOW_ID"]);
  r = await run({ name: "get_a_show", args: {} });
  assert.equal(r.code, 400);
  assert.equal(r.data.error, "missing_param");
  r = await run({ name: "get_a_show", args: [] });
  assert.equal(r.code, 400);
  assert.equal(calls.length, 0);
});

test("429 waits Retry-After once, then returns the second answer", async () => {
  reset({ WHATNOT_API_KEY: TOKEN });
  replies.push({ status: 429, body: { error: "slow down" }, headers: { "retry-after": "3" } });
  replies.push({ status: 429, body: { error: "still slow" }, headers: { "retry-after": "3" } });
  const r = await run({ name: "list_orders", args: { limit: 5 } });
  assert.equal(calls.length, 2, "one retry only");
  assert.ok(sleeps.includes(3000), `waited ${sleeps}`);
  assert.equal(r.code, 200);
  assert.equal(r.data.status, 429);
  assert.deepEqual(r.data.body, { error: "still slow" });

  reset({ WHATNOT_API_KEY: TOKEN });
  replies.push({ status: 429, body: {}, headers: { "retry-after": "1" } });
  replies.push({ status: 200, body: { data: [] } });
  const r2 = await run({ name: "list_orders", args: {} });
  assert.equal(r2.data.status, 200);
  assert.equal(calls.length, 2);
});

test("calls are paced to at most one per second", async () => {
  reset({ WHATNOT_API_KEY: TOKEN });
  clock += 5000;
  await run({ name: "list_products", args: {} });
  await run({ name: "list_products", args: {} });
  assert.equal(calls.length, 2);
  assert.equal(sleeps.length, 1);
  assert.ok(sleeps[0] > 0 && sleeps[0] <= 1000, `slept ${sleeps[0]}`);
});

test("a network failure is a 502 with a plain message", async () => {
  reset({ WHATNOT_API_KEY: TOKEN });
  clock += 5000;
  replies.push({ throw: `connect refused ${TOKEN}` });
  const r = await run({ name: "list_shows", args: {} });
  assert.equal(r.code, 502);
  assert.equal(r.data.error, "network_error");
  assert.ok(!r.text.includes(TOKEN));
});

test("GET /api/run is not allowed and unknown api routes are 404", async () => {
  assert.equal((await fetch(`${base}/api/run`)).status, 405);
  assert.equal((await fetch(`${base}/api/nope`)).status, 404);
});

test("catalog route returns all 34 functions", async () => {
  const res = await fetch(`${base}/api/catalog`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.functions.length, 34);
  assert.equal(data.base, "https://api.whatnot.com/seller-api/rest/v2");
});

test("UI files are served and paths outside ui are not", async () => {
  const home = await fetch(`${base}/`);
  assert.equal(home.status, 200);
  assert.match(home.headers.get("content-type"), /text\/html/);
  assert.match(await home.text(), /Whatnot API Demo/);
  assert.equal((await fetch(`${base}/app.js`)).status, 200);
  assert.equal((await fetch(`${base}/style.css`)).status, 200);
  assert.equal((await fetch(`${base}/..%2Fserver.mjs`)).status, 404);
  assert.equal((await fetch(`${base}/..%2F..%2Fpackage.json`)).status, 404);
});

test("forbidden ports are refused", async () => {
  await assert.rejects(startServer({ port: 7474, env: {} }), /another project/);
  await assert.rejects(startServer({ port: 7480, env: {} }), /another project/);
});

// ---------- token from the page (X-Whatnot-Token header) ----------

const PAGE_TOKEN = "page-token-xyz789";

// Raw request so the Origin header is sent exactly as given.
function rawPost(path, payload, headers = {}) {
  const body = JSON.stringify(payload);
  return new Promise((ok, fail) => {
    const req = http.request(
      `${base}${path}`,
      { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), ...headers } },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          ok({ code: res.statusCode, text, data: text ? JSON.parse(text) : null });
        });
      },
    );
    req.on("error", fail);
    req.end(body);
  });
}

test("header token is used and sent as Bearer with no env token", async () => {
  reset({});
  clock += 5000;
  replies.push({ status: 200, body: { username: "someone" } });
  const r = await run({ name: "get_the_current_user", args: {} }, { "X-Whatnot-Token": `  ${PAGE_TOKEN}  ` });
  assert.equal(r.code, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${PAGE_TOKEN}`, "trimmed");
  assert.ok(!r.text.includes(PAGE_TOKEN));
  for (const line of logs) assert.ok(!line.includes(PAGE_TOKEN), line);
});

test("env token still works when no header is sent", async () => {
  reset({ WHATNOT_API_KEY: TOKEN });
  clock += 5000;
  await run({ name: "get_the_current_user", args: {} }, { "X-Whatnot-Token": "   " });
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${TOKEN}`);
});

test("header token beats the env token", async () => {
  reset({ WHATNOT_API_KEY: TOKEN });
  clock += 5000;
  await run({ name: "get_the_current_user", args: {} }, { "X-Whatnot-Token": PAGE_TOKEN });
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${PAGE_TOKEN}`);
});

test("an over-long or odd token is a 400 and never calls Whatnot", async () => {
  reset({});
  const long = "a".repeat(MAX_TOKEN_LENGTH + 1);
  let r = await run({ name: "get_the_current_user", args: {} }, { "X-Whatnot-Token": long });
  assert.equal(r.code, 400);
  assert.equal(r.data.error, "token_too_long");
  assert.ok(!r.text.includes(long));
  r = await run({ name: "get_the_current_user", args: {} }, { "X-Whatnot-Token": "two words" });
  assert.equal(r.code, 400);
  assert.equal(r.data.error, "bad_token");
  assert.equal(calls.length, 0);
  clock += 5000;
  r = await run({ name: "get_the_current_user", args: {} }, { "X-Whatnot-Token": "a".repeat(MAX_TOKEN_LENGTH) });
  assert.equal(r.code, 200, "exactly the limit is fine");
});

test("status still reports only the env token, never a header token", async () => {
  reset({});
  const res = await fetch(`${base}/api/status`, { headers: { "X-Whatnot-Token": PAGE_TOKEN } });
  const text = await res.text();
  assert.ok(!text.includes(PAGE_TOKEN));
  assert.deepEqual(JSON.parse(text), { token: false, allowWrites: false });
});

test("write needs allowWrites === true in the body (boolean only)", async () => {
  reset({});
  const h = { "X-Whatnot-Token": PAGE_TOKEN };
  const body = { title: "API DEMO TEST ITEM" };
  for (const allowWrites of [undefined, false, "true", 1]) {
    const r = await run({ name: "create_a_product", args: { body }, allowWrites }, h);
    assert.equal(r.code, 403, `allowWrites ${JSON.stringify(allowWrites)}`);
    assert.equal(r.data.error, "writes_off");
    assert.equal(r.data.message, MESSAGES.writes_off);
  }
  assert.equal(calls.length, 0);
  clock += 5000;
  replies.push({ status: 201, body: { id: "999" } });
  const ok = await run({ name: "create_a_product", args: { body }, allowWrites: true }, h);
  assert.equal(ok.code, 200);
  assert.equal(ok.data.status, 201);
  assert.equal(calls.length, 1);
});

test("destructive needs allowWrites and confirm, both boolean true", async () => {
  reset({});
  const h = { "X-Whatnot-Token": PAGE_TOKEN };
  const args = { order_id: "1", body: { reason: "other" } };
  let r = await run({ name: "cancel_an_order", args, confirm: true }, h);
  assert.equal(r.data.error, "writes_off");
  r = await run({ name: "cancel_an_order", args, allowWrites: true }, h);
  assert.equal(r.data.error, "confirm_required");
  r = await run({ name: "cancel_an_order", args, allowWrites: true, confirm: "true" }, h);
  assert.equal(r.data.error, "confirm_required");
  r = await run({ name: "cancel_an_order", args, allowWrites: "true", confirm: true }, h);
  assert.equal(r.data.error, "writes_off");
  assert.equal(calls.length, 0);
  clock += 5000;
  replies.push({ status: 404, body: { error: "not found" } });
  r = await run({ name: "cancel_an_order", args, allowWrites: true, confirm: true }, h);
  assert.equal(r.code, 200);
  assert.equal(calls.length, 1);
});

test("disconnect is refused even with header token, allowWrites and confirm", async () => {
  reset({ WHATNOT_API_KEY: TOKEN, ALLOW_WRITES: "true" });
  const r = await run(
    { name: "disconnect_the_current_application", args: {}, allowWrites: true, confirm: true },
    { "X-Whatnot-Token": PAGE_TOKEN },
  );
  assert.equal(r.code, 403);
  assert.equal(r.data.error, "never_run");
  assert.equal(calls.length, 0);
});

test("a header token never appears in a 502 error", async () => {
  reset({});
  clock += 5000;
  replies.push({ throw: `connect refused for Bearer ${PAGE_TOKEN} at api.whatnot.com` });
  const r = await run({ name: "list_shows", args: {} }, { "X-Whatnot-Token": PAGE_TOKEN });
  assert.equal(r.code, 502);
  assert.equal(r.data.error, "network_error");
  assert.ok(!r.text.includes(PAGE_TOKEN), r.text);
  assert.match(r.data.message, /[token]/);
});

test("Origin: none passes, this server's own origin passes, a foreign one is 403", async () => {
  const port = server.address().port;
  const h = { "X-Whatnot-Token": PAGE_TOKEN };
  reset({});
  clock += 5000;
  let r = await rawPost("/api/run", { name: "get_the_current_user", args: {} }, h);
  assert.equal(r.code, 200, "no Origin");
  for (const origin of [`http://localhost:${port}`, `http://127.0.0.1:${port}`]) {
    clock += 5000;
    r = await rawPost("/api/run", { name: "get_the_current_user", args: {} }, { ...h, Origin: origin });
    assert.equal(r.code, 200, origin);
  }
  assert.equal(calls.length, 3);
  for (const origin of ["https://evil.example", "http://localhost:1", `https://localhost:${port}`, "null"]) {
    r = await rawPost("/api/run", { name: "get_the_current_user", args: {} }, { ...h, Origin: origin });
    assert.equal(r.code, 403, origin);
    assert.equal(r.data.error, "bad_origin");
    assert.ok(!r.text.includes(PAGE_TOKEN));
  }
  assert.equal(calls.length, 3, "a foreign page never reaches Whatnot");
});
