// First call to the Whatnot Seller API: who does this token belong to?
// Node 22+, no dependencies. Run: node first-call.mjs
// Reads only. Nothing is written to your Whatnot account.

const BASE_URL = "https://api.whatnot.com/seller-api/rest/v2";
const TOKENS_PAGE = "https://www.whatnot.com/dashboard/developer?tab=tokens";

const token = process.env.WHATNOT_API_KEY;
if (!token) {
  console.log("WHATNOT_API_KEY is not set. Set it to your Seller API token and run this again.");
  console.log(`Tokens are made in the developer dashboard: ${TOKENS_PAGE}`);
  process.exit(1);
}

const requestId = crypto.randomUUID();

let res;
try {
  res = await fetch(`${BASE_URL}/users/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "X-Request-ID": requestId,
    },
  });
} catch (err) {
  console.log(`Could not reach Whatnot: ${err.message}`);
  console.log(`Request id: ${requestId}`);
  process.exit(1);
}

const text = await res.text();
let body = null;
try {
  body = JSON.parse(text);
} catch {
  // not JSON, keep body null
}

if (res.status === 200) {
  console.log(`Signed in as ${body?.username ?? "(no username in the answer)"}`);
  process.exit(0);
}

console.log(`Whatnot answered ${res.status}.`);
if (body?.type) console.log(`Type: ${body.type}`);
if (typeof body?.detail === "string") console.log(`Detail: ${body.detail}`);

if (res.status === 401) {
  console.log("The token is wrong or has expired.");
  console.log(`Get a new one in the dashboard's Developer tab, Personal access tokens: ${TOKENS_PAGE}`);
} else if (res.status === 403) {
  console.log("The token is missing a permission this call needs.");
  if (Array.isArray(body?.required_scopes)) console.log(`Required scopes: ${body.required_scopes.join(", ")}`);
} else if (res.status === 429) {
  console.log(`Too many requests. Retry after ${res.headers.get("retry-after") ?? "a few"} seconds.`);
}

// Quote this id if you contact Whatnot support.
console.log(`Request id: ${res.headers.get("x-request-id") ?? requestId}`);
process.exit(1);
