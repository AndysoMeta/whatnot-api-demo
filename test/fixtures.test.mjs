import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadFixtures, startServer } from "../server.mjs";

let root;
let dir;
let server;
let base;

before(async () => {
  root = await mkdtemp(join(tmpdir(), "wad-fx-"));
  dir = join(root, "fixtures");
  server = await startServer({ port: 0, env: {}, fixturesDir: dir, fetchImpl: () => Promise.reject(new Error("no network in tests")), log: () => {} });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((r) => server.close(r));
  await rm(root, { recursive: true, force: true });
});

test("loader tolerates a missing fixtures folder", async () => {
  const out = await loadFixtures(join(root, "does-not-exist"));
  assert.deepEqual(out, { run: null, fixtures: {}, errors: [] });
});

test("/api/fixtures works before the folder exists", async () => {
  const res = await fetch(`${base}/api/fixtures`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { run: null, fixtures: {}, errors: [], tokens: {} });
  const one = await fetch(`${base}/api/fixtures/get_a_show`);
  assert.equal(one.status, 404);
  assert.equal((await one.json()).error, "not_recorded");
});

test("fixtures are read fresh on every request", async () => {
  await mkdir(dir, { recursive: true });
  let data = await (await fetch(`${base}/api/fixtures`)).json();
  assert.deepEqual(data.fixtures, {});

  const fx = {
    function: "get_a_show",
    tag: "Shows",
    safety: "read",
    mode: "live",
    recorded_at: "2026-10-31T08:40:00.000Z",
    args: { show_id: "086df56b-c77d-436d-bff5-5ac154016aac" },
    status: 200,
    body: { id: "086df56b-c77d-436d-bff5-5ac154016aac", title: "Boring Show" },
    note: "Fetched the private test show.",
  };
  await writeFile(join(dir, "get_a_show.json"), JSON.stringify(fx));
  await writeFile(
    join(dir, "_run.json"),
    JSON.stringify({ show_id: "086df56b-c77d-436d-bff5-5ac154016aac", demo_product_id: "123", order: ["get_a_show"] }),
  );

  data = await (await fetch(`${base}/api/fixtures`)).json();
  assert.deepEqual(data.fixtures.get_a_show, fx);
  assert.equal(data.run.demo_product_id, "123");
  assert.deepEqual(data.tokens, { SHOW_ID: "086df56b-c77d-436d-bff5-5ac154016aac", PRODUCT_ID: "123" });

  const one = await fetch(`${base}/api/fixtures/get_a_show`);
  assert.equal(one.status, 200);
  assert.deepEqual(await one.json(), fx);
  const run = await fetch(`${base}/api/fixtures/_run`);
  assert.equal(run.status, 200);
});

test("a broken fixture file is reported, not fatal", async () => {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "list_shows.json"), "{ half written");
  await writeFile(join(dir, "notes.txt"), "ignored");
  await writeFile(join(dir, "not_a_function.json"), "{}");
  const res = await fetch(`${base}/api/fixtures`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.fixtures.list_shows, undefined);
  assert.equal(data.fixtures.not_a_function, undefined);
  assert.equal(data.errors.length, 1);
  assert.equal(data.errors[0].file, "list_shows.json");
});

test("unknown fixture names are refused", async () => {
  assert.equal((await fetch(`${base}/api/fixtures/not_a_function`)).status, 404);
  assert.equal((await fetch(`${base}/api/fixtures/..%2Fpackage`)).status, 404);
});
