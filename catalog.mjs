// Catalog of the 34 Whatnot Seller API functions shown by the explorer.
// Names match the MCP connector tool names. Paths are relative to BASE_URL and
// were checked against https://developers.whatnot.com/api-reference on 2026-10-31.
// Params and body shapes come from the MCP tool schemas.

export const BASE_URL = "https://api.whatnot.com/seller-api/rest/v2";

export const TAGS = [
  "Users",
  "Shows",
  "Analytics",
  "Products",
  "Inventory",
  "Merchandising",
  "Shipping",
  "Orders",
  "Shipments",
];

// Tokens the demo args may contain. The first four come from fixtures/_run.json.
// The rest are filled from recorded list responses (first row) when present.
export const TOKENS = [
  "SHOW_ID",
  "PRODUCT_ID",
  "VARIANT_ID",
  "REPORT_ID",
  "ORDER_ID",
  "ORDER_ITEM_ID",
  "SHIPMENT_ID",
  "SHIPMENT_ITEM_ID",
];

// The 12 permissions (scopes) a Seller API token can be given, with Whatnot's
// own one-line meaning. SCOPES_NOTE: write access includes read access.
// Each FUNCTIONS entry names the ones it needs in `scopes.required`;
// `scopes.inferred` is true where Whatnot's reference does not state it and
// the permission of the function's group is assumed.
// `customerFields: true` marks orders and shipments functions whose buyer,
// recipient and destination_address come back null without read:customers.
export const SCOPES_NOTE = "Write access to a resource includes read access.";

export const SCOPES = [
  { name: "read:inventory", meaning: "Read your product inventory" },
  { name: "write:inventory", meaning: "Write to your product inventory", includes: "read:inventory" },
  { name: "read:merchandising", meaning: "Read how and where your products are sold" },
  { name: "write:merchandising", meaning: "Change how and where your products are sold", includes: "read:merchandising" },
  { name: "read:orders", meaning: "Read your orders" },
  { name: "write:orders", meaning: "Write to your orders", includes: "read:orders" },
  { name: "read:shipments", meaning: "Retrieve your shipment details" },
  {
    name: "write:shipments",
    meaning: "Make changes to your shipments (including generating a shipping label)",
    includes: "read:shipments",
  },
  { name: "read:customers", meaning: "Read your customer's information such as address, email, and phone number" },
  { name: "read:reports", meaning: "Read your financial reports" },
  { name: "write:reports", meaning: "Generate reports about your finances", includes: "read:reports" },
  { name: "read:shows", meaning: "Read your shows" },
];

const ID = "decimal id, for example 647559331";
const UUID = "uuid, for example 086df56b-c77d-436d-bff5-5ac154016aac";

function path(name, description, type = "string") {
  return { name, in: "path", type, required: true, description };
}
function query(name, description, type = "string", extra = {}) {
  return { name, in: "query", type, required: false, description, ...extra };
}

const PAGE = [
  query("limit", "How many rows per page, 1 to 50. Default 10.", "integer", { min: 1, max: 50, default: 10 }),
  query("cursor", "The next_cursor value from the previous page, to get the next page.", "string"),
  query("reverse", "true lists newest first (the default), false lists oldest first.", "boolean", { default: true }),
];

const MONEY = { amount: "string, for example \"5.00\"", currency: "string, for example \"USD\"" };
const WEIGHT = { value: "number", unit: "ounce | pound | gram | kilogram" };
const DIMENSIONS = { length: "number", width: "number", height: "number", unit: "inch | feet | centimeter | meter" };
const DIMENSION_PROFILE = {
  id: "string id of a saved profile (use this OR weight and dimensions)",
  weight: WEIGHT,
  dimensions: DIMENSIONS,
};
const PRODUCT_FIELDS = {
  title: "string",
  description: "string or null",
  category: { id: "string id, for example \"265\"" },
  dimension_profile: DIMENSION_PROFILE,
  external_id: "string up to 150 characters, or null",
  attributes: [{ id: "string id", value: "string" }],
  media: [{ url: "string", alt: "string or null" }],
  options: [{ name: "string", values: ["string"] }],
};

export const FUNCTIONS = [
  // Users
  {
    name: "get_the_current_user",
    title: "Get the current user",
    tag: "Users",
    safety: "read",
    scopes: { required: [], inferred: false },
    method: "GET",
    path: "/users/me",
    pathConfirmed: true,
    summary: "Shows which Whatnot seller account the connection is signed in as.",
    params: [],
    body: null,
    demo: {},
  },
  {
    name: "disconnect_the_current_application",
    title: "Disconnect the current application",
    tag: "Users",
    safety: "destructive",
    scopes: { required: [], inferred: false },
    method: "POST",
    path: "/users/disconnect",
    pathConfirmed: true,
    summary: "Cuts this app's access to the seller account, so every later call fails until the seller connects it again.",
    params: [],
    body: null,
    demo: {},
  },

  // Shows
  {
    name: "list_shows",
    title: "List shows",
    tag: "Shows",
    safety: "read",
    scopes: { required: ["read:shows"], inferred: false },
    method: "GET",
    path: "/shows",
    pathConfirmed: true,
    summary: "Lists the seller's shows with a given status, such as scheduled or live.",
    params: [
      query("status", "Only shows with this status. Default scheduled.", "string", {
        enum: ["scheduled", "live", "stopped", "ended", "cancelled"],
      }),
      ...PAGE,
    ],
    body: null,
    demo: { status: "live", limit: 10 },
  },
  {
    name: "get_a_show",
    title: "Get a show",
    tag: "Shows",
    safety: "read",
    scopes: { required: ["read:shows"], inferred: false },
    method: "GET",
    path: "/shows/{show_id}",
    pathConfirmed: true,
    summary: "Shows the details of one show: its title, status and start time.",
    params: [path("show_id", `The show's id, a ${UUID}.`)],
    body: null,
    demo: { show_id: "{{SHOW_ID}}" },
  },

  // Analytics
  {
    name: "get_show_analytics",
    title: "Get show analytics",
    tag: "Analytics",
    safety: "read",
    scopes: { required: ["read:reports"], inferred: false },
    method: "GET",
    path: "/analytics/shows/{show_id}",
    pathConfirmed: true,
    summary: "Shows the numbers for one show, such as viewers and sales.",
    params: [path("show_id", `The show's id, a ${UUID}.`)],
    body: null,
    demo: { show_id: "{{SHOW_ID}}" },
  },
  {
    name: "generate_a_report",
    title: "Generate a report",
    tag: "Analytics",
    safety: "write",
    scopes: { required: ["write:reports"], inferred: false },
    method: "POST",
    path: "/reports",
    pathConfirmed: true,
    summary: "Asks Whatnot to build a report, such as a financial report for a date range, and gives back a report id to check on.",
    params: [],
    body: {
      report_parameters: {
        report_type: "seller_financial_report | analytics_overview_report | analytics_livestreams_report",
        start_date: "seller_financial_report only: ISO time like 2026-10-01T00:00:00.000Z, or null",
        end_date: "seller_financial_report only: ISO time, or null",
        start_at: "analytics_overview_report only, required: ISO time",
        end_at: "analytics_overview_report only, required: ISO time",
        all_matching: "analytics_livestreams_report only: { title, start_time: { start, end } }",
        specific_shows: "analytics_livestreams_report only: { show_ids: [uuid, up to 100] }",
      },
    },
    demo: {
      body: {
        report_parameters: {
          report_type: "seller_financial_report",
          start_date: "2026-10-01T00:00:00.000Z",
          end_date: "2026-10-31T00:00:00.000Z",
        },
      },
    },
  },
  {
    name: "get_a_report",
    title: "Get a report",
    tag: "Analytics",
    safety: "read",
    scopes: { required: ["read:reports"], inferred: false },
    method: "GET",
    path: "/reports/{report_id}",
    pathConfirmed: true,
    summary: "Checks on one report: whether it is finished and where to download it.",
    params: [path("report_id", `The report run's id, a ${UUID}.`)],
    body: null,
    demo: { report_id: "{{REPORT_ID}}" },
  },
  {
    name: "list_reports",
    title: "List reports",
    tag: "Analytics",
    safety: "read",
    scopes: { required: ["read:reports"], inferred: false },
    method: "GET",
    path: "/reports",
    pathConfirmed: true,
    summary: "Lists the reports the seller has asked for, newest first.",
    params: [
      query("status", "Only reports with this status.", "string", {
        enum: ["pending", "in_progress", "completed", "failed", "cancelled"],
      }),
      ...PAGE,
    ],
    body: null,
    demo: { limit: 10 },
  },

  // Products
  {
    name: "list_products",
    title: "List products",
    tag: "Products",
    safety: "read",
    scopes: { required: ["read:inventory"], inferred: true },
    method: "GET",
    path: "/products",
    pathConfirmed: true,
    summary: "Lists the products in the seller's inventory.",
    params: [...PAGE],
    body: null,
    demo: { limit: 10 },
  },
  {
    name: "create_a_product",
    title: "Create a product",
    tag: "Products",
    safety: "write",
    scopes: { required: ["write:inventory"], inferred: true },
    method: "POST",
    path: "/products",
    pathConfirmed: true,
    summary: "Adds a new product to the seller's inventory with a title, category and shipping size.",
    params: [],
    body: {
      ...PRODUCT_FIELDS,
      _required: ["title", "category", "dimension_profile"],
      _note: "options holds up to 3 entries.",
    },
    demo: {
      body: {
        title: "API DEMO TEST ITEM",
        description: "Made by the Whatnot API Demo. Safe to delete.",
        category: { id: "265" },
        dimension_profile: { id: "123059" },
      },
    },
  },
  {
    name: "get_a_product",
    title: "Get a product",
    tag: "Products",
    safety: "read",
    scopes: { required: ["read:inventory"], inferred: true },
    method: "GET",
    path: "/products/{product_id}",
    pathConfirmed: true,
    summary: "Shows everything about one product: title, category, variants and photos.",
    params: [path("product_id", `The product's id, a ${ID}.`)],
    body: null,
    demo: { product_id: "{{PRODUCT_ID}}" },
  },
  {
    name: "update_a_product",
    title: "Update a product",
    tag: "Products",
    safety: "write",
    scopes: { required: ["write:inventory"], inferred: true },
    method: "PATCH",
    path: "/products/{product_id}",
    pathConfirmed: true,
    summary: "Changes some details of a product, such as its title or description. Fields left out stay as they are.",
    params: [path("product_id", `The product's id, a ${ID}.`)],
    body: { ...PRODUCT_FIELDS, _note: "Every field is optional. Send only what should change." },
    demo: {
      product_id: "{{PRODUCT_ID}}",
      body: {
        title: "API DEMO TEST ITEM (updated)",
        description: "Updated by the Whatnot API Demo. Safe to delete.",
      },
    },
  },
  {
    name: "delete_a_product",
    title: "Delete a product",
    tag: "Products",
    safety: "destructive",
    scopes: { required: ["write:inventory"], inferred: true },
    method: "DELETE",
    path: "/products/{product_id}",
    pathConfirmed: true,
    summary: "Removes a product from the seller's inventory for good.",
    params: [path("product_id", `The product's id, a ${ID}.`)],
    body: null,
    demo: { product_id: "{{PRODUCT_ID}}" },
  },
  {
    name: "list_product_variants",
    title: "List product variants",
    tag: "Products",
    safety: "read",
    scopes: { required: ["read:inventory"], inferred: true },
    method: "GET",
    path: "/products/{product_id}/variants",
    pathConfirmed: true,
    summary: "Lists the versions of a product (for example each size or color), each with its own price and stock.",
    params: [path("product_id", `The product's id, a ${ID}.`), ...PAGE],
    body: null,
    demo: { product_id: "{{PRODUCT_ID}}", limit: 10 },
  },
  {
    name: "get_a_product_variant",
    title: "Get a product variant",
    tag: "Products",
    safety: "read",
    scopes: { required: ["read:inventory"], inferred: true },
    method: "GET",
    path: "/products/{product_id}/variants/{id}",
    pathConfirmed: true,
    summary: "Shows one version of a product, with its SKU, price and stock.",
    params: [path("product_id", `The product's id, a ${ID}.`), path("id", `The variant's id, a ${UUID}.`)],
    body: null,
    demo: { product_id: "{{PRODUCT_ID}}", id: "{{VARIANT_ID}}" },
  },
  {
    name: "update_product_variants",
    title: "Update product variants",
    tag: "Products",
    safety: "write",
    scopes: { required: ["write:inventory"], inferred: true },
    method: "PATCH",
    path: "/products/{product_id}/variants",
    pathConfirmed: true,
    summary: "Changes the SKU, price or photo of up to 10 versions of a product at once.",
    params: [path("product_id", `The product's id, a ${ID}.`)],
    body: {
      variants: [
        {
          id: "string variant id (required)",
          sku: "string up to 255 characters, or null",
          external_id: "string up to 255 characters, or null",
          country_of_origin: "string or null",
          price: MONEY,
          media: [{ url: "string", alt: "string or null" }],
        },
      ],
      allow_partial_updates: "boolean, default false. false means one bad variant rejects the whole batch with a 422.",
      _note: "variants holds 1 to 10 entries. media holds exactly 1 entry when given. price is the one price field (since 2026-11-05) and applies under the product's transaction_type, buy it now or auction.",
    },
    demo: {
      product_id: "{{PRODUCT_ID}}",
      body: {
        variants: [
          {
            id: "{{VARIANT_ID}}",
            sku: "API-DEMO-001",
            price: { amount: "5.00", currency: "USD" },
          },
        ],
      },
    },
  },
  {
    name: "list_a_product_s_shows",
    title: "List a product's shows",
    tag: "Products",
    safety: "read",
    scopes: { required: ["read:merchandising", "read:shows"], inferred: false },
    method: "GET",
    path: "/merchandising/products/{product_id}/shows",
    pathConfirmed: true,
    summary: "Lists the shows a product has been added to.",
    params: [path("product_id", `The product's id, a ${ID}.`), ...PAGE],
    body: null,
    demo: { product_id: "{{PRODUCT_ID}}", limit: 10 },
  },

  // Inventory
  {
    name: "set_inventory",
    title: "Set inventory",
    tag: "Inventory",
    safety: "write",
    scopes: { required: ["write:inventory"], inferred: true },
    method: "POST",
    path: "/inventory/set",
    pathConfirmed: true,
    summary: "Sets how many of a product version are in stock to an exact number.",
    params: [],
    body: {
      items: [
        {
          variant_id: "string (required)",
          quantity: "integer 0 or more (required)",
          idempotency_key: "string 1 to 255 characters (required). Sending the same key again changes nothing.",
        },
      ],
      _note: "items holds 1 to 10 entries.",
    },
    demo: {
      body: { items: [{ variant_id: "{{VARIANT_ID}}", quantity: 3, idempotency_key: "api-demo-set-3" }] },
    },
  },
  {
    name: "adjust_inventory",
    title: "Adjust inventory",
    tag: "Inventory",
    safety: "write",
    scopes: { required: ["write:inventory"], inferred: true },
    method: "POST",
    path: "/inventory/adjust",
    pathConfirmed: true,
    summary: "Adds to or takes away from the stock count of a product version, for example plus 1.",
    params: [],
    body: {
      items: [
        {
          variant_id: "string (required)",
          delta: "integer, positive adds and negative removes (required)",
          idempotency_key: "string 1 to 255 characters (required). Sending the same key again changes nothing.",
        },
      ],
      _note: "items holds 1 to 10 entries.",
    },
    demo: {
      body: { items: [{ variant_id: "{{VARIANT_ID}}", delta: 1, idempotency_key: "api-demo-adjust-plus-1" }] },
    },
  },

  // Merchandising
  {
    name: "get_a_product_s_merchandising",
    title: "Get a product's merchandising",
    tag: "Merchandising",
    safety: "read",
    scopes: { required: ["read:merchandising"], inferred: false },
    method: "GET",
    path: "/merchandising/products/{product_id}",
    pathConfirmed: true,
    summary: "Shows how a product is set to sell: buy it now or auction, and whether it is held for live shows.",
    params: [path("product_id", `The product's id, a ${ID}.`)],
    body: null,
    demo: { product_id: "{{PRODUCT_ID}}" },
  },
  {
    name: "update_a_product_s_merchandising",
    title: "Update a product's merchandising",
    tag: "Merchandising",
    safety: "write",
    scopes: { required: ["write:merchandising"], inferred: false },
    method: "POST",
    path: "/merchandising/products/{product_id}",
    pathConfirmed: true,
    summary: "Changes how a product sells and which shows it is in, for example adding it to a show as buy it now.",
    params: [path("product_id", `The product's id, a ${ID}.`)],
    body: {
      transaction_type: "buy_it_now | auction, or null",
      reserve_for_live: "boolean or null",
      shows: { strategy: "ADD | REMOVE | REPLACE (required)", show_ids: ["uuid, up to 25 (required)"] },
    },
    demo: {
      product_id: "{{PRODUCT_ID}}",
      body: {
        transaction_type: "buy_it_now",
        reserve_for_live: false,
        shows: { strategy: "ADD", show_ids: ["{{SHOW_ID}}"] },
      },
    },
  },

  // Shipping
  {
    name: "list_dimension_profiles",
    title: "List dimension profiles",
    tag: "Shipping",
    safety: "read",
    scopes: { required: ["read:inventory"], inferred: false },
    method: "GET",
    path: "/shipping/dimension_profiles",
    pathConfirmed: true,
    summary: "Lists the saved package sizes and weights the seller can pick for a product.",
    params: [...PAGE],
    body: null,
    demo: { limit: 10 },
  },
  {
    name: "get_a_dimension_profile",
    title: "Get a dimension profile",
    tag: "Shipping",
    safety: "read",
    scopes: { required: ["read:inventory"], inferred: false },
    method: "GET",
    path: "/shipping/dimension_profiles/{dimension_profile_id}",
    pathConfirmed: true,
    summary: "Shows one saved package size: its name, weight and box size.",
    params: [path("dimension_profile_id", `The dimension profile's id, a ${ID}.`)],
    body: null,
    demo: { dimension_profile_id: "905466" },
  },

  // Orders
  {
    name: "list_orders",
    title: "List orders",
    tag: "Orders",
    safety: "read",
    scopes: { required: ["read:orders"], inferred: false },
    customerFields: true,
    method: "GET",
    path: "/orders",
    pathConfirmed: true,
    summary: "Lists the seller's orders, newest first.",
    params: [...PAGE],
    body: null,
    demo: { limit: 5 },
  },
  {
    name: "get_an_order",
    title: "Get an order",
    tag: "Orders",
    safety: "read",
    scopes: { required: ["read:orders"], inferred: false },
    customerFields: true,
    method: "GET",
    path: "/orders/{order_id}",
    pathConfirmed: true,
    summary: "Shows one order: what was bought, the total and its status.",
    params: [path("order_id", `The order's id, a ${ID}.`)],
    body: null,
    demo: { order_id: "{{ORDER_ID}}" },
  },
  {
    name: "list_order_items",
    title: "List order items",
    tag: "Orders",
    safety: "read",
    scopes: { required: ["read:orders"], inferred: false },
    customerFields: true,
    method: "GET",
    path: "/orders/{order_id}/items",
    pathConfirmed: true,
    summary: "Lists the separate items inside one order.",
    params: [path("order_id", `The order's id, a ${ID}.`), ...PAGE],
    body: null,
    demo: { order_id: "{{ORDER_ID}}", limit: 10 },
  },
  {
    name: "get_an_order_item",
    title: "Get an order item",
    tag: "Orders",
    safety: "read",
    scopes: { required: ["read:orders"], inferred: false },
    customerFields: true,
    method: "GET",
    path: "/orders/{order_id}/items/{item_id}",
    pathConfirmed: true,
    summary: "Shows one item inside an order, with its price and shipping status.",
    params: [path("order_id", `The order's id, a ${ID}.`), path("item_id", `The order item's id, a ${ID}.`)],
    body: null,
    demo: { order_id: "{{ORDER_ID}}", item_id: "{{ORDER_ITEM_ID}}" },
  },
  {
    name: "cancel_an_order",
    title: "Cancel an order",
    tag: "Orders",
    safety: "destructive",
    scopes: { required: ["write:orders"], inferred: false },
    method: "POST",
    path: "/orders/{order_id}/cancel",
    pathConfirmed: true,
    summary: "Cancels a buyer's order and gives the reason. The demo uses order id 1, which does not exist, so only the error comes back.",
    params: [path("order_id", `The order's id, a ${ID}.`)],
    body: { reason: "item_damaged | item_sold | item_missing | break_did_not_fill | other (required)" },
    demo: { order_id: "1", body: { reason: "other" } },
  },
  {
    name: "add_a_tracking_code_to_order_items",
    title: "Add a tracking code to order items",
    tag: "Orders",
    safety: "destructive",
    scopes: { required: ["write:shipments"], inferred: false },
    method: "POST",
    path: "/shipments/add_tracking_code",
    pathConfirmed: true,
    summary: "Attaches a carrier tracking number to order items you shipped yourself. The demo uses item id 1, which does not exist.",
    params: [],
    body: {
      order_item_ids: ["decimal id string, 1 to 100 (required)"],
      tracking_code: "string (required)",
      carrier: "string, for example usps (required)",
    },
    demo: { body: { order_item_ids: ["1"], tracking_code: "9400100000000000000000", carrier: "usps" } },
  },

  // Shipments
  {
    name: "list_shipments",
    title: "List shipments",
    tag: "Shipments",
    safety: "read",
    scopes: { required: ["read:shipments"], inferred: true },
    customerFields: true,
    method: "GET",
    path: "/shipments",
    pathConfirmed: true,
    summary: "Lists the packages the seller needs to send or has sent.",
    params: [...PAGE],
    body: null,
    demo: { limit: 5 },
  },
  {
    name: "get_a_shipment",
    title: "Get a shipment",
    tag: "Shipments",
    safety: "read",
    scopes: { required: ["read:shipments"], inferred: false },
    customerFields: true,
    method: "GET",
    path: "/shipments/{shipment_id}",
    pathConfirmed: true,
    summary: "Shows one package: its status, label and tracking.",
    params: [path("shipment_id", `The shipment's id, a ${ID}.`)],
    body: null,
    demo: { shipment_id: "{{SHIPMENT_ID}}" },
  },
  {
    name: "list_shipment_items",
    title: "List shipment items",
    tag: "Shipments",
    safety: "read",
    scopes: { required: ["read:shipments"], inferred: true },
    customerFields: true,
    method: "GET",
    path: "/shipments/{shipment_id}/items",
    pathConfirmed: true,
    summary: "Lists the items packed in one shipment.",
    params: [path("shipment_id", `The shipment's id, a ${ID}.`), ...PAGE],
    body: null,
    demo: { shipment_id: "{{SHIPMENT_ID}}", limit: 10 },
  },
  {
    name: "get_a_shipment_item",
    title: "Get a shipment item",
    tag: "Shipments",
    safety: "read",
    scopes: { required: ["read:shipments"], inferred: true },
    customerFields: true,
    method: "GET",
    path: "/shipments/{shipment_id}/items/{item_id}",
    pathConfirmed: true,
    summary: "Shows one item inside a shipment.",
    params: [path("shipment_id", `The shipment's id, a ${ID}.`), path("item_id", `The shipment item's id, a ${ID}.`)],
    body: null,
    demo: { shipment_id: "{{SHIPMENT_ID}}", item_id: "{{SHIPMENT_ITEM_ID}}" },
  },
  {
    name: "request_a_shipping_label",
    title: "Request a shipping label",
    tag: "Shipments",
    safety: "destructive",
    scopes: { required: ["write:shipments"], inferred: true },
    method: "POST",
    path: "/shipments/{shipment_id}/generate_label",
    pathConfirmed: true,
    summary: "Buys a postage label for a shipment, which costs money. The demo uses shipment id 1, which does not exist.",
    params: [path("shipment_id", `The shipment's id, a ${ID}.`)],
    body: null,
    demo: { shipment_id: "1" },
  },
];

export const BY_NAME = new Map(FUNCTIONS.map((f) => [f.name, f]));

// Never run, whatever the gates say: it would cut off the seller's connector.
export const NEVER_RUN = new Set(["disconnect_the_current_application"]);

function firstId(fixture) {
  const row = fixture?.body?.data?.[0];
  return row && row.id != null ? String(row.id) : undefined;
}

// Builds the token values from what is recorded. Missing values are left out.
export function buildTokens(run, fixtures = {}) {
  const t = {};
  const set = (k, v) => {
    if (v != null && v !== "") t[k] = String(v);
  };
  set("SHOW_ID", run?.show_id);
  set("PRODUCT_ID", run?.demo_product_id);
  set("VARIANT_ID", run?.demo_variant_id);
  set("REPORT_ID", run?.report_id);
  set("ORDER_ID", firstId(fixtures.list_orders));
  set("ORDER_ITEM_ID", firstId(fixtures.list_order_items));
  set("SHIPMENT_ID", firstId(fixtures.list_shipments));
  set("SHIPMENT_ITEM_ID", firstId(fixtures.list_shipment_items));
  return t;
}

// Replaces {{TOKEN}} in every string of a JSON value. Unknown tokens stay as written.
export function resolveTokens(value, tokens) {
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

// Lists the {{TOKEN}} markers still present in a JSON value.
export function unresolvedTokens(value) {
  const found = new Set();
  const walk = (v) => {
    if (typeof v === "string") for (const m of v.matchAll(/\{\{([A-Z_]+)\}\}/g)) found.add(m[1]);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(value);
  return [...found];
}
