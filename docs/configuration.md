# Configuration

Every setting, what it does, and which ones a deployment actually has to touch.

`.env.example` is the canonical list and carries the same notes inline — this
page groups them and explains the ones with consequences.

**Not everything lives here.** The site name, tagline, accent colour, logo and
favicon are edited in the dashboard and stored in the database, so a prebuilt
image can be rebranded without a rebuild. `SITE_NAME` only seeds a fresh
instance. Plans — quota, burst, retention, concurrent inboxes — are rows too.

---

## Must be set for a real deployment

| Variable | What it is |
| --- | --- |
| `MAIL_DOMAINS` | Comma-separated domains that receive disposable mail. Every address on them is public. |
| `SITE_ADDRESS` | The host the reverse proxy serves and gets a certificate for. |
| `PUBLIC_WEB_URL` | Public URL of the web app. Used in sign-in redirects, the sitemap, and link previews. |
| `PUBLIC_API_URL` | Public URL the **browser** calls. |
| `PUBLIC_MX_HOST` | The MX hostname community domains must point at to be verified. |
| `MAIL_AUTH_MTA` | Hostname reported in `Authentication-Results`. |
| `DB_PASSWORD` | `openssl rand -hex 24`. |

Two of these have sharp edges:

**`PUBLIC_API_URL` is a build argument.** It is compiled into the browser bundle,
so changing it needs `docker compose up -d --build`, not a restart. Getting it
wrong presents as a CORS error rather than a configuration one.

**`MAIL_DOMAINS` must not contain `SITE_ADDRESS`.** Anything on a mail domain is
readable by anyone, and temp-mail domains get blocked by signup forms — which
takes the domain's sending reputation with it.

---

## Ports

Three layers, and confusing them is the usual mistake.

| Variable | Layer | Change it? |
| --- | --- | --- |
| `API_PORT` | port the API listens on **inside** its container | no |
| `API_UPSTREAM`, `WEB_UPSTREAM` | where the proxy finds the services on the compose network | no |
| `API_HOST_PORT`, `WEB_HOST_PORT`, `DB_HOST_PORT`, `REDIS_HOST_PORT` | ports published on the **host** | yes, if something else owns them |

A container port cannot clash with anything on the host — each container has its
own network namespace. Only the `*_HOST_PORT` values can collide, and when they
do Docker says so loudly (`port is already allocated`).

Host ports are bound to `127.0.0.1`. The only things published publicly are the
proxy (80, 443) and SMTP (25).

If you change `API_PORT`, you must change `API_UPSTREAM` to match — that is the
only reason to touch either.

---

## Retention and reservations

| Variable | Default | Notes |
| --- | --- | --- |
| `MESSAGE_TTL_MINUTES` | `60` | How long mail lives, for inboxes with no plan behind them. A plan's `retentionMinutes` overrides it for API inboxes. |
| `RESERVATION_TTL_MINUTES` | `1440` | How long a browser holds an address. Not used by API-minted inboxes, which are held for the plan's retention and released explicitly. |

---

## Mail intake

| Variable | Default | Notes |
| --- | --- | --- |
| `SMTP_HOST` / `SMTP_PORT` | `0.0.0.0` / `25` | An MX record cannot name a port, so 25 is not really optional. |
| `SMTP_MAX_SIZE` | `10485760` | Bytes. |
| `SMTP_RATE_LIMIT_MAX` | `30` | Messages per IP per window. `0` disables. |
| `SMTP_RATE_LIMIT_WINDOW_SECONDS` | `60` | |
| `SMTP_REVERSE_LOOKUP` | `false` | Resolving the sender's PTR blocks the greeting for up to 1.5s and nothing uses the result — SPF uses the announced HELO name and abuse screening uses the IP. |

---

## Community domains

Anyone can point their own domain at the instance. Ownership is proven by the
MX record, so nobody can add a domain they do not control.

| Variable | Default | Notes |
| --- | --- | --- |
| `PUBLIC_MX_HOST` | — | What a community domain's MX must point at. |
| `DOMAIN_VERIFY` | `mx` | `off` auto-verifies. Local development only — a localhost domain cannot be MX-pointed. |

---

## Rate limits

Five separate budgets. All windows are per IP.

| Variable | Default | Applies to |
| --- | --- | --- |
| `RATE_LIMIT_MAX` | `300`/min | the public `/api/*` surface |
| `ADMIN_RATE_LIMIT_MAX` | `600`/min | `/api/admin/*` — its own budget so an anonymous flood cannot lock an operator out |
| `LOGIN_RATE_LIMIT_MAX` | `20`/min | sign-in only |
| `SMTP_RATE_LIMIT_MAX` | `30`/min | inbound mail |
| — | from the plan | `/v1/*` has **no** IP limit: quota belongs to the account, so two customers behind one office NAT do not throttle each other |

Sign-in has a second, more important defence — a lockout that counts failures
per IP **and** per username, so spreading attempts across addresses still hits
the per-username ceiling:

```
LOGIN_MAX_ATTEMPTS_IP=10
LOGIN_MAX_ATTEMPTS_USER=5
LOGIN_LOCKOUT_WINDOW_SECONDS=900
```

---

## Sessions and the dashboard

| Variable | Default | Notes |
| --- | --- | --- |
| `ADMIN_SESSION_TTL_MINUTES` | `720` | Sliding — activity extends it. |
| `ADMIN_PATH` | `admin` | Seeds a fresh instance only. After first boot this lives in the database and is changed in Access → Dashboard URL. |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | — | For scripted installs. Ignored once an admin exists; otherwise a password is generated and printed once. |

---

## Customer sign-in

| Variable | Notes |
| --- | --- |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | An OAuth App, not a GitHub App. Callback: `<PUBLIC_API_URL>/api/auth/github/callback` |

Leave them blank and sign-in is not offered at all — operators still sign in
with a password, so an instance with no OAuth configured still works.

Another provider is an entry in `apps/api/src/auth/providers.ts` plus
`<ID>_CLIENT_ID` / `<ID>_CLIENT_SECRET`.

---

## Webhooks

| Variable | Default | Notes |
| --- | --- | --- |
| `WEBHOOK_ALLOW_PRIVATE` | `false` | Allows customer endpoints on private and loopback addresses, and plain http. **Development only.** A webhook makes this server fetch a URL a customer chose; with this on, that reaches cloud metadata and your own network. |

---

## Storage

| Variable | Default | Notes |
| --- | --- | --- |
| `STORAGE_DRIVER` | `db` | `db` stores attachments inline in Postgres. `s3` works with S3, R2 and MinIO. |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | — | Only when `STORAGE_DRIVER=s3`. |
| `S3_FORCE_PATH_STYLE` | `false` | `true` for MinIO. |

Switching drivers applies to new mail. Existing attachments stay where they are.

---

## Database

| Variable | Default | Notes |
| --- | --- | --- |
| `DB_HOST`, `DB_PORT` | `localhost`, `5432` | **Overridden inside compose** to `postgres:5432`. These only matter for tooling run from the host, like `pnpm db:migrate`. |
| `DB_NAME`, `DB_USER`, `DB_PASSWORD` | `fana` | Read by Postgres only when the volume is first created. |
| `DB_SSL` | `false` | For a managed database elsewhere. |
| `MIGRATE_ON_START` | `true` | Set `false` to run `pnpm db:migrate` as a separate deploy step. |
| `REDIS_URL` | `redis://localhost:6379` | Also overridden inside compose. |
