# StackView — usage

Two modes ship in this repo:

| Mode | Command | Live sites | Per-pane proxy |
| --- | --- | --- | --- |
| Browser demo | `npm run dev` | No (iframes are blocked) | Simulated |
| Electron app | `npm run electron:start` | Yes (real Chromium) | Real |

The browser build stays as the hosted UI demo. Real pages and real proxies only work in the Electron app.

## 1. Run the Electron app

```bash
npm install
npm run electron:start      # builds the UI, then opens the desktop app
```

On Linux as root/CI, append the sandbox flag:

```bash
npx electron . --no-sandbox
```

## 2. Open links, add/remove windows

- Paste a link in **Control deck → Open main**. The main pane loads it; every synced follower mirrors the navigation.
- **Add window** creates a new pane with its own session (and its own proxy session id).
- **Duplicate** (copy icon) clones a pane with a new session.
- **Trash** removes a follower. The main window stays pinned at the top.
- **Radio icon** on a pane toggles that pane between mirrored and independent.
- **Master sync** pauses/resumes mirroring for the whole stack.
- Address bar inside any pane navigates just that pane when it is independent.

## 3. Configure the proxy (real US egress)

Set the proxy URL template as an environment variable **before** launching, or paste it in **Setup guide → Proxy URL template** and press **Save** (stored in localStorage).

```bash
export STACKVIEW_PROXY_TEMPLATE='http://USER:PASS@proxy-host:port'
export STACKVIEW_ALLOWED_HOSTS='mysite.com,staging.mysite.com'
npm run electron:start
```

Template placeholders substituted per pane:

| Placeholder | Value |
| --- | --- |
| `{session}` | `<windowId>-<rotation>` — unique sticky session per pane |
| `{region}` | `us-east`, `us-west`, `us-central`, `us-south` |
| `{country}` | `us` |

Provider examples (use your own provider's host/port/auth):

```bash
# lookup provider (verification only, not egress)
# export IPLOCATE_API_KEY='...'

# username carries a sticky session token
STACKVIEW_PROXY_TEMPLATE='http://USER_session-{session}:PASS@gateway.example.com:12321'

# password carries country + session (empty username)
STACKVIEW_PROXY_TEMPLATE='http://:APIKEY-country-{country}-session-{session}@gateway.example.com:8880'
```

For IPLocked, copy the host/port and auth pattern from its dashboard and replace the provider's session token with `{session}`. That is what guarantees a distinct sticky exit per pane instead of one shared rotating gateway.

If your provider gives you static proxy endpoints instead, pass a comma-separated list — pane 1 gets entry 1, pane 2 entry 2, and **New IP** advances to the next entry:

```bash
export STACKVIEW_PROXY_LIST='http://u1:p1@us1.host:8000,http://u2:p2@us2.host:8000,http://u3:p3@us3.host:8000'
```

Use at least as many proxies as panes if you need every pane to have a different IP.

You can also pull a list from a URL at startup:

```bash
export STACKVIEW_PROXY_LIST_URL='https://freeproxyapi.com/full?key=...'
```

The app fetches it before opening panes and assigns one entry per pane. Public/free proxy lists are mostly dead, non-US, slow and **untrusted** (they can see your destinations). Use them only for throwaway testing of your own site, never for logins or real accounts. Paid residential proxies are the only reliable way to get distinct US IPs; set `STACKVIEW_PROXY_LIST` directly if your provider gives you a static list.

**New IP** on a pane increments its rotation counter, i.e. it asks the provider for a new sticky session. **Verify IP** performs an IP lookup *through that pane's own session* and shows the real egress IP, city, ASN and IP type (residential / datacenter / proxy / VPN).

Set a lookup key to use IPLocate (recommended, richer data):

```bash
export IPLOCATE_API_KEY='your_iplocate_key'
```

Without a key the app falls back to `https://ipinfo.io/json`. **IPLocate is a lookup/geolocation service — it does not provide proxy IPs.** A key alone cannot change a pane's egress; you still need a proxy provider for that.

A warning is shown when two panes verify to the same IP — rotate one of them.

## 4. Keep traffic scoped to your site

`STACKVIEW_ALLOWED_HOSTS` is a comma-separated allowlist. When set, panes can only navigate to those hosts (and their subdomains); cross-host redirects and popups are blocked.

## 5. Security notes

- Never put the proxy key in source or git. `.env` is gitignored. Example only:
  ```bash
  set -a; source .env; set +a
  ```
- Proxy credentials stay in Electron's main process; the renderer only sees the egress IP after verification.
- This build intentionally has no fingerprint spoofing or bot-detection bypass. Use it against sites and accounts you are authorised to test.
