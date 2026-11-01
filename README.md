# Whatnot API Demo

A free tool by Mood Swings Design, released under the MIT licence (see `LICENSE`). Use it, copy it, build on it.

A small tool that shows every function of Whatnot's Seller API working for
real. There are 34 functions. You can read what each one does, see the exact
request and the real answer Whatnot gave when it was tried on a private test
show, and (once you paste your own token into the page) run it live yourself.

## Start it

1. Open a terminal in this folder.
2. Run `npm start`.
3. Open http://localhost:7490 in your browser.

Nothing to install. To use a different port, set `PORT` first.

## The three parts

- **Recorded run.** One real pass through the API, made through the Whatnot
  connector in Claude against your private test show. Every answer is saved in
  `fixtures/`. The story of how it was made is in `docs/API-TOUR.md`.
- **Explorer app.** The page at http://localhost:7490. Functions are grouped on
  the left. Pick one to see a plain summary, the request, the recorded answer,
  and a "Run live" button. A "Tour" view steps through the recorded run in
  order. How the page works is in `docs/EXPLORER.md`.
- **The /whatnot-api skill.** In Claude Code, type `/whatnot-api list` to see the
  functions, `/whatnot-api get_a_show` to run one live through the connector and
  refresh its saved answer, or `/whatnot-api tour` to refresh all the read ones.

## Using your own token

Without a token the explorer shows the recorded answers and "Run live" says
plainly that no token is set. To run functions live against your own Whatnot
account you need a Seller API token.

1. **Get a token.** Make a personal access token in your Whatnot dashboard, on
   the Developer tab, under Personal access tokens:
   https://www.whatnot.com/dashboard/developer?tab=tokens. Press Generate new
   token, pick an expiration and the permissions you want, and copy the token
   straight away, because Whatnot shows it once. It starts with `wn_pat_tk_`.
   A token can expire, so you may need a fresh one now and then. The full
   step by step, including which permissions to tick, is in
   `docs/GETTING-A-TOKEN.md`.
2. **Paste it in the page.** At the top of the explorer is a "Your API token"
   box. Paste the token, press "Save token", then "Test token". If the token
   works the page says "Signed in as" and your username. If Whatnot answers 401,
   the token is wrong or has expired.
3. **Remember it or not.** "Remember on this computer" is off to start with, so
   the token is forgotten when you close the tab. Tick it to keep the token in
   this browser between visits. "Clear" removes it either way.

What the tool does with your token: it stays in your browser. The page only ever
sends it to the small server running on your own computer (at localhost), and
that server only forwards it to api.whatnot.com. It is never written to disk,
never logged and never shown back on the page apart from its last four
characters. The local server refuses requests from any other website, so a page
you happen to have open elsewhere cannot use it.

Safety boxes:

- Read functions just run.
- Functions that change your data show a box, "I understand this changes data
  on my Whatnot account". You tick it for each function before it will run.
- Destructive functions (cancel, ship, buy a label, delete) show that box plus
  a red confirm box, and both must be ticked.
- Disconnecting the application is always refused. It would cut the link to
  your connector.

Prefer environment variables? Starting with `WHATNOT_API_KEY=your-token` (and
`ALLOW_WRITES=true` to skip the server's write check) still works. A token
pasted in the page wins over the environment one.

## Safety classes

| Class | What it means | Rule |
|---|---|---|
| read | Only looks, never changes anything | Always safe |
| write | Creates or changes your own product data | Only on the demo product, title starts with API DEMO TEST ITEM |
| destructive | Cancels, ships, spends money, deletes or disconnects | Never on real orders. Shown with an impossible id, or on the demo product only |

## Where things live

- `fixtures/` has one file per function, plus `_run.json` (the order of the run,
  the ids it used and the cleanup result).
- Buyer names and addresses in orders and shipments are blanked in the fixtures.
- `docs/API-TOUR.md` is a plain-English walkthrough of all 34 functions.
- `spec/NOTES.md` holds the facts gathered from Whatnot's developer guide.
- `CONTRACT.md` is the shared spec the pieces were built from.

To test the code itself, run `npm test`.

## For developers

If you want to build your own tool on the Seller API, start here.

Guides in `docs/`:

- `docs/GETTING-A-TOKEN.md`: make a token, the 12 permissions (scopes), and the
  OAuth basics for apps that act for other sellers.
- `docs/LIMITS-AND-PAGING.md`: the rate limit, what to do on a 429, and how
  paging with `limit`, `cursor` and `reverse` works.
- `docs/ERRORS.md`: the error shapes, every problem type, 207 batch answers,
  retries and `idempotency_key`.
- `docs/WEBHOOKS.md`: the events Whatnot can send you and how to check their
  signatures.
- `docs/RECIPES.md`: five walkthroughs that chain functions, with curl for
  every step.
- `docs/API-TOUR.md`: the plain-English tour of all 34 functions.
- `docs/EXPLORER.md`: how the explorer page works.

Other things in the project:

- `spec/openapi.json` is Whatnot's own OpenAPI document (version 3.1.0, API
  version 2.0.0), downloaded on 2026-10-31 from
  https://developers.whatnot.com/api-reference/openapi.json. It is Whatnot's
  file, saved here unchanged so you can read it offline.
- `examples/` has small programs to start from: a first-call script in Node, a
  first-call script in Python, a paging example, and a webhook receiver
  (`examples/webhook-receiver.mjs`, which checks Whatnot's signatures).
- For every function, the explorer shows copyable curl, JavaScript and Python
  for the request, plus the permissions that function needs.
