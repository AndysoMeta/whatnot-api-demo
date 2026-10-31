# Whatnot API Demo

By Mood Swings Design.

A small tool that shows every function of Whatnot's Seller API working for
real. There are 34 functions. You can read what each one does, see the exact
request and the real answer Whatnot gave when it was tried on your private test
show, and (once you add a token) run it live yourself.

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

## Adding a token later (optional)

Without a token the explorer shows the recorded answers and "Run live" says
plainly that no token is set. To run live from the page you need a Seller API
access token. Whatnot issues these through its OAuth sign-in for developer apps
(developers.whatnot.com), not as a static key, so the token expires and has to
be refreshed. Start the tool with it:

    set WHATNOT_API_KEY=your-token-here
    npm start

(In PowerShell: `$env:WHATNOT_API_KEY="your-token-here"`.)

- Functions that change your data need `ALLOW_WRITES=true` as well.
- The destructive ones also ask you to tick a confirm box on every run.
- Disconnecting the application is always refused. It would cut the link to
  your connector.

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
- `CONTRACT.md` is the shared spec the pieces were built from.

To test the code itself, run `npm test`.
