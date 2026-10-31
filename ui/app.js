// Whatnot API Demo explorer UI. Plain browser JavaScript, no build step.
// Everything from fixtures is shown with textContent, never as HTML.

const NO_TOKEN_MESSAGE = "No API token set. Add WHATNOT_API_KEY to run live. Recorded responses are shown instead.";

const state = {
  base: "",
  tags: [],
  functions: [],
  byName: new Map(),
  run: null,
  fixtures: {},
  tokens: {},
  status: { token: false, allowWrites: false },
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

// ---------- header and list ----------

function renderStatus() {
  const recorded = state.functions.filter((f) => state.fixtures[f.name]).length;
  const live = state.status.token ? "Live runs: on" : "Live runs: off (no token)";
  const writes = state.status.allowWrites ? "Writes: on" : "Writes: off";
  document.getElementById("status").textContent =
    `${live}. ${writes}. Recorded: ${recorded} of ${state.functions.length}.`;
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

function runBlock(f) {
  const demoArgs = resolveTokens(f.demo, state.tokens);
  const textarea = el("textarea", { id: "args", spellcheck: "false", "aria-describedby": "args-hint" });
  textarea.value = pretty(demoArgs);
  const hint = el("p", { id: "args-hint", class: "hint" });
  const result = el("div", { "aria-live": "polite" });

  function updateHint() {
    const left = leftTokens(textarea.value);
    hint.textContent = left.length
      ? `Some ids are not recorded yet, so they still read ${left.map((t) => `{{${t}}}`).join(", ")}. Put a real id there before running live.`
      : "Edit the JSON to change what is sent. Ids come from the recorded run.";
  }
  textarea.addEventListener("input", updateHint);
  updateHint();

  const confirmBox = el("input", { type: "checkbox", id: "confirm" });
  const children = [el("h3", { text: "Try it" }), el("label", { for: "args", text: "Args (JSON)" }), textarea, hint];

  if (f.name === "disconnect_the_current_application") {
    children.push(
      el("p", {
        class: "msg warn",
        text: "This one is never run from here. It would disconnect this app from the seller account and break the Whatnot connection. The server refuses it every time.",
      }),
    );
  } else if (f.safety === "destructive") {
    children.push(
      el("label", { class: "check", for: "confirm" }, confirmBox, "I understand this runs for real and may cancel, ship, charge or delete."),
    );
  }
  if (f.safety !== "read" && !state.status.allowWrites && f.name !== "disconnect_the_current_application") {
    children.push(el("p", { class: "hint", text: "This changes data, so it also needs ALLOW_WRITES=true when the server starts." }));
  }

  const runBtn = el("button", { type: "button", class: "primary", text: "Run live" });
  const resetBtn = el("button", {
    type: "button",
    text: "Reset to demo",
    onclick: () => {
      textarea.value = pretty(resolveTokens(f.demo, state.tokens));
      updateHint();
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
    runBtn.disabled = true;
    result.replaceChildren(el("p", { class: "hint", text: "Running..." }));
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: f.name, args, confirm: confirmBox.checked === true }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data.error === "no_token") {
        result.replaceChildren(el("p", { class: "msg info", text: NO_TOKEN_MESSAGE }));
      } else if (!res.ok) {
        result.replaceChildren(el("p", { class: "msg warn", text: data.message || `The server said no (${res.status}).` }));
      } else {
        result.replaceChildren(
          el("p", { class: "hint" }, "Live response. Status ", statusCode(data.status), "."),
          el("pre", { text: pretty(data.body ?? null), "aria-label": "Live response body" }),
        );
      }
    } catch (err) {
      result.replaceChildren(el("p", { class: "msg warn", text: `Could not reach the demo server: ${err.message}` }));
    } finally {
      runBtn.disabled = false;
    }
  });

  children.push(el("div", { class: "row" }, runBtn, resetBtn), result);
  return el("div", { class: "block" }, children);
}

function renderDetail(f) {
  const detail = document.getElementById("detail");
  detail.replaceChildren(...headerBlock(f), requestBlock(f), paramsBlock(f), runBlock(f), recordedBlock(f));
}

// ---------- tour ----------

function renderTour(index) {
  const order = tourOrder();
  const i = Math.min(Math.max(index, 1), order.length);
  lastStep = i;
  const f = state.byName.get(order[i - 1]);
  const tour = document.getElementById("tour");
  const fx = state.fixtures[f.name];
  const args = fx?.args ?? resolveTokens(f.demo, state.tokens);

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
    state.status = status;
  } catch (err) {
    document.getElementById("status").textContent = `Could not load the catalog: ${err.message}`;
    return;
  }

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
