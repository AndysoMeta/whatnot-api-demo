import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FUNCTIONS } from "../catalog.mjs";
import { MESSAGES } from "../server.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const EM_DASH = String.fromCharCode(0x2014);
const BANNED = /\b(Cadance|Cadence|Wave|Claude|AI)\b/;

async function own(files) {
  const out = [];
  for (const f of files) {
    try {
      out.push([f, await readFile(join(ROOT, f), "utf8")]);
    } catch {
      // docs/EXPLORER.md may not exist in a partial checkout
    }
  }
  return out;
}

test("no em dashes in the files this app owns", async () => {
  const ui = (await readdir(join(ROOT, "ui"))).map((f) => `ui/${f}`);
  const tests = (await readdir(join(ROOT, "test"))).map((f) => `test/${f}`);
  for (const [name, text] of await own(["catalog.mjs", "server.mjs", "package.json", "docs/EXPLORER.md", ...ui, ...tests])) {
    assert.ok(!text.includes(EM_DASH), `${name} has an em dash`);
  }
});

test("UI text has no banned brand words", async () => {
  const ui = (await readdir(join(ROOT, "ui"))).map((f) => `ui/${f}`);
  for (const [name, text] of await own(ui)) assert.doesNotMatch(text, BANNED, name);
  for (const f of FUNCTIONS) {
    assert.doesNotMatch(`${f.title} ${f.summary} ${JSON.stringify(f.params)} ${JSON.stringify(f.body)}`, BANNED, f.name);
  }
  for (const m of Object.values(MESSAGES)) assert.doesNotMatch(m, BANNED);
});

test("UI carries the byline and the exact no-token message", async () => {
  const html = await readFile(join(ROOT, "ui", "index.html"), "utf8");
  assert.match(html, /Mood Swings Design/);
  const js = await readFile(join(ROOT, "ui", "app.js"), "utf8");
  assert.ok(js.includes(MESSAGES.no_token));
});
