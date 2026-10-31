import { test } from "node:test";
import assert from "node:assert/strict";
import { FUNCTIONS, TAGS, TOKENS, BASE_URL, buildTokens, resolveTokens, unresolvedTokens } from "../catalog.mjs";

// The 34 names and tags exactly as CONTRACT.md lists them.
const EXPECTED = {
  Users: ["get_the_current_user", "disconnect_the_current_application"],
  Shows: ["list_shows", "get_a_show"],
  Analytics: ["get_show_analytics", "generate_a_report", "get_a_report", "list_reports"],
  Products: [
    "list_products",
    "create_a_product",
    "get_a_product",
    "update_a_product",
    "delete_a_product",
    "list_product_variants",
    "get_a_product_variant",
    "update_product_variants",
    "list_a_product_s_shows",
  ],
  Inventory: ["set_inventory", "adjust_inventory"],
  Merchandising: ["get_a_product_s_merchandising", "update_a_product_s_merchandising"],
  Shipping: ["list_dimension_profiles", "get_a_dimension_profile"],
  Orders: [
    "list_orders",
    "get_an_order",
    "list_order_items",
    "get_an_order_item",
    "cancel_an_order",
    "add_a_tracking_code_to_order_items",
  ],
  Shipments: ["list_shipments", "get_a_shipment", "list_shipment_items", "get_a_shipment_item", "request_a_shipping_label"],
};
const EXPECTED_NAMES = Object.values(EXPECTED).flat();
const DESTRUCTIVE = [
  "cancel_an_order",
  "add_a_tracking_code_to_order_items",
  "request_a_shipping_label",
  "delete_a_product",
  "disconnect_the_current_application",
];

test("catalog has exactly the 34 contract names", () => {
  assert.equal(EXPECTED_NAMES.length, 34);
  assert.equal(FUNCTIONS.length, 34);
  assert.deepEqual([...FUNCTIONS.map((f) => f.name)].sort(), [...EXPECTED_NAMES].sort());
});

test("catalog has no duplicate names", () => {
  const names = FUNCTIONS.map((f) => f.name);
  assert.equal(new Set(names).size, names.length);
});

test("every entry has the required fields with sane values", () => {
  for (const f of FUNCTIONS) {
    for (const key of ["name", "title", "tag", "safety", "method", "path", "summary", "params", "body", "demo", "pathConfirmed"]) {
      assert.ok(key in f, `${f.name} is missing ${key}`);
    }
    assert.ok(["read", "write", "destructive"].includes(f.safety), `${f.name} safety`);
    assert.ok(["GET", "POST", "PATCH", "PUT", "DELETE"].includes(f.method), `${f.name} method`);
    assert.ok(f.path.startsWith("/"), `${f.name} path`);
    assert.equal(typeof f.summary, "string");
    assert.ok(f.summary.length > 10, `${f.name} summary`);
    assert.ok(Array.isArray(f.params), `${f.name} params`);
    assert.ok(f.body === null || typeof f.body === "object", `${f.name} body`);
    assert.equal(typeof f.demo, "object");
    assert.equal(typeof f.pathConfirmed, "boolean");
  }
});

test("each entry sits under the tag the contract gives", () => {
  assert.deepEqual(TAGS, Object.keys(EXPECTED));
  for (const [tag, names] of Object.entries(EXPECTED)) {
    for (const n of names) assert.equal(FUNCTIONS.find((f) => f.name === n).tag, tag, n);
  }
});

test("safety classes follow the contract", () => {
  for (const f of FUNCTIONS) {
    if (f.safety === "read") assert.equal(f.method, "GET", `${f.name} read must be GET`);
    if (f.method === "GET") assert.equal(f.safety, "read", `${f.name} GET must be read`);
  }
  assert.deepEqual(
    FUNCTIONS.filter((f) => f.safety === "destructive").map((f) => f.name).sort(),
    [...DESTRUCTIVE].sort(),
  );
});

test("every path placeholder is a declared path param with a demo value", () => {
  for (const f of FUNCTIONS) {
    const inPath = [...f.path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    const declared = f.params.filter((p) => p.in === "path").map((p) => p.name);
    assert.deepEqual(inPath.sort(), declared.sort(), f.name);
    for (const p of inPath) assert.ok(f.demo[p], `${f.name} demo has ${p}`);
    for (const p of f.params) assert.ok(["path", "query"].includes(p.in), `${f.name} ${p.name}`);
  }
});

test("body-taking functions demo a body and others do not", () => {
  for (const f of FUNCTIONS) {
    if (f.body) assert.ok(f.demo.body && typeof f.demo.body === "object", `${f.name} demo body`);
    else assert.equal(f.demo.body, undefined, `${f.name} has no body`);
  }
});

test("demo args use only known tokens", () => {
  for (const f of FUNCTIONS) {
    for (const t of unresolvedTokens(f.demo)) assert.ok(TOKENS.includes(t), `${f.name} uses {{${t}}}`);
  }
});

test("destructive demos never point at real orders or shipments", () => {
  const byName = Object.fromEntries(FUNCTIONS.map((f) => [f.name, f]));
  assert.equal(byName.cancel_an_order.demo.order_id, "1");
  assert.deepEqual(byName.add_a_tracking_code_to_order_items.demo.body.order_item_ids, ["1"]);
  assert.equal(byName.request_a_shipping_label.demo.shipment_id, "1");
  assert.match(byName.create_a_product.demo.body.title, /^API DEMO TEST ITEM/);
});

test("base url is the v2 Seller REST API", () => {
  assert.equal(BASE_URL, "https://api.whatnot.com/seller-api/rest/v2");
});

test("tokens resolve from _run.json and list fixtures", () => {
  const tokens = buildTokens(
    { show_id: "S1", demo_product_id: "P1", demo_variant_id: "V1", report_id: "R1" },
    { list_orders: { body: { data: [{ id: "77" }] } } },
  );
  assert.deepEqual(tokens, { SHOW_ID: "S1", PRODUCT_ID: "P1", VARIANT_ID: "V1", REPORT_ID: "R1", ORDER_ID: "77" });
  const out = resolveTokens({ a: "{{SHOW_ID}}", b: ["x{{PRODUCT_ID}}"], c: 3, d: "{{SHIPMENT_ID}}" }, tokens);
  assert.deepEqual(out, { a: "S1", b: ["xP1"], c: 3, d: "{{SHIPMENT_ID}}" });
  assert.deepEqual(unresolvedTokens(out), ["SHIPMENT_ID"]);
  assert.deepEqual(buildTokens(null, {}), {});
});
