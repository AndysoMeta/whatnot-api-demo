// Code snippets for one Seller API request: curl, JavaScript, Python and the raw
// HTTP request. Plain ES module with no imports, so the page and the tests share it.
//
// The request is built the same way server.mjs buildRequest builds it, so a
// snippet sends what the "Run live" button sends: {path} placeholders come from
// args, query params present in args go in the query string, and args.body is
// the JSON body for POST, PATCH and PUT. GET and DELETE never have a body.
//
// The token is never put in a snippet. Snippets read WHATNOT_API_KEY from the
// environment, and the raw request says <your token>. Any Whatnot token found in
// the args, or any string passed in `secrets`, becomes [token].
// {{TOKEN}} markers that are still unresolved pass through as written.

const MARKER = /(\{\{[A-Z_]+\}\})/;
const WHATNOT_TOKEN = /wn_(?:pat|access)_tk_[A-Za-z0-9_\-]+/g;
const PLACEHOLDER_TOKEN = "<your token>";

function scrubString(text, secrets) {
  let out = String(text).replace(WHATNOT_TOKEN, "[token]");
  for (const s of secrets) if (s) out = out.split(s).join("[token]");
  return out;
}

function scrubValue(value, secrets) {
  if (typeof value === "string") return scrubString(value, secrets);
  if (Array.isArray(value)) return value.map((v) => scrubValue(v, secrets));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[scrubString(k, secrets)] = scrubValue(v, secrets);
    return out;
  }
  return value;
}

// Encodes text with `encode` but leaves {{TOKEN}} markers as they are.
function encodeKeepingMarkers(text, encode) {
  return String(text)
    .split(MARKER)
    .map((part) => (MARKER.test(part) ? part : encode(part)))
    .join("");
}

// The same encoding URLSearchParams uses (application/x-www-form-urlencoded).
function formEncode(text) {
  return new URLSearchParams([["", text]]).toString().slice(1);
}

function hasBody(method, args) {
  return method !== "GET" && method !== "DELETE" && args.body !== undefined;
}

function prettyJson(value) {
  return JSON.stringify(value, null, 2);
}

/**
 * Builds the request for display.
 * Returns { url, method, headers, body } where body is pretty JSON text or null.
 */
export function buildRequestParts({ method, path, base, params = [], args = {}, secrets = [] }) {
  const safeArgs = scrubValue(args && typeof args === "object" && !Array.isArray(args) ? args : {}, secrets);
  const m = String(method || "GET").toUpperCase();
  const p = String(path || "").replace(/\{(\w+)\}/g, (_, k) => {
    const v = safeArgs[k];
    if (v == null || v === "") return `{${k}}`;
    return encodeKeepingMarkers(v, encodeURIComponent);
  });
  const query = [];
  for (const q of params) {
    if (q.in !== "query") continue;
    const v = safeArgs[q.name];
    if (v != null && v !== "") query.push(`${formEncode(q.name)}=${encodeKeepingMarkers(v, formEncode)}`);
  }
  const url = String(base || "") + p + (query.length ? `?${query.join("&")}` : "");
  const withBody = hasBody(m, safeArgs);
  const headers = { Authorization: `Bearer ${PLACEHOLDER_TOKEN}`, Accept: "application/json" };
  if (withBody) headers["Content-Type"] = "application/json";
  return { url, method: m, headers, body: withBody ? prettyJson(safeArgs.body) : null };
}

// ---------- languages ----------

function shellQuote(text) {
  return `'${String(text).replaceAll("'", `'\\''`)}'`;
}

function curlSnippet(parts) {
  const lines = [
    "# Set WHATNOT_API_KEY to your Seller API token first.",
    `curl -sS -X ${parts.method} ${shellQuote(parts.url)} \\`,
    `  -H "Authorization: Bearer $WHATNOT_API_KEY" \\`,
    `  -H "Accept: application/json" \\`,
  ];
  if (parts.body == null) {
    lines.push(`  -w "\\nStatus: %{http_code}\\n"`);
    return lines.join("\n") + "\n";
  }
  // The body goes in on stdin from a quoted heredoc: no shell escaping, and
  // non-ASCII text arrives as UTF-8 on every platform.
  lines.push(
    `  -H "Content-Type: application/json" \\`,
    `  -w "\\nStatus: %{http_code}\\n" \\`,
    `  --data-binary @- <<'JSON'`,
    parts.body,
    "JSON",
  );
  return lines.join("\n") + "\n";
}

function javascriptSnippet(parts) {
  const lines = [
    "// Node 18 or newer, no packages needed. Set WHATNOT_API_KEY to your Seller API token first.",
    `const url = ${JSON.stringify(parts.url)};`,
  ];
  if (parts.body != null) lines.push(`const body = ${parts.body};`);
  lines.push(
    "",
    "async function main() {",
    "  const res = await fetch(url, {",
    `    method: ${JSON.stringify(parts.method)},`,
    "    headers: {",
    "      Authorization: `Bearer ${process.env.WHATNOT_API_KEY}`,",
    `      Accept: "application/json",`,
  );
  if (parts.body != null) lines.push(`      "Content-Type": "application/json",`);
  lines.push("    },");
  if (parts.body != null) lines.push("    body: JSON.stringify(body),");
  lines.push(
    "  });",
    "  console.log(`Status: ${res.status}`);",
    "  console.log(await res.text());",
    "}",
    "",
    "main().catch((err) => {",
    "  console.error(err);",
    "  process.exit(1);",
    "});",
  );
  return lines.join("\n") + "\n";
}

// A JSON value written as a Python literal, 2-space indent.
function pythonLiteral(value, pad = "") {
  if (value === null || value === undefined) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  if (typeof value === "number") return Number.isFinite(value) ? JSON.stringify(value) : "None";
  if (typeof value === "string") return JSON.stringify(value);
  const inner = pad + "  ";
  if (Array.isArray(value)) {
    if (!value.length) return "[]";
    return `[\n${value.map((v) => inner + pythonLiteral(v, inner)).join(",\n")},\n${pad}]`;
  }
  const entries = Object.entries(value);
  if (!entries.length) return "{}";
  return `{\n${entries.map(([k, v]) => `${inner}${JSON.stringify(k)}: ${pythonLiteral(v, inner)}`).join(",\n")},\n${pad}}`;
}

function pythonSnippet(parts) {
  const withBody = parts.body != null;
  const lines = [
    "# Python 3, standard library only. Set WHATNOT_API_KEY to your Seller API token first.",
    ...(withBody ? ["import json"] : []),
    "import os",
    "import urllib.error",
    "import urllib.request",
    "",
    `url = ${JSON.stringify(parts.url)}`,
  ];
  if (withBody) lines.push(`body = ${pythonLiteral(JSON.parse(parts.body))}`);
  lines.push(
    "",
    "headers = {",
    `    "Authorization": "Bearer " + os.environ["WHATNOT_API_KEY"],`,
    `    "Accept": "application/json",`,
    `    # Whatnot sits behind Cloudflare, which blocks Python's default user agent (error 1010).`,
    `    "User-Agent": "whatnot-api-demo/1.0",`,
  );
  if (withBody) lines.push(`    "Content-Type": "application/json",`);
  lines.push("}");
  lines.push(
    withBody
      ? `request = urllib.request.Request(url, data=json.dumps(body).encode("utf-8"), headers=headers, method=${JSON.stringify(parts.method)})`
      : `request = urllib.request.Request(url, headers=headers, method=${JSON.stringify(parts.method)})`,
    "",
    "try:",
    "    with urllib.request.urlopen(request) as response:",
    `        print("Status:", response.status)`,
    `        print(response.read().decode("utf-8"))`,
    "except urllib.error.HTTPError as error:",
    `    print("Status:", error.code)`,
    `    print(error.read().decode("utf-8"))`,
  );
  return lines.join("\n") + "\n";
}

function byteLength(text) {
  return new TextEncoder().encode(text).length;
}

function httpSnippet(parts) {
  let host = "";
  let target = parts.url;
  const m = parts.url.match(/^[a-z]+:\/\/([^/?#]+)(.*)$/i);
  if (m) {
    host = m[1];
    target = m[2] || "/";
  }
  const lines = [`${parts.method} ${target} HTTP/1.1`, `Host: ${host}`];
  for (const [k, v] of Object.entries(parts.headers)) lines.push(`${k}: ${v}`);
  if (parts.body != null) lines.push(`Content-Length: ${byteLength(parts.body)}`);
  lines.push("");
  if (parts.body != null) lines.push(parts.body);
  return lines.join("\n") + (parts.body != null ? "\n" : "");
}

/**
 * Returns { curl, javascript, python, http } for one request.
 * Input: { method, path, base, params, args, secrets? } where params is the
 * catalog entry's params list and args is the same object "Run live" sends.
 */
export function buildSnippets(input) {
  const parts = buildRequestParts(input);
  return {
    curl: curlSnippet(parts),
    javascript: javascriptSnippet(parts),
    python: pythonSnippet(parts),
    http: httpSnippet(parts),
  };
}
