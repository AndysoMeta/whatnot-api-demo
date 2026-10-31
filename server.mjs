// Whatnot API Demo explorer server. Zero dependencies, Node 22+.
// Serves the UI, the catalog, the recorded fixtures, and a gated live proxy
// to the Whatnot Seller REST API. The token is never logged or echoed.

import http from "node:http";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, resolve, extname, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { BASE_URL, TAGS, FUNCTIONS, BY_NAME, NEVER_RUN, buildTokens, unresolvedTokens } from "./catalog.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
export const DEFAULT_PORT = 7490;
export const FORBIDDEN_PORTS = new Set([7474, 7475, 7477, 7480, 3000]);

export const MESSAGES = {
  no_token: "No API token set. Add WHATNOT_API_KEY to run live. Recorded responses are shown instead.",
  never_run:
    "This function is never run from here. It would disconnect this app from the seller account and break the Whatnot connection until it is set up again. The recorded entry explains it instead.",
  writes_off: "This function changes data on Whatnot. Start the server with ALLOW_WRITES=true to run it live.",
  confirm_required:
    "This function can cancel, ship, charge or delete for real. Tick the confirm box to run it live.",
};

const MIN_GAP_MS = 1000; // Whatnot allows 2 per second; stay at 1 per second.
const MAX_RETRY_WAIT_MS = 60_000;
const MAX_BODY_BYTES = 1_000_000;

// ---------- fixtures ----------

// Reads fixtures/ fresh every time. A missing folder or a bad file is not an error.
export async function loadFixtures(dir) {
  const out = { run: null, fixtures: {}, errors: [] };
  let names;
  try {
    names = await readdir(dir);
  } catch {
    return out;
  }
  for (const file of names) {
    if (!file.endsWith(".json")) continue;
    const key = file.slice(0, -5);
    if (key !== "_run" && !BY_NAME.has(key)) continue;
    try {
      const data = JSON.parse(await readFile(join(dir, file), "utf8"));
      if (key === "_run") out.run = data;
      else out.fixtures[key] = data;
    } catch (err) {
      out.errors.push({ file, message: String(err?.message || err).slice(0, 200) });
    }
  }
  return out;
}

// ---------- request building ----------

export function buildRequest(fn, args, base = BASE_URL) {
  const missing = [];
  const p = fn.path.replace(/\{(\w+)\}/g, (_, k) => {
    const v = args[k];
    if (v == null || v === "") {
      missing.push(k);
      return `{${k}}`;
    }
    return encodeURIComponent(String(v));
  });
  const url = new URL(base + p);
  for (const q of fn.params) {
    if (q.in !== "query") continue;
    const v = args[q.name];
    if (v != null && v !== "") url.searchParams.set(q.name, String(v));
  }
  const sendBody = fn.method !== "GET" && fn.method !== "DELETE" && args.body !== undefined;
  return { method: fn.method, url, body: sendBody ? args.body : undefined, missing };
}

function parseRetryAfter(value) {
  if (value == null) return 1000;
  const secs = Number(value);
  if (Number.isFinite(secs)) return Math.min(Math.max(secs * 1000, 0), MAX_RETRY_WAIT_MS);
  const at = Date.parse(value);
  if (Number.isFinite(at)) return Math.min(Math.max(at - Date.now(), 0), MAX_RETRY_WAIT_MS);
  return 1000;
}

async function readBody(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// Paces upstream calls to at most one per MIN_GAP_MS, in arrival order.
export function createProxy({ fetchImpl, sleep, now, minGapMs = MIN_GAP_MS }) {
  let chain = Promise.resolve();
  let last = -Infinity;

  function paced(fn) {
    const run = chain.then(async () => {
      const wait = last + minGapMs - now();
      if (wait > 0) await sleep(wait);
      last = now();
      return fn();
    });
    chain = run.catch(() => {});
    return run;
  }

  return async function call({ method, url, body, token }) {
    const init = {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    };
    let res = await paced(() => fetchImpl(url.toString(), init));
    if (res.status === 429) {
      await sleep(parseRetryAfter(res.headers?.get?.("retry-after")));
      res = await paced(() => fetchImpl(url.toString(), init));
    }
    return { status: res.status, body: await readBody(res) };
  };
}

// ---------- http helpers ----------

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
};

function send(res, code, data) {
  const text = JSON.stringify(data);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(text);
}

function readJson(req) {
  return new Promise((ok, fail) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        fail(new Error("too_large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      if (!text) return ok({});
      try {
        ok(JSON.parse(text));
      } catch {
        fail(new Error("bad_json"));
      }
    });
    req.on("error", fail);
  });
}

async function serveStatic(res, uiDir, pathname) {
  const rel = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
  const root = resolve(uiDir);
  const file = resolve(root, rel);
  if (file !== root && !file.startsWith(root + sep)) return false;
  try {
    if (!(await stat(file)).isFile()) return false;
    const data = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(data);
    return true;
  } catch {
    return false;
  }
}

// ---------- app ----------

export function createApp({
  fixturesDir = join(HERE, "fixtures"),
  uiDir = join(HERE, "ui"),
  env = process.env,
  fetchImpl = globalThis.fetch,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  now = () => Date.now(),
  log = (line) => console.log(line),
} = {}) {
  const proxy = createProxy({ fetchImpl, sleep, now });

  async function run(req, res) {
    let input;
    try {
      input = await readJson(req);
    } catch (err) {
      return send(res, 400, { error: err.message, message: "The request was not valid JSON." });
    }
    const fn = BY_NAME.get(input?.name);
    if (!fn) return send(res, 404, { error: "unknown_function", message: "There is no function with that name." });
    if (NEVER_RUN.has(fn.name)) return send(res, 403, { error: "never_run", message: MESSAGES.never_run });

    const token = String(env.WHATNOT_API_KEY ?? "").trim();
    if (!token) return send(res, 409, { error: "no_token", message: MESSAGES.no_token });

    if (fn.safety !== "read" && env.ALLOW_WRITES !== "true") {
      return send(res, 403, { error: "writes_off", message: MESSAGES.writes_off });
    }
    if (fn.safety === "destructive" && input.confirm !== true) {
      return send(res, 403, { error: "confirm_required", message: MESSAGES.confirm_required });
    }

    const args = input.args ?? {};
    if (typeof args !== "object" || Array.isArray(args)) {
      return send(res, 400, { error: "bad_args", message: "The args must be a JSON object, like {}." });
    }
    const left = unresolvedTokens(args);
    if (left.length) {
      return send(res, 400, {
        error: "unresolved_token",
        tokens: left,
        message: `Replace ${left.map((t) => `{{${t}}}`).join(", ")} with a real id first. Nothing is recorded for it yet.`,
      });
    }
    const built = buildRequest(fn, args);
    if (built.missing.length) {
      return send(res, 400, {
        error: "missing_param",
        params: built.missing,
        message: `Fill in ${built.missing.join(", ")} in the args first.`,
      });
    }

    try {
      const result = await proxy({ ...built, token });
      log(`run ${fn.name} ${fn.method} ${built.url.pathname} -> ${result.status}`);
      return send(res, 200, { ...result, method: fn.method, url: built.url.toString() });
    } catch (err) {
      log(`run ${fn.name} -> network error`);
      return send(res, 502, {
        error: "network_error",
        message: `Could not reach Whatnot: ${String(err?.message || err).replaceAll(token, "[token]")}`,
      });
    }
  }

  return async function handler(req, res) {
    try {
      const { pathname } = new URL(req.url, "http://local");
      if (req.method === "GET" && pathname === "/api/catalog") {
        return send(res, 200, { base: BASE_URL, tags: TAGS, functions: FUNCTIONS });
      }
      if (req.method === "GET" && pathname === "/api/status") {
        return send(res, 200, {
          token: Boolean(String(env.WHATNOT_API_KEY ?? "").trim()),
          allowWrites: env.ALLOW_WRITES === "true",
        });
      }
      if (req.method === "GET" && pathname === "/api/fixtures") {
        const all = await loadFixtures(fixturesDir);
        return send(res, 200, { ...all, tokens: buildTokens(all.run, all.fixtures) });
      }
      const m = pathname.match(/^\/api\/fixtures\/([A-Za-z0-9_]+)$/);
      if (req.method === "GET" && m) {
        const name = m[1];
        if (name !== "_run" && !BY_NAME.has(name)) {
          return send(res, 404, { error: "unknown_function", message: "There is no function with that name." });
        }
        const all = await loadFixtures(fixturesDir);
        const data = name === "_run" ? all.run : all.fixtures[name];
        if (!data) return send(res, 404, { error: "not_recorded", message: "Not recorded yet." });
        return send(res, 200, data);
      }
      if (pathname === "/api/run") {
        if (req.method !== "POST") return send(res, 405, { error: "method_not_allowed" });
        return await run(req, res);
      }
      if (pathname.startsWith("/api/")) return send(res, 404, { error: "not_found" });
      if (req.method === "GET" && (await serveStatic(res, uiDir, pathname))) return;
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
    } catch (err) {
      log(`error ${String(err?.message || err).slice(0, 200)}`);
      if (!res.headersSent) send(res, 500, { error: "server_error" });
      else res.end();
    }
  };
}

export async function startServer(options = {}) {
  const env = options.env ?? process.env;
  const port = options.port ?? Number(env.PORT || DEFAULT_PORT);
  if (FORBIDDEN_PORTS.has(port)) throw new Error(`Port ${port} belongs to another project on this machine. Pick another PORT.`);
  const host = options.host ?? env.HOST ?? "127.0.0.1";
  const server = http.createServer(createApp({ ...options, env }));
  return new Promise((ok, fail) => {
    server.once("error", fail);
    server.listen(port, host, () => ok(server));
  });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  startServer()
    .then((server) => {
      const { port } = server.address();
      const token = Boolean(String(process.env.WHATNOT_API_KEY ?? "").trim());
      console.log(`Whatnot API Demo on http://localhost:${port}`);
      console.log(`Live runs: ${token ? "token set" : "no token, recorded responses only"}. Writes: ${process.env.ALLOW_WRITES === "true" ? "on" : "off"}.`);
    })
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
