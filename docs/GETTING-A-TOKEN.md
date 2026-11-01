# Getting a token

After reading this you will be able to make a personal access token in your Whatnot dashboard, pick the right permissions for it, paste it into the explorer, and know what to do if it ever leaks.

Whatnot API Demo, a free tool by Mood Swings Design.

A token is a long secret string that says "this request comes from me". Every call to the Seller API needs one. The API address is `https://api.whatnot.com/seller-api/rest/v2` and the token goes in an `Authorization: Bearer <token>` header. Calls that send a body also need `Content-Type: application/json`. The explorer does both for you.

## Make a personal access token

Only the owner of the Whatnot account can create and manage tokens.

1. Sign in to Whatnot in your browser.
2. Open https://www.whatnot.com/dashboard/developer?tab=tokens. This is the "Personal access tokens" tab of the developer dashboard.
3. Press **Generate new token**.
4. Fill in the form:
   - **Name.** Required. It must be unique. Pick something you will recognise later, such as `API demo explorer`.
   - **Description.** Optional. A note to your future self.
   - **Expiration.** Choose 7, 30, 60 or 90 days, a custom date, or no expiration. A short expiration is safer, because a lost token then stops working by itself.
   - **Permissions.** Also called scopes. Tick only what you need. The next section explains each one.
5. Create the token and **copy it straight away**. Whatnot shows it once. If you close the page without copying it, you cannot see it again. You can only regenerate it (see below).

A personal access token starts with `wn_pat_tk_`. If what you copied does not start that way, it is not a personal access token.

Note that signing in at developers.whatnot.com is not where these tokens come from. They come from the dashboard page above.

## The 12 permissions (scopes)

Whatnot lists 12 scopes. One rule makes the list shorter in practice: **write access to a resource includes read access** to it. So if you tick `write:orders` you do not also need `read:orders`.

The table gives Whatnot's meaning in plain words and the functions of this tool that need the scope. "Stated" means Whatnot's reference says so for that function. "Inferred" means the reference does not say, and we worked it out from the group the function belongs to. Treat inferred rows as a good guess, not a promise. If a call comes back 403 with type `missing-scope`, the error lists the scopes it needs in `required_scopes`.

| Scope | In plain words | Functions that need it |
|---|---|---|
| `read:inventory` | See your products, variants and stock, and your saved package sizes. | `list_dimension_profiles`, `get_a_dimension_profile` (stated). `list_products`, `get_a_product`, `list_product_variants`, `get_a_product_variant` (inferred). |
| `write:inventory` | Create, change and delete products, change variants, and set or adjust stock. | `create_a_product`, `update_a_product`, `delete_a_product`, `update_product_variants`, `set_inventory`, `adjust_inventory` (all inferred). |
| `read:merchandising` | See how a product is sold and which shows it is in. | `get_a_product_s_merchandising` (stated). `list_a_product_s_shows` (stated, and it also needs `read:shows`). |
| `write:merchandising` | Change how a product is sold and put it in or take it out of shows. | `update_a_product_s_merchandising` (stated). |
| `read:orders` | See your orders and the items in them. | `list_orders`, `get_an_order`, `list_order_items`, `get_an_order_item` (stated). |
| `write:orders` | Change your orders. In this tool, that means cancelling one. | `cancel_an_order` (stated). |
| `read:shipments` | See your shipments and the items in them. | `get_a_shipment` (stated). `list_shipments`, `list_shipment_items`, `get_a_shipment_item` (inferred). |
| `write:shipments` | Change shipments, including adding tracking codes and buying a shipping label. | `add_a_tracking_code_to_order_items` (stated). `request_a_shipping_label` (inferred). |
| `read:customers` | See buyer details such as name, address, email and phone number. | No function needs it to run. It switches on the buyer fields inside order and shipment answers (see below). |
| `read:reports` | See your financial reports and show analytics. | `get_show_analytics`, `get_a_report`, `list_reports` (stated). |
| `write:reports` | Ask Whatnot to build a report about your finances. | `generate_a_report` (stated). |
| `read:shows` | See your shows. | `list_shows`, `get_a_show` (stated). |

Two functions need no particular scope. `get_the_current_user` and `disconnect_the_current_application` work with any valid token (inferred). The 35th operation in Whatnot's reference, the `GET /` health check, also needs a token but no scope that we know of.

### About buyer details

Without `read:customers`, the buyer, recipient, destination address and documents fields in order and shipment answers come back as `null`. The call still works. You just do not see who bought. Tick `read:customers` only if you really need the buyer or address. Whatnot's webhook page says the same thing about webhook payloads.

### What to tick

- **To try the explorer read-only.** Tick the read scopes: `read:inventory`, `read:merchandising`, `read:orders`, `read:shipments`, `read:reports` and `read:shows`. Add `read:customers` only if you want to see buyer fields.
- **For the full tour.** Add `write:inventory` and `write:merchandising` as well. These let you create a product, set its price and stock, and put it in a show. To also build a report, add `write:reports`.
- **Never tick `write:orders` or `write:shipments` unless you mean it.** These are the ones that cancel real orders, mark real orders as shipped and buy real shipping labels. A label costs real money. If you just want to look around, leave them off, and a mistaken click in the explorer cannot do any of this.

## Look after the token

- **Seeing it.** Open a token in the dashboard to see when it was created, when it was last used, when it expires and its permissions. The secret itself is never shown again.
- **Editing.** You can change the name, description, expiration and permissions. An expired token cannot be edited. Regenerate it instead.
- **Regenerating.** This gives you a new secret with the same settings, and the old secret stops working at once.
- **Deleting.** The token is revoked at once. This cannot be undone.
- **If it leaks.** Regenerate or delete it in the dashboard straight away. Do this first and investigate after. A token that was pasted into a chat, an email, a screenshot or a public repository should be treated as leaked.
- **Expiry.** When a token expires, calls come back 401. Make a new one or regenerate it.
- **Keep it out of files you share.** Do not put a token in code you commit. Scripts should read it from an environment variable such as `WHATNOT_API_KEY`.

## Paste it into the explorer

1. Start the explorer (`npm start`) and open http://localhost:7490.
2. Find the **Your API token** box at the top and paste the token into it.
3. Press **Save token**.
4. Press **Test token**. If it works, the page says "Signed in as" and your username. If Whatnot answers 401, the token is wrong, was copied badly, has expired or was deleted.
5. **Remember on this computer** starts off. The token is then forgotten when you close the tab. Tick it to keep the token in this browser between visits.
6. **Clear** removes the token, whichever way it was saved.

The page shows only the last four characters of the token. It sends the token to the small server on your own computer, and that server forwards it to api.whatnot.com and nowhere else. More detail is in the README under "Using your own token".

## For app developers

Personal access tokens are for you, on your own account. If you are building an app that acts for other sellers, you use OAuth instead.

- Tokens issued to an OAuth app start with `wn_access_tk_`. An older Whatnot page mentions `wn_access_tk_test_` for staging keys, but no current page describes a staging environment.
- The flow is the OAuth 2.0 authorization code flow. Response type is `code`. Grant types are `authorization_code` and `refresh_token`.
- Endpoints:
  - Authorize: `https://api.whatnot.com/seller-api/rest/oauth/authorize`
  - Token: `https://api.whatnot.com/seller-api/rest/oauth/token`
  - Revoke: `https://api.whatnot.com/seller-api/rest/oauth/revoke`
  - Metadata: `https://api.whatnot.com/.well-known/oauth-authorization-server/seller-api`
- The metadata lists the supported scopes: `full_access` plus the 12 scopes above.
- An older Whatnot page says refresh tokens last about a year, and that each refresh returns a new refresh token and invalidates the one you used. That may have changed, so check the live metadata and the current guide.
- Registering an app and subscribing to webhooks are done in the developer dashboard, not through the REST API. See `WEBHOOKS.md`.
- The hosted MCP server (the connector) uses this same flow.

## What Whatnot's pages do not say

- There is no documented staging or sandbox environment today. Everything you call is your real account. That is why this tool tells you to try writes on one clearly named test product.
- The pages we read do not say what makes a seller "approved". The error list has a `seller-not-approved` type, but we have not seen it explained.
- They do not say whether the limits or the scopes differ between a personal access token and an OAuth token, beyond what is above.

Source: Whatnot's developer guide and its OpenAPI document, gathered on 2026-10-31. Details are in `spec/NOTES.md`.
