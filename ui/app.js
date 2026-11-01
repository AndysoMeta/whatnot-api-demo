// Whatnot API Demo explorer UI. Plain browser JavaScript, no build step.
// Everything from fixtures is shown with textContent, never as HTML.

import { buildSnippets } from "./snippets.mjs";

const NO_TOKEN_MESSAGE = "No API token set. Paste your Seller API token in the box at the top of the page to run live. Recorded responses are shown instead.";
const TOKEN_KEY = "whatnot-api-demo.token";
const WRITE_LABEL = "I understand this changes data on my Whatnot account";

const state = {
  base: "",
  tags: [],
  functions: [],
  byName: new Map(),
  run: null,
  fixtures: {},
  tokens: {},
  liveTokens: {},
  status: { token: false, allowWrites: false },
  scopes: [],
  pageToken: "",
  tokenStored: false,
};

// ---------- small helpers ----------

function el(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? "" : String(v));
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

function pretty(value) {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function resolveTokens(value, tokens) {
  if (typeof value === "string") {
    return value.replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => (tokens[k] != null ? tokens[k] : m));
  }
  if (Array.isArray(value)) return value.map((v) => resolveTokens(v, tokens));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolveTokens(v, tokens);
    return out;
  }
  return value;
}

function leftTokens(text) {
  return [...new Set([...text.matchAll(/\{\{([A-Z_]+)\}\}/g)].map((m) => m[1]))];
}

function formatTime(iso) {
  if (!iso) return "unknown time";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString();
}

function badge(safety) {
  return el("span", { class: `badge ${safety}`, text: safety });
}

function statusCode(code) {
  const ok = code >= 200 && code < 300;
  return el("span", { class: ok ? "code-ok" : "code-bad", text: String(code) });
}

async function getJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  return res.json();
}

async function loadFixtures() {
  try {
    const data = await getJson("/api/fixtures");
    state.run = data.run || null;
    state.fixtures = data.fixtures || {};
    state.tokens = data.tokens || {};
  } catch {
    state.run = null;
    state.fixtures = {};
    state.tokens = {};
  }
}

// Ids learned from live runs in this tab (a product you just created, its
// variant, a report) win over the recorded ones, so the other pages prefill
// with something that still exists. Kept in sessionStorage, so a closed tab
// forgets them.
const LIVE_IDS_KEY = "whatnot-demo-live-ids";

function loadLiveTokens() {
  try {
    const raw = window.sessionStorage.getItem(LIVE_IDS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    state.liveTokens = parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    state.liveTokens = {};
  }
}

function saveLiveTokens() {
  try {
    window.sessionStorage.setItem(LIVE_IDS_KEY, JSON.stringify(state.liveTokens));
  } catch {
    // Storage may be blocked; the ids then last only until the page reloads.
  }
}

function effectiveTokens() {
  return { ...state.tokens, ...state.liveTokens };
}

function firstRowId(body) {
  const row = body?.data?.[0];
  return row && row.id != null ? String(row.id) : undefined;
}

// Returns a plain sentence about what was remembered, or "" when nothing was.
function rememberLiveIds(name, args, body) {
  const learned = {};
  const set = (k, v) => {
    if (v != null && v !== "") learned[k] = String(v);
  };
  switch (name) {
    case "create_a_product":
    case "get_a_product":
    case "update_a_product":
      set("PRODUCT_ID", body?.id);
      break;
    case "list_product_variants":
      set("PRODUCT_ID", args?.product_id);
      set("VARIANT_ID", firstRowId(body));
      break;
    case "get_a_product_variant":
      set("PRODUCT_ID", args?.product_id);
      set("VARIANT_ID", body?.id);
      break;
    case "update_product_variants":
      set("PRODUCT_ID", args?.product_id);
      set("VARIANT_ID", body?.variants?.[0]?.id);
      break;
    case "generate_a_report":
      set("REPORT_ID", body?.id);
      break;
    case "list_orders":
      set("ORDER_ID", firstRowId(body));
      break;
    case "list_order_items":
      set("ORDER_ID", args?.order_id);
      set("ORDER_ITEM_ID", firstRowId(body));
      break;
    case "list_shipments":
      set("SHIPMENT_ID", firstRowId(body));
      break;
    case "list_shipment_items":
      set("SHIPMENT_ID", args?.shipment_id);
      set("SHIPMENT_ITEM_ID", firstRowId(body));
      break;
    case "delete_a_product":
      if (args?.product_id && state.liveTokens.PRODUCT_ID === String(args.product_id)) {
        delete state.liveTokens.PRODUCT_ID;
        delete state.liveTokens.VARIANT_ID;
        saveLiveTokens();
        return "That product is gone, so the other pages go back to the recorded ids.";
      }
      return "";
    default:
      return "";
  }
  const changed = Object.entries(learned).filter(([k, v]) => state.liveTokens[k] !== v);
  if (!changed.length) return "";
  Object.assign(state.liveTokens, learned);
  saveLiveTokens();
  const words = changed.map(([k, v]) => k.toLowerCase().replaceAll("_", " ") + " " + v);
  return "Remembered " + words.join(" and ") + " for the other pages in this tab.";
}

function tourOrder() {
  const names = state.functions.map((f) => f.name);
  const fromRun = Array.isArray(state.run?.order) ? state.run.order.filter((n) => state.byName.has(n)) : [];
  const seen = new Set();
  const order = [];
  for (const n of [...fromRun, ...names]) {
    if (!seen.has(n)) {
      seen.add(n);
      order.push(n);
    }
  }
  return order;
}

// ---------- your API token ----------
// The token lives only in this browser: sessionStorage by default, localStorage
// when "Remember on this computer" is ticked. It is sent only to this page's own
// server, in the X-Whatnot-Token header, which forwards it to api.whatnot.com.

function storeFor(remember) {
  try {
    return remember ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function storageGet(remember) {
  try {
    return storeFor(remember)?.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

function storageSet(remember, value) {
  try {
    const store = storeFor(remember);
    if (!store) return false;
    store.setItem(TOKEN_KEY, value);
    return true;
  } catch {
    return false;
  }
}

function storageRemove(remember) {
  try {
    storeFor(remember)?.removeItem(TOKEN_KEY);
  } catch {
    // nothing stored, or storage blocked
  }
}

function hasToken() {
  return Boolean(state.pageToken) || Boolean(state.status.token);
}

function runHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (state.pageToken) headers["X-Whatnot-Token"] = state.pageToken;
  return headers;
}

function postRun(payload) {
  return fetch("/api/run", { method: "POST", headers: runHeaders(), body: JSON.stringify(payload) });
}

// The text Whatnot gave with an error, kept short.
function whatnotSaid(body) {
  if (body == null || body === "") return "";
  if (typeof body === "string") return body.slice(0, 300);
  const list = Array.isArray(body.errors) ? body.errors.map((e) => e?.message || e).join("; ") : "";
  const m = body.message || body.error_description || body.detail || body.error || list;
  return (typeof m === "string" && m ? m : JSON.stringify(body)).slice(0, 300);
}

// A status code from Whatnot, in plain words.
function plainStatus(code) {
  if (code === 401) return "Whatnot answered 401: the token is wrong or has expired. Make a fresh one in your Whatnot dashboard (Developer, Personal access tokens) and paste it again.";
  if (code === 403) return "Whatnot answered 403: the token works but is not allowed to do this. Check the permissions the token was given.";
  if (code === 404) return "Whatnot answered 404: nothing was found at that address or id.";
  if (code === 429) return "Whatnot answered 429: too many calls at once. Wait a moment and try again.";
  if (code >= 500) return `Whatnot answered ${code}: a problem on Whatnot's side. Try again later.`;
  return `Whatnot answered ${code}.`;
}

function tokenEnding() {
  const t = state.pageToken;
  return t.length >= 8 ? ` (ends in ${t.slice(-4)})` : "";
}

function renderTokenStatus() {
  const line = document.getElementById("token-status");
  if (state.pageToken) {
    line.textContent = state.tokenStored
      ? `Token saved${tokenEnding()}. Live runs on.`
      : `Token set for this page only${tokenEnding()}. Live runs on. This browser would not store it, so it is gone when you reload.`;
  } else if (state.status.token) {
    line.textContent = "No token pasted. The server has one from WHATNOT_API_KEY, so live runs are on.";
  } else {
    line.textContent = "No token. Recorded responses only.";
  }
  if (state.functions.length) renderStatus();
}

function setPageToken(value) {
  const remember = document.getElementById("token-remember").checked;
  storageRemove(true);
  storageRemove(false);
  state.pageToken = value;
  state.tokenStored = value ? storageSet(remember, value) : false;
  renderTokenStatus();
}

function tokenMessage(kind, text) {
  const out = document.getElementById("token-test-result");
  if (!text) out.replaceChildren();
  else out.replaceChildren(el("p", { class: `msg ${kind}`, text }));
}

function saveTyped() {
  const input = document.getElementById("token-input");
  const value = input.value.trim();
  if (!value) return false;
  setPageToken(value);
  input.value = "";
  return true;
}

async function testToken() {
  saveTyped();
  if (!hasToken()) {
    tokenMessage("warn", "Paste a token first, then press Test token.");
    return;
  }
  const btn = document.getElementById("token-test");
  btn.disabled = true;
  tokenMessage("info", "Checking with Whatnot...");
  try {
    const res = await postRun({ name: "get_the_current_user", args: {} });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      tokenMessage("warn", data.message || `The local server said no (${res.status}).`);
    } else if (data.status >= 200 && data.status < 300) {
      const who = data.body?.username || data.body?.display_name || data.body?.id || "an account with no username";
      tokenMessage("ok", `Signed in as ${who}.`);
    } else {
      const said = whatnotSaid(data.body);
      tokenMessage("warn", `${plainStatus(data.status)}${said ? ` Whatnot said: ${said}` : ""}`);
    }
  } catch (err) {
    tokenMessage("warn", `Could not reach the demo server: ${err.message}`);
  } finally {
    btn.disabled = false;
  }
}

function setupToken() {
  const remember = document.getElementById("token-remember");
  const remembered = storageGet(true);
  if (remembered) {
    state.pageToken = remembered;
    remember.checked = true;
  } else {
    state.pageToken = storageGet(false);
    remember.checked = false;
  }
  state.tokenStored = Boolean(state.pageToken);
  document.getElementById("token-form").addEventListener("submit", (e) => {
    e.preventDefault();
    if (saveTyped()) tokenMessage("", "");
    else tokenMessage("warn", "Paste a token in the box first.");
  });
  document.getElementById("token-clear").addEventListener("click", () => {
    document.getElementById("token-input").value = "";
    setPageToken("");
    tokenMessage("info", "Token cleared from this browser.");
  });
  document.getElementById("token-test").addEventListener("click", testToken);
  remember.addEventListener("change", () => {
    if (state.pageToken) setPageToken(state.pageToken);
  });
  renderTokenStatus();
}

// ---------- header and list ----------

function renderStatus() {
  const recorded = state.functions.filter((f) => state.fixtures[f.name]).length;
  const live = hasToken() ? "Live runs: on" : "Live runs: off (no token)";
  document.getElementById("status").textContent = `${live}. Recorded: ${recorded} of ${state.functions.length}.`;
}

function renderList(current) {
  const list = document.getElementById("list");
  list.replaceChildren();
  for (const tag of state.tags) {
    const fns = state.functions.filter((f) => f.tag === tag);
    if (!fns.length) continue;
    const ul = el("ul");
    for (const f of fns) {
      const recorded = Boolean(state.fixtures[f.name]);
      ul.append(
        el(
          "li",
          {},
          el(
            "button",
            {
              type: "button",
              class: "fn-btn",
              "aria-current": f.name === current ? "true" : null,
              "aria-label": `${f.title}, ${f.safety}${recorded ? "" : ", not recorded yet"}`,
              onclick: () => {
                location.hash = `#/fn/${f.name}`;
              },
            },
            el("span", { class: "t", text: f.title }),
            badge(f.safety),
            el("span", { class: "n", text: f.name }),
            recorded ? null : el("span", { class: "missing", text: "not recorded yet" }),
          ),
        ),
      );
    }
    list.append(el("h2", { text: tag }), ul);
  }
}

// ---------- shared pieces ----------

function headerBlock(f) {
  return [
    el("h2", { class: "title", text: f.title }),
    el(
      "div",
      { class: "meta" },
      badge(f.safety),
      el("span", { class: "badge tag", text: f.tag }),
      f.pathConfirmed ? null : el("span", { class: "badge unverified", text: "path unverified" }),
      el("span", { class: "fn-name", text: f.name }),
    ),
    el("p", { class: "summary", text: f.summary }),
  ];
}

function requestBlock(f) {
  return el(
    "div",
    { class: "block" },
    el("h3", { text: "Request" }),
    el("div", { class: "request" }, el("span", { class: "method", text: f.method }), state.base + f.path),
  );
}

function paramsBlock(f) {
  const parts = [];
  if (f.params.length) {
    const rows = f.params.map((p) =>
      el(
        "tr",
        {},
        el("td", {}, el("code", { text: p.name })),
        el("td", { text: p.in === "path" ? "in the path" : "in the query" }),
        el("td", { text: p.required ? "yes" : "no" }),
        el("td", { text: p.enum ? `${p.description} One of: ${p.enum.join(", ")}.` : p.description }),
      ),
    );
    parts.push(
      el(
        "table",
        {},
        el("thead", {}, el("tr", {}, el("th", { text: "Name" }), el("th", { text: "Where" }), el("th", { text: "Required" }), el("th", { text: "What it is" }))),
        el("tbody", {}, rows),
      ),
    );
  }
  if (f.body) {
    parts.push(el("details", {}, el("summary", { text: "Body shape" }), el("pre", { text: pretty(f.body) })));
  }
  if (!parts.length) parts.push(el("p", { class: "hint", text: "This function takes no inputs." }));
  return el("div", { class: "block" }, el("h3", { text: "Inputs" }), parts);
}

function recordedBlock(f, { showArgs = true } = {}) {
  const fx = state.fixtures[f.name];
  const block = el("div", { class: "block" }, el("h3", { text: "Recorded response" }));
  if (!fx) {
    block.append(el("p", { class: "empty", text: "Not recorded yet." }));
    return block;
  }
  const modeText = { live: "Ran live", error_demo: "Ran live with an id that does not exist, to show the real error", not_run: "Not run" }[fx.mode] || fx.mode;
  block.append(
    el(
      "p",
      { class: "hint" },
      `${modeText}. `,
      fx.status != null ? el("span", {}, "Status ", statusCode(fx.status), ". ") : null,
      `Recorded ${formatTime(fx.recorded_at)}.`,
    ),
  );
  if (fx.note) block.append(el("p", { class: "note", text: fx.note }));
  if (showArgs && fx.args && Object.keys(fx.args).length) {
    block.append(el("details", {}, el("summary", { text: "Args used for the recording" }), el("pre", { text: pretty(fx.args) })));
  }
  if (fx.body === "") block.append(el("p", { class: "hint", text: "The response had an empty body, which is normal for this status." }));
  else if (fx.body != null) block.append(el("pre", { text: pretty(fx.body), "aria-label": "Recorded response body" }));
  else if (fx.mode === "not_run") block.append(el("p", { class: "empty", text: "No response, because it was not run." }));
  return block;
}

// ---------- explorer detail ----------

// ---------- permissions ----------

function scopeCode(name) {
  const known = state.scopes.find((s) => s.name === name);
  return el("code", { class: "scope", title: known ? known.meaning : null, text: name });
}

function joinWords(nodes) {
  const out = [];
  nodes.forEach((n, i) => {
    if (i > 0) out.push(i === nodes.length - 1 ? " and " : ", ");
    out.push(n);
  });
  return out;
}

function permissionsBlock(f) {
  const scopes = f.scopes || { required: [], inferred: false };
  const required = Array.isArray(scopes.required) ? scopes.required : [];
  const lines = [];
  if (!required.length) {
    lines.push(el("p", { class: "perm-line", text: "Any token works." }));
  } else {
    const isWrite = required.some((s) => s.startsWith("write:"));
    lines.push(
      el(
        "p",
        { class: "perm-line" },
        "Your token needs: ",
        joinWords(required.map(scopeCode)),
        ".",
        isWrite ? " (Write includes read.)" : "",
      ),
    );
    if (scopes.inferred) {
      lines.push(el("p", { class: "hint", text: "Whatnot's reference does not state this one; it is the permission for this group." }));
    }
  }
  if (f.customerFields) {
    lines.push(el("p", { class: "hint" }, "Buyer and address fields come back empty without ", scopeCode("read:customers"), "."));
  }
  return el("div", { class: "perm" }, el("h4", { text: "Permissions" }), lines);
}

// ---------- code snippets ----------

const CODE_TAB_KEY = "whatnot-demo-code-tab";
const CODE_TABS = [
  { id: "curl", label: "curl" },
  { id: "javascript", label: "JavaScript" },
  { id: "python", label: "Python" },
  { id: "http", label: "Raw request" },
];

function loadCodeTab() {
  try {
    const v = window.sessionStorage.getItem(CODE_TAB_KEY);
    return CODE_TABS.some((t) => t.id === v) ? v : "curl";
  } catch {
    return "curl";
  }
}

function saveCodeTab(id) {
  try {
    window.sessionStorage.setItem(CODE_TAB_KEY, id);
  } catch {
    // Storage may be blocked; the tab then goes back to curl on the next page.
  }
}

function copyFallback(text) {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.className = "offscreen";
  document.body.append(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the older way
  }
  return copyFallback(text);
}

// Returns { node, update(args, problem) }. update() rebuilds the four snippets
// from the same args object the Run live button would send.
function codeBlock(f) {
  let active = loadCodeTab();
  let snippets = { curl: "", javascript: "", python: "", http: "" };
  const pre = el("pre", { class: "code", id: "code-panel", role: "tabpanel", tabindex: "0" });
  const note = el("p", { class: "hint", "aria-live": "polite" });
  const copyBtn = el("button", { type: "button", class: "copy", text: "Copy" });
  let copyTimer = null;
  const tabs = CODE_TABS.map((t) =>
    el("button", {
      type: "button",
      role: "tab",
      id: `code-tab-${t.id}`,
      "aria-controls": "code-panel",
      class: "tab",
      text: t.label,
      onclick: () => select(t.id, false),
      onkeydown: (e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        e.preventDefault();
        const i = CODE_TABS.findIndex((x) => x.id === active);
        const next = (i + (e.key === "ArrowRight" ? 1 : CODE_TABS.length - 1)) % CODE_TABS.length;
        select(CODE_TABS[next].id, true);
      },
    }),
  );

  function paint() {
    tabs.forEach((b, i) => {
      const on = CODE_TABS[i].id === active;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
    });
    pre.setAttribute("aria-labelledby", `code-tab-${active}`);
    pre.textContent = snippets[active];
  }

  function select(id, focus) {
    active = id;
    saveCodeTab(id);
    paint();
    if (focus) tabs[CODE_TABS.findIndex((t) => t.id === id)].focus();
  }

  copyBtn.addEventListener("click", async () => {
    const ok = await copyText(snippets[active]);
    copyBtn.textContent = ok ? "Copied" : "Copy failed";
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      copyBtn.textContent = "Copy";
    }, 2000);
  });

  function update(args, problem) {
    if (args) {
      snippets = buildSnippets({
        method: f.method,
        path: f.path,
        base: state.base,
        params: f.params,
        args,
        secrets: state.pageToken ? [state.pageToken] : [],
      });
    }
    note.textContent = problem || "Your token is never put in the code. Set WHATNOT_API_KEY to your token before you run it.";
    paint();
  }

  const node = el(
    "div",
    { class: "block" },
    el("div", { class: "code-head" }, el("h3", { text: "Code" }), copyBtn),
    el("div", { class: "tabs", role: "tablist", "aria-label": "Code language" }, tabs),
    pre,
    note,
  );
  return { node, update };
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

// "Rate limit: 10 per second, 7 left, resets in 1 second." plus the request id.
// Returns null when Whatnot sent none of these headers.
function headersLine(headers) {
  if (!headers || typeof headers !== "object") return null;
  const parts = [];
  const limitRaw = headers["ratelimit-limit"];
  const limit = limitRaw != null ? String(limitRaw).match(/\d+/) : null;
  const remaining = headers["ratelimit-remaining"];
  const reset = headers["ratelimit-reset"];
  const bits = [];
  if (limit) {
    const w = String(limitRaw).match(/;\s*w=(\d+)/);
    const secs = w ? Number(w[1]) : 1;
    bits.push(`${limit[0]} per ${secs === 1 ? "second" : plural(secs, "second")}`);
  }
  if (remaining != null && remaining !== "") bits.push(`${remaining} left`);
  if (reset != null && reset !== "" && Number.isFinite(Number(reset))) bits.push(`resets in ${plural(Number(reset), "second")}`);
  if (bits.length) parts.push(`Rate limit: ${bits.join(", ")}.`);
  const retry = headers["retry-after"];
  if (retry != null && retry !== "" && Number.isFinite(Number(retry))) {
    parts.push(`Whatnot asks you to wait ${plural(Number(retry), "second")} before trying again.`);
  }
  if (headers["x-request-id"]) parts.push(`Request id: ${headers["x-request-id"]}. Quote it if you write to Whatnot support.`);
  return parts.length ? el("p", { class: "hint headers-line", text: parts.join(" ") }) : null;
}

function runBlock(f, onArgs = () => {}) {
  const demoArgs = resolveTokens(f.demo, effectiveTokens());
  const textarea = el("textarea", { id: "args", spellcheck: "false", "aria-describedby": "args-hint" });
  textarea.value = pretty(demoArgs);
  const hint = el("p", { id: "args-hint", class: "hint" });
  const result = el("div", { "aria-live": "polite" });

  function updateHint() {
    const left = leftTokens(textarea.value);
    hint.textContent = left.length
      ? `Some ids are not recorded yet, so they still read ${left.map((t) => `{{${t}}}`).join(", ")}. Put a real id there before running live.`
      : "Edit the JSON to change what is sent. Ids come from the recorded run, or from your live runs in this tab.";
  }
  textarea.addEventListener("input", updateHint);
  updateHint();

  // The code block follows the textarea, about 200 ms after typing stops.
  function sendArgs() {
    try {
      const parsed = JSON.parse(textarea.value || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        onArgs(null, "The args must be a JSON object, like {}. The code shows the last good version.");
      } else {
        onArgs(parsed, "");
      }
    } catch {
      onArgs(null, "The args are not valid JSON yet. The code shows the last good version.");
    }
  }
  let argsTimer = null;
  textarea.addEventListener("input", () => {
    clearTimeout(argsTimer);
    argsTimer = setTimeout(sendArgs, 200);
  });

  // Both boxes are rebuilt with each function, so they reset when you pick another one.
  const writeBox = el("input", { type: "checkbox", id: "allow-writes" });
  const confirmBox = el("input", { type: "checkbox", id: "confirm" });
  const children = [el("h3", { text: "Try it" }), el("label", { for: "args", text: "Args (JSON)" }), textarea, hint];
  const neverRun = f.name === "disconnect_the_current_application";
  const needsWrite = f.safety !== "read" && !neverRun;
  const needsConfirm = f.safety === "destructive" && !neverRun;

  if (neverRun) {
    children.push(
      el("p", {
        class: "msg warn",
        text: "This one is never run from here. It would disconnect this app from the seller account and break the Whatnot connection. The server refuses it every time.",
      }),
    );
  }
  if (needsWrite) {
    children.push(el("label", { class: "check caution", for: "allow-writes" }, writeBox, WRITE_LABEL));
  }
  if (needsConfirm) {
    children.push(
      el("label", { class: "check danger", for: "confirm" }, confirmBox, "I understand this runs for real and may cancel, ship, charge or delete."),
    );
  }

  const runBtn = el("button", { type: "button", class: "primary", text: "Run live" });
  const resetBtn = el("button", {
    type: "button",
    text: "Reset to demo",
    onclick: () => {
      textarea.value = pretty(resolveTokens(f.demo, effectiveTokens()));
      updateHint();
      sendArgs();
      result.replaceChildren();
    },
  });

  runBtn.addEventListener("click", async () => {
    let args;
    try {
      args = JSON.parse(textarea.value || "{}");
    } catch (err) {
      result.replaceChildren(el("p", { class: "msg warn", text: `The args are not valid JSON: ${err.message}` }));
      return;
    }
    // The page asks every time, even when the server was started with ALLOW_WRITES=true.
    if (hasToken() && needsWrite && !writeBox.checked) {
      result.replaceChildren(el("p", { class: "msg warn", text: `This changes data on Whatnot. Tick "${WRITE_LABEL}" to run it live.` }));
      return;
    }
    if (hasToken() && needsConfirm && !confirmBox.checked) {
      result.replaceChildren(el("p", { class: "msg warn", text: "This can cancel, ship, charge or delete for real. Tick the red confirm box to run it live." }));
      return;
    }
    runBtn.disabled = true;
    result.replaceChildren(el("p", { class: "hint", text: "Running..." }));
    try {
      const res = await postRun({
        name: f.name,
        args,
        allowWrites: needsWrite && writeBox.checked === true,
        confirm: needsConfirm && confirmBox.checked === true,
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data.error === "no_token") {
        result.replaceChildren(
          el("p", { class: "msg info", text: NO_TOKEN_MESSAGE }),
          el("p", { class: "hint", text: "Or paste your token under Your API token at the top of the page." }),
        );
      } else if (!res.ok) {
        result.replaceChildren(el("p", { class: "msg warn", text: data.message || `The server said no (${res.status}).` }));
      } else {
        const ok = data.status >= 200 && data.status < 300;
        const remembered = ok ? rememberLiveIds(f.name, args, data.body) : "";
        result.replaceChildren(
          el("p", { class: "hint" }, "Live response. Status ", statusCode(data.status), "."),
          ok ? "" : el("p", { class: "msg warn", text: plainStatus(data.status) }),
          remembered ? el("p", { class: "msg ok", text: remembered }) : "",
          el("pre", { text: pretty(data.body ?? null), "aria-label": "Live response body" }),
          headersLine(data.headers),
        );
      }
    } catch (err) {
      result.replaceChildren(el("p", { class: "msg warn", text: `Could not reach the demo server: ${err.message}` }));
    } finally {
      runBtn.disabled = false;
    }
  });

  children.push(el("div", { class: "row" }, runBtn, resetBtn), result);
  const node = el("div", { class: "block" }, children);
  node.sendArgs = sendArgs;
  return node;
}

function renderDetail(f) {
  const detail = document.getElementById("detail");
  const request = requestBlock(f);
  request.append(permissionsBlock(f));
  const code = codeBlock(f);
  const run = runBlock(f, code.update);
  detail.replaceChildren(...headerBlock(f), request, paramsBlock(f), run, code.node, recordedBlock(f));
  run.sendArgs();
}

// ---------- tour ----------

function renderTour(index) {
  const order = tourOrder();
  const i = Math.min(Math.max(index, 1), order.length);
  lastStep = i;
  const f = state.byName.get(order[i - 1]);
  const tour = document.getElementById("tour");
  const fx = state.fixtures[f.name];
  const args = fx?.args ?? resolveTokens(f.demo, effectiveTokens());

  const prev = el("button", {
    type: "button",
    text: "Previous",
    disabled: i <= 1,
    onclick: () => {
      location.hash = `#/tour/${i - 1}`;
    },
  });
  const next = el("button", {
    type: "button",
    class: "primary",
    text: "Next",
    disabled: i >= order.length,
    onclick: () => {
      location.hash = `#/tour/${i + 1}`;
    },
  });
  const open = el("button", {
    type: "button",
    text: "Open in explorer",
    onclick: () => {
      location.hash = `#/fn/${f.name}`;
    },
  });

  tour.replaceChildren(
    el(
      "div",
      { class: "tour-nav" },
      el("span", { class: "step", text: `${i} of ${order.length}` }),
      el("div", { class: "row" }, prev, next, open),
    ),
    ...headerBlock(f),
    requestBlock(f),
    el("div", { class: "block" }, el("h3", { text: "Args" }), el("pre", { text: pretty(args) })),
    recordedBlock(f, { showArgs: false }),
  );
}

// ---------- routing ----------

function setView(view) {
  const tour = view === "tour";
  document.getElementById("explorer").hidden = tour;
  document.getElementById("tour").hidden = !tour;
  document.getElementById("view-explorer").setAttribute("aria-pressed", String(!tour));
  document.getElementById("view-tour").setAttribute("aria-pressed", String(tour));
}

let lastFn = null;
let lastStep = 1;

async function route() {
  loadLiveTokens();
  await loadFixtures();
  renderStatus();
  const hash = location.hash || "";
  const tourMatch = hash.match(/^#\/tour\/(\d+)$/);
  if (tourMatch || hash === "#/tour") {
    lastStep = tourMatch ? Number(tourMatch[1]) : lastStep;
    setView("tour");
    renderTour(lastStep);
    return;
  }
  const fnMatch = hash.match(/^#\/fn\/([a-z0-9_]+)$/);
  const name = fnMatch && state.byName.has(fnMatch[1]) ? fnMatch[1] : lastFn || state.functions[0].name;
  lastFn = name;
  setView("explorer");
  renderList(name);
  renderDetail(state.byName.get(name));
}

async function start() {
  try {
    const [catalog, status] = await Promise.all([getJson("/api/catalog"), getJson("/api/status")]);
    state.base = catalog.base;
    state.tags = catalog.tags;
    state.functions = catalog.functions;
    state.byName = new Map(catalog.functions.map((f) => [f.name, f]));
    state.scopes = Array.isArray(catalog.scopes) ? catalog.scopes : [];
    state.status = status;
  } catch (err) {
    document.getElementById("status").textContent = `Could not load the catalog: ${err.message}`;
    return;
  }

  setupToken();
  document.getElementById("view-explorer").addEventListener("click", () => {
    location.hash = `#/fn/${lastFn || state.functions[0].name}`;
  });
  document.getElementById("view-tour").addEventListener("click", () => {
    location.hash = `#/tour/${lastStep}`;
  });
  document.addEventListener("keydown", (e) => {
    if (document.getElementById("tour").hidden) return;
    const t = e.target;
    if (t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT")) return;
    const order = tourOrder();
    if (e.key === "ArrowRight" && lastStep < order.length) location.hash = `#/tour/${lastStep + 1}`;
    if (e.key === "ArrowLeft" && lastStep > 1) location.hash = `#/tour/${lastStep - 1}`;
  });
  window.addEventListener("hashchange", route);
  await route();
}

start();
