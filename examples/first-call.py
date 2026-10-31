"""First call to the Whatnot Seller API: who does this token belong to?

Python 3, standard library only. Run: python first-call.py
Reads only. Nothing is written to your Whatnot account.
"""

import json
import os
import sys
import urllib.error
import urllib.request
import uuid

BASE_URL = "https://api.whatnot.com/seller-api/rest/v2"
TOKENS_PAGE = "https://www.whatnot.com/dashboard/developer?tab=tokens"


def parse_json(raw):
    try:
        return json.loads(raw.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return None


def main():
    token = os.environ.get("WHATNOT_API_KEY")
    if not token:
        print("WHATNOT_API_KEY is not set. Set it to your Seller API token and run this again.")
        print("Tokens are made in the developer dashboard: " + TOKENS_PAGE)
        return 1

    request_id = str(uuid.uuid4())
    req = urllib.request.Request(
        BASE_URL + "/users/me",
        headers={
            "Authorization": "Bearer " + token,
            "Accept": "application/json",
            # Whatnot sits behind Cloudflare, which blocks Python's default
            # user agent with a 403 (Cloudflare error 1010). Any name works.
            "User-Agent": "whatnot-api-demo/1.0",
            "X-Request-ID": request_id,
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            status = res.status
            headers = res.headers
            body = parse_json(res.read())
    except urllib.error.HTTPError as err:
        # urllib raises on 4xx and 5xx. The problem+json body is on the error.
        status = err.code
        headers = err.headers
        body = parse_json(err.read())
    except urllib.error.URLError as err:
        print("Could not reach Whatnot: " + str(err.reason))
        print("Request id: " + request_id)
        return 1

    if not isinstance(body, dict):
        body = {}

    if status == 200:
        print("Signed in as " + str(body.get("username", "(no username in the answer)")))
        return 0

    print("Whatnot answered " + str(status) + ".")
    if body.get("type"):
        print("Type: " + str(body["type"]))
    if isinstance(body.get("detail"), str):
        print("Detail: " + body["detail"])

    if status == 401:
        print("The token is wrong or has expired.")
        print("Get a new one in the dashboard's Developer tab, Personal access tokens: " + TOKENS_PAGE)
    elif status == 403:
        print("The token is missing a permission this call needs.")
        scopes = body.get("required_scopes")
        if isinstance(scopes, list):
            print("Required scopes: " + ", ".join(str(s) for s in scopes))
    elif status == 429:
        retry = headers.get("Retry-After") if headers else None
        print("Too many requests. Retry after " + (retry or "a few") + " seconds.")

    # Quote this id if you contact Whatnot support.
    echoed = headers.get("X-Request-ID") if headers else None
    print("Request id: " + (echoed or request_id))
    return 1


if __name__ == "__main__":
    sys.exit(main())
