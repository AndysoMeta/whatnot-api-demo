// List every product on your Whatnot account, page by page.
// Node 22+, no dependencies. Run: node list-all-products.mjs
// Reads only. Nothing is written to your Whatnot account.
//
// The limit is 10 requests per second per seller per app, so this waits
// about 150 ms between pages, and honours one 429 per page by waiting
// Retry-After seconds and trying again.

import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

export const BASE_URL = "https://api.whatnot.com/seller-api/rest/v2";
const PAUSE_MS = 150;

const defaultSleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function problemOf(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

// Yields the data array of each page until next_cursor is null.
export async function* pages(path, token, params = {}, options = {}) {
  const { fetchImpl = globalThis.fetch, sleep = defaultSleep, baseUrl = BASE_URL, pauseMs = PAUSE_MS } = options;
  let cursor = null;
  let first = true;
  do {
    if (!first) await sleep(pauseMs);
    first = false;

    const url = new URL(baseUrl + path);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
    if (cursor) url.searchParams.set("cursor", cursor);

    let res;
    for (let attempt = 0; ; attempt++) {
      res = await fetchImpl(url.toString(), {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "X-Request-ID": crypto.randomUUID(),
        },
      });
      if (res.status !== 429 || attempt > 0) break;
      const wait = Number(res.headers.get("retry-after"));
      await sleep((Number.isFinite(wait) && wait >= 0 ? wait : 1) * 1000);
    }

    if (!res.ok) {
      const problem = await problemOf(res);
      const parts = [`Whatnot answered ${res.status}`];
      if (problem?.type) parts.push(`type ${problem.type}`);
      if (typeof problem?.detail === "string") parts.push(problem.detail);
      const err = new Error(parts.join(", "));
      err.status = res.status;
      err.problem = problem;
      err.requestId = res.headers.get("x-request-id");
      throw err;
    }

    const page = await res.json();
    yield page.data ?? [];
    cursor = page.next_cursor ?? null;
  } while (cursor);
}

async function main() {
  const token = process.env.WHATNOT_API_KEY;
  if (!token) {
    console.log("WHATNOT_API_KEY is not set. Set it to your Seller API token and run this again.");
    process.exit(1);
  }
  let count = 0;
  try {
    for await (const rows of pages("/products", token, { limit: 50 })) {
      for (const p of rows) {
        // Products carry no status field in the API, so the category stands in.
        console.log(`${p.id}  ${p.title}  ${p.status ?? p.category?.name ?? "-"}`);
        count++;
      }
    }
  } catch (err) {
    console.log(err.message);
    if (err.status === 401) console.log("The token is wrong or has expired.");
    if (Array.isArray(err.problem?.required_scopes)) console.log(`Required scopes: ${err.problem.required_scopes.join(", ")}`);
    if (err.requestId) console.log(`Request id: ${err.requestId}`);
    process.exit(1);
  }
  console.log(`${count} product${count === 1 ? "" : "s"}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
