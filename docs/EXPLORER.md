# Explorer

Start it: `npm start` in this folder, then open http://localhost:7490 (set `PORT` to change it). Node 22 or newer, nothing to install.

What you see: the 34 Seller API functions on the left, grouped by tag, each marked read, write or destructive. Pick one to see what it does, the exact request, the inputs, and the response recorded live from Whatnot. "Tour" steps through them one per screen in the order they were recorded.

Recordings: the app reads `fixtures/` fresh on every page load, so new recordings show up without a restart. A function with no file says "not recorded yet".

Running live: "Run live" only reaches Whatnot when `WHATNOT_API_KEY` holds a Seller API access token. Without it you get a plain message and the recorded response stays on screen. The token is sent as a Bearer header, never logged and never sent back to the page. Calls are paced to one per second; a 429 waits for Retry-After once, then shows what came back.

Gates: read functions run with just the token. Write functions also need `ALLOW_WRITES=true` when the server starts. Destructive functions need that plus the confirm box ticked. Disconnect the current application is always refused, because it would cut off the seller's connection.

Example (PowerShell): `$env:WHATNOT_API_KEY="..."; $env:ALLOW_WRITES="true"; npm start`
