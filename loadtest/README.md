# Shortener load tests (k6)

Production-oriented load and stress tests for a URL shortener **you own or have
written permission to test**. The workload mirrors real shortener traffic:
redirect resolution dominates, with optional link creation and stats reads.

> **Authorized targets only.** Testing third-party shorteners, ad networks, or
> paid-link sites to generate views or impressions is ad fraud, not load
> testing. Every request carries `X-Load-Test: k6` and `X-Load-Test-Region` so
> your analytics, WAF, and bot filters can exclude synthetic traffic.

## What you get

- Ramping `smoke`, `load`, `stress`, `spike`, and `soak` profiles (up to 2000 VUs)
- Auth header, cookie, extra headers, and custom create-body support
- Configurable redirect/stats/health/create paths and response mapping
- Redirects are **not** followed, so you measure the shortener, not destinations
- Thresholds that abort the run after 30s above the failure budget
- A normalized JSON summary plus a one-screen text summary
- A manual GitHub Actions workflow with a per-region runner matrix

## Requirements

- k6 v2.x. Either `grafana/k6:2.3.0` via Docker (used below) or a local install.
- Codes to hit, **or** a create endpoint the test may call.
- Network reachability from the runner(s) to the target.

## 1. Supply codes

Collect a representative sample of codes from your own shortener (old, new,
popular, long-lived). Put them one per line:

```text
# loadtest/codes.example.txt
abc123
def456
xyz789
```

CSV exports work too; only the first column is used, and `#` lines are ignored.

Point the test at the file **relative to `loadtest/k6/`**:

```bash
CODES_FILE=../codes.txt      # for loadtest/codes.txt
```

Small sets can be inline: `CODES=abc123,def456`. For a read-only test this is
all you need — no write API, no auth (unless redirects require it).

Alternatively, set `CREATE_PATH` and the test creates `SETUP_LINKS` codes during
setup, then writes a few per iteration.

## 2. Smoke test against the real target

Copy `config.example.env` to a local file, fill it in, and run the wrapper:

```bash
cd loadtest
cp config.example.env my.env    # then edit my.env
./run.sh my.env
```

`run.sh` picks `k6` if installed, otherwise Docker, and enables the live
dashboard. Plain k6 works too:

```bash
set -a; . ./my.env; set +a
K6_WEB_DASHBOARD=true k6 run k6/redirect.js
```

A smoke run lasts 40 seconds and checks that paths, auth, and codes are correct
before you apply real load.

## 3. Apply real load

```bash
PROFILE=load k6 run k6/redirect.js     # 1000 VUs: 2m up, 5m hold, 1m down
PROFILE=stress k6 run k6/redirect.js   # 2000 VUs
PROFILE=spike k6 run k6/redirect.js    # 1500 VUs burst
PROFILE=soak k6 run k6/redirect.js     # 500 VUs for 1h
```

Or bypass the profiles:

```bash
VUS=1500 DURATION=10m k6 run k6/redirect.js
```

Set `OUT_DIR=results` (after `mkdir -p results`) to write
`results/summary-<region>.json`. Without `OUT_DIR`, only the text summary is
printed.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `BASE_URL` | **required** | Target origin, e.g. `https://short.example.com` |
| `REGION` | `local` | Metric/summary label; does not change routing |
| `PROFILE` | `smoke` | `smoke`, `load`, `stress`, `spike`, `soak` |
| `VUS` | profile | Peak VUs |
| `DURATION` | — | Flat `constant-vus` run instead of ramping, e.g. `10m` |
| `RAMP`, `HOLD`, `DOWN` | profile | Stage overrides |
| `CODES` | — | Comma-separated codes |
| `CODES_FILE` | — | File path, resolved relative to `loadtest/k6/` |
| `REDIRECT_PATH` | `/{{code}}` | Redirect route template |
| `STATS_PATH` | — | Stats route, e.g. `/api/links/{{code}}/stats` |
| `HEALTH_PATH` | — | Optional health endpoint checked in setup |
| `CREATE_PATH` | — | Link creation route; empty disables writes |
| `CREATE_METHOD` | `POST` | Creation HTTP method |
| `CREATE_BODY` | `{"url":"{{url}}"}` | Body template; `{{url}}` is JSON-escaped, `{{url_encoded}}` is percent-encoded |
| `CREATE_CODE_PATH` | `code` | Dot path to the code in the create response |
| `CREATE_CONTENT_TYPE` | `application/json` | Create request content type |
| `AUTH_HEADER_NAME` | `Authorization` | Header used when `AUTH_HEADER_VALUE` is set |
| `AUTH_HEADER_VALUE` | — | Full header value, e.g. `Bearer eyJ...` |
| `COOKIE` | — | Raw `Cookie` header |
| `EXTRA_HEADERS` | `{}` | JSON object of additional headers |
| `USER_AGENT` | `k6-loadtest/1.0 (authorized; <region>)` | Override UA |
| `SETUP_LINKS` | `50` | Links created in setup when no codes are supplied |
| `STATS_PCT` | `5` when stats configured | Percent of iterations reading stats |
| `CREATE_PCT` | `5` when create configured | Percent of iterations creating a link |
| `THINK_TIME_MS` | `0` | Mean per-iteration think time |
| `MAX_FAIL_RATE` | `0.01` | Abort when failure rate exceeds this |
| `P95_MS`, `P99_MS` | `400`, `1000` | Overall latency thresholds |
| `REDIRECT_P95_MS` | `300` | Redirect-only latency threshold |
| `HTTP_TIMEOUT` | `30s` | Per-request timeout |
| `INSECURE_SKIP_TLS_VERIFY` | `false` | Skip TLS verification (staging only) |
| `OUT_DIR` | — | Directory for `summary-<region>.json` |
| `K6_WEB_DASHBOARD` | — | `true` enables the live web dashboard (`run.sh` does this) |
| `K6_WEB_DASHBOARD_PORT` | `5665` | Dashboard port |
| `K6_WEB_DASHBOARD_EXPORT` | — | Write a self-contained HTML report at the end of the run |

Standard `HTTP_PROXY`, `HTTPS_PROXY`, and `NO_PROXY` variables are honored by
local k6 runs; use them when a region must egress through a specific proxy.

## Custom create APIs

The default expects `201`/`200` and a top-level `code` field. Map your own:

```bash
CREATE_PATH=/api/v1/links
CREATE_METHOD=POST
CREATE_BODY='{"target":"{{url}}","domain":"sho.rt"}'
CREATE_CODE_PATH=data.short.code
AUTH_HEADER_VALUE="Bearer $TOKEN"
```

Form-encoded APIs:

```bash
CREATE_BODY='url={{url_encoded}}'
CREATE_CONTENT_TYPE=application/x-www-form-urlencoded
CREATE_CODE_PATH=shortUrl     # then strip a prefix if needed, see below
```

If your API returns a full URL rather than a bare code, point `CREATE_CODE_PATH`
at the field and add a `REDIRECT_PATH` that tolerates it, or pre-process codes
into `codes.txt` and run read-only.

The `__loadtest` targets created during a run are internal markers
(`${BASE_URL}/__loadtest/<n>`); they are never fetched because redirects are
not followed.

## Geo-distributed execution

`REGION` is only a label. Real geographic spread requires runners in different
places:

1. **Self-hosted GitHub runners** (wired into the workflow). Label runners such
   as `loadtest-eu` and pass
   `[{"name":"eu-west","runner":"loadtest-eu"},{"name":"us-east","runner":"loadtest-us"}]`
   as `regions`.
2. **VMs in each country/region** running the same command with a different
   `REGION`, started together. Keep summaries separate; do not add raw counts
   across runs.
3. **k6 Cloud** load zones (`amazon:us:ashburn`, `amazon:ie:dublin`, etc.). See
   the [k6 Cloud docs](https://grafana.com/docs/k6/latest/cloud/).

For a fair comparison, keep VUs and duration identical per region. If one
runner saturates its own CPU/NIC (`http_reqs` plateaus while VUs rise), add
runners rather than raising VUs.

## Live dashboard

The dashboard is **opt-in**; a plain `k6 run` does not show it. Use `./run.sh`,
or set the variables yourself:

```bash
K6_WEB_DASHBOARD=true k6 run k6/redirect.js
# open http://localhost:5665
```

Docker needs the port published and the dashboard bound to all interfaces:

```bash
docker run --rm --user "$(id -u):$(id -g)" -p 5665:5665 \
  -e BASE_URL=https://short.example.com -e CODES_FILE=../codes.txt \
  -e K6_WEB_DASHBOARD=true -e K6_WEB_DASHBOARD_HOST=0.0.0.0 \
  -v "$PWD:/loadtest" -w /loadtest \
  grafana/k6:2.3.0 run k6/redirect.js
```

`run.sh` handles this automatically, including host networking when the target
is on localhost.

To keep an HTML report of the run:

```bash
K6_WEB_DASHBOARD=true K6_WEB_DASHBOARD_EXPORT=results/report.html \
  k6 run k6/redirect.js
```

k6 skips report generation for runs shorter than roughly 30 seconds — use a real
profile when you want the HTML artifact.

GitHub Actions runs headless, so there is no live page there. The HTML report
and JSON summary are uploaded as artifacts when the job finishes.

## Reading results

Text summary example:

```text
target: https://short.example.com
region: eu-west   profile: load   max VUs: 1000
requests: 4211332 (7002.1/s)   failed: 0.01%   checks: 99.99%
latency: p50=8.3ms p95=41.7ms p99=92.4ms   redirect p95=39.8ms
views: 3987210   misses: 3
thresholds: PASS (...)
```

- `requests` / `rps` — throughput against expected peak.
- `failed` — non-2xx/3xx responses plus network errors; keep under 1%.
- `checks` — redirects must be 3xx with a `Location` header.
- `latency` — end-to-end request time from the runner.
- `redirect p95` — the shortener's own redirect latency.
- `views` — successful redirects (one per simulated resolution).
- `misses` — 404s; stale codes or a wrong `REDIRECT_PATH`.

Thresholds abort the run after 30 seconds over budget, so a broken deploy does
not keep receiving load. The JSON summary is stable enough to diff between
deploys or feed into a dashboard.

## Safety checklist

- Get explicit sign-off from the shortener owner; note the test window.
- Test staging first, then production off-peak.
- Allowlist the runner IPs / `X-Load-Test` header at the WAF and CDN.
- Exclude `X-Load-Test` traffic from analytics and billing.
- Watch the target's own dashboards during the run, not just k6's.
- Stop immediately if error rate or DB latency spikes; `Ctrl-C` ramps down.

## GitHub Actions workflow

`.github/workflows/loadtest.yml` is manual-only and refuses to run unless
`authorized` is `yes`. Inputs: `target_url`, `authorized`, `profile`, `vus`,
`duration`, `codes`, `codes_file`, `redirect_path`, `create_path`, `create_code_path`,
`stats_path`, `health_path`, `auth_header_name`, and `regions`.

Put the auth value in a repository/environment secret named
`LOADTEST_AUTH_HEADER` (never in a workflow input — inputs are logged).

## Limits

- k6 does not execute the destination page, ads, or client-side analytics. This
  measures the shortener's redirect and control-plane APIs, not third-party ad
  impressions.
- Load figures are limited by the runner. Cross-region comparisons should use
  equivalent runner sizes.
