# Explorer

Start it: `npm start` in this folder, then open http://localhost:7490 (set `PORT` to change it). Node 22 or newer, nothing to install.

What you see: a "Your API token" box at the top, then the 34 Seller API functions on the left, grouped by tag, each marked read, write or destructive. Pick one to see what it does, the exact request, the inputs, and the response recorded live from Whatnot. "Tour" steps through them one per screen in the order they were recorded.

Permissions and code: under the Request block the page says which permissions (scopes) the function's token needs, and whether Whatnot's reference states that or we inferred it from the group. A Code block shows the same request as curl, JavaScript (Node fetch), Python (standard library) and a raw HTTP request, rebuilt about 200 ms after you edit the Args, with a Copy button. The token is never put in the code; the snippets read `WHATNOT_API_KEY` from the environment, and any token-looking string in the args is replaced with `[token]`. Live results end with a line built from Whatnot's RateLimit headers and the request id (the server sends an `X-Request-ID` with every call), which you can quote to Whatnot support.

Recordings: the app reads `fixtures/` fresh on every page load, so new recordings show up without a restart. A function with no file says "not recorded yet".

Your token: paste a personal access token (made in your Whatnot dashboard, Developer tab, Personal access tokens, see `docs/GETTING-A-TOKEN.md`) into "Your API token" and press "Save token". It is kept in sessionStorage, so it is gone when the tab closes, unless "Remember on this computer" is ticked, which keeps it in localStorage. "Clear" removes it from both. The status line shows only the last four characters. "Test token" runs get_the_current_user and says "Signed in as" the username, or what Whatnot answered (401 means the token is wrong or has expired).

Running live: every live run sends the token to the local server in the `X-Whatnot-Token` header. The server forwards it to api.whatnot.com as a Bearer header and nowhere else. It is never logged, stored or sent back to the page, and any copy of it in an error is replaced with `[token]`. With no header the server falls back to the `WHATNOT_API_KEY` environment variable; with neither you get a plain message and the recorded response stays on screen. Calls are paced to one per second; a 429 waits for Retry-After once, then shows what came back.

Gates, all in the page: read functions run with just the token. Write functions show "I understand this changes data on my Whatnot account", which must be ticked before the run (it resets when you pick another function) and sends `allowWrites: true`. Destructive functions show that box plus the red confirm box and send `confirm: true` as well. The server checks both as real booleans; the string "true" is refused. `ALLOW_WRITES=true` in the environment still satisfies the write check on the server for the old setup, but the page asks anyway. Disconnect the current application is always refused, because it would cut off the seller's connection.

Who can call it: the server listens on 127.0.0.1 only and has no CORS. A request whose `Origin` header is present and is not `http://localhost:<port>` or `http://127.0.0.1:<port>` gets a 403, so another website cannot drive the proxy with a saved token. Tools with no Origin header, such as curl, still work.

Environment instead (optional, PowerShell): `$env:WHATNOT_API_KEY="..."; $env:ALLOW_WRITES="true"; npm start`
