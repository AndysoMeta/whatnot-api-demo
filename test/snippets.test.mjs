import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSnippets, buildRequestParts } from "../ui/snippets.mjs";
import { FUNCTIONS, BY_NAME, BASE_URL, resolveTokens } from "../catalog.mjs";
import { buildRequest } from "../server.mjs";

const LANGS = ["curl", "javascript", "python", "http"];

function snip(name, args, extra = {}) {
  const f = BY_NAME.get(name);
  const input = { method: f.method, path: f.path, base: BASE_URL, params: f.params, args, ...extra };
  return { parts: buildRequestParts(input), snippets: buildSnippets(input) };
}

test("path params are substituted and encoded", () => {
  const { parts } = snip("get_a_product_variant", { product_id: "647559331", id: "a b/c" });
  assert.equal(parts.url, `${BASE_URL}/products/647559331/variants/a%20b%2Fc`);
  assert.equal(parts.method, "GET");
});

test("query params present in args become an encoded query string", () => {
  const { parts } = snip("list_shows", { status: "live", limit: 10, cursor: "a b&c=d", reverse: false });
  assert.equal(parts.url, `${BASE_URL}/shows?status=live&limit=10&cursor=a+b%26c%3Dd&reverse=false`);
  const none = snip("list_shows", { cursor: null, limit: "" }).parts;
  assert.equal(none.url, `${BASE_URL}/shows`);
});

test("POST and PATCH carry the JSON body with Content-Type", () => {
  const body = { title: "API DEMO TEST ITEM", category: { id: "265" } };
  for (const name of ["create_a_product", "update_a_product"]) {
    const { parts, snippets } = snip(name, { product_id: "5", body });
    assert.equal(parts.body, JSON.stringify(body, null, 2), name);
    assert.equal(parts.headers["Content-Type"], "application/json");
    for (const lang of LANGS) {
      assert.match(snippets[lang], /Content-Type/, `${name} ${lang}`);
      assert.ok(snippets[lang].includes('"API DEMO TEST ITEM"'), `${name} ${lang} has the body`);
    }
    assert.ok(snippets.http.includes(JSON.stringify(body, null, 2)), "pretty body, 2-space indent");
  }
});

test("GET and DELETE never have a body, even if args has one", () => {
  for (const name of ["get_a_product", "delete_a_product"]) {
    const { parts, snippets } = snip(name, { product_id: "5", body: { sneaky: "body-value" } });
    assert.equal(parts.body, null, name);
    assert.equal(parts.headers["Content-Type"], undefined, name);
    for (const lang of LANGS) {
      assert.ok(!snippets[lang].includes("body-value"), `${name} ${lang}`);
      assert.doesNotMatch(snippets[lang], /Content-Type/, `${name} ${lang}`);
    }
  }
});

test("the token is never in a snippet, even when args hold one", () => {
  const pageToken = "my-pasted-secret-token-9876";
  const args = {
    product_id: "wn_pat_tk_abc123DEF456",
    body: { title: `wn_access_tk_zzz999 and ${pageToken}`, [pageToken]: "x" },
  };
  const { snippets } = snip("update_a_product", args, { secrets: [pageToken] });
  for (const lang of LANGS) {
    const text = snippets[lang];
    assert.ok(!text.includes("wn_pat_tk_abc123DEF456"), lang);
    assert.ok(!text.includes("wn_access_tk_zzz999"), lang);
    assert.ok(!text.includes(pageToken), lang);
    assert.ok(text.includes("[token]"), `${lang} shows [token] instead`);
  }
  assert.match(snippets.curl, /Authorization: Bearer \$WHATNOT_API_KEY/);
  assert.match(snippets.javascript, /process\.env\.WHATNOT_API_KEY/);
  assert.match(snippets.python, /os\.environ\["WHATNOT_API_KEY"\]/);
  assert.match(snippets.http, /Authorization: Bearer <your token>/);
});

test("each language names the URL and the method", () => {
  for (const name of ["list_shows", "create_a_product", "update_a_product", "delete_a_product", "cancel_an_order"]) {
    const f = BY_NAME.get(name);
    const args = resolveTokens(f.demo, { PRODUCT_ID: "647559331" });
    const { parts, snippets } = snip(name, args);
    for (const lang of ["curl", "javascript", "python"]) {
      assert.ok(snippets[lang].includes(parts.url), `${name} ${lang} url`);
      assert.ok(snippets[lang].includes(f.method), `${name} ${lang} method`);
    }
    const target = parts.url.replace("https://api.whatnot.com", "");
    assert.ok(snippets.http.startsWith(`${f.method} ${target} HTTP/1.1\nHost: api.whatnot.com\n`), name);
    assert.match(snippets.http, /Accept: application\/json/);
  }
});

test("unresolved {{TOKEN}} markers pass through untouched", () => {
  const { parts, snippets } = snip("update_product_variants", {
    product_id: "{{PRODUCT_ID}}",
    body: { variants: [{ id: "{{VARIANT_ID}}" }] },
  });
  assert.equal(parts.url, `${BASE_URL}/products/{{PRODUCT_ID}}/variants`);
  for (const lang of LANGS) {
    assert.ok(snippets[lang].includes("{{PRODUCT_ID}}"), lang);
    assert.ok(snippets[lang].includes("{{VARIANT_ID}}"), lang);
  }
  const q = snip("list_shows", { cursor: "{{SHOW_ID}} x" }).parts;
  assert.equal(q.url, `${BASE_URL}/shows?cursor={{SHOW_ID}}+x`);
});

test("snippets match what the proxy sends for every demo", () => {
  const tokens = {
    SHOW_ID: "086df56b-c77d-436d-bff5-5ac154016aac",
    PRODUCT_ID: "647559331",
    VARIANT_ID: "VmFyaWFudDox",
    REPORT_ID: "r-1",
    ORDER_ID: "11",
    ORDER_ITEM_ID: "12",
    SHIPMENT_ID: "13",
    SHIPMENT_ITEM_ID: "14",
  };
  for (const f of FUNCTIONS) {
    const args = resolveTokens(f.demo, tokens);
    const built = buildRequest(f, args);
    const { parts } = snip(f.name, args);
    assert.equal(parts.url, built.url.toString(), f.name);
    assert.equal(parts.method, built.method, f.name);
    if (built.body === undefined) assert.equal(parts.body, null, f.name);
    else assert.deepEqual(JSON.parse(parts.body), built.body, f.name);
  }
});

test("Python body is a valid Python literal", () => {
  const { snippets } = snip("update_a_product_s_merchandising", {
    product_id: "5",
    body: { transaction_type: null, reserve_for_live: false, shows: { strategy: "ADD", show_ids: [] }, live: true },
  });
  assert.match(snippets.python, /"transaction_type": None/);
  assert.match(snippets.python, /"reserve_for_live": False/);
  assert.match(snippets.python, /"live": True/);
  assert.match(snippets.python, /"show_ids": \[\]/);
  assert.match(snippets.python, /^import json$/m);
  assert.doesNotMatch(snippets.python, /\brequests\b/);
  const get = snip("list_products", { limit: 2 }).snippets.python;
  assert.doesNotMatch(get, /^import json$/m, "no json import without a body");
  assert.match(get, /import urllib\.request/);
});

test("the JavaScript snippet runs and sends the same request", async () => {
  const seen = [];
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      seen.push({ method: req.method, url: req.url, headers: req.headers, raw });
      res.writeHead(201, { "content-type": "application/json" });
      res.end('{"id":"999"}');
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const dir = await mkdtemp(join(tmpdir(), "wad-snippet-"));
  try {
    const f = BY_NAME.get("update_a_product");
    const body = { title: "It's \"quoted\" & ünï", n: 1.5 };
    const base = `http://127.0.0.1:${server.address().port}/seller-api/rest/v2`;
    const { javascript } = buildSnippets({ method: f.method, path: f.path, base, params: f.params, args: { product_id: "42", body } });
    const file = join(dir, "run.mjs");
    await writeFile(file, javascript);
    const out = await new Promise((ok, fail) => {
      const child = spawn(process.execPath, [file], { env: { ...process.env, WHATNOT_API_KEY: "fake-key-for-test" } });
      let text = "";
      child.stdout.on("data", (c) => (text += c));
      child.stderr.on("data", (c) => (text += c));
      child.on("error", fail);
      child.on("close", (code) => ok({ code, text }));
    });
    assert.equal(out.code, 0, out.text);
    assert.match(out.text, /Status: 201/);
    assert.match(out.text, /"id":"999"/);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].method, "PATCH");
    assert.equal(seen[0].url, "/seller-api/rest/v2/products/42");
    assert.equal(seen[0].headers.authorization, "Bearer fake-key-for-test");
    assert.equal(seen[0].headers.accept, "application/json");
    assert.equal(seen[0].headers["content-type"], "application/json");
    assert.deepEqual(JSON.parse(seen[0].raw), body);
  } finally {
    await new Promise((r) => server.close(r));
    await rm(dir, { recursive: true, force: true });
  }
});
