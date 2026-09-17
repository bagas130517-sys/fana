# Self-hosting fana

Everything needed to run your own instance, in the order you need it.

Written from a real deployment, so the awkward parts are here too — the failure
modes that don't look like failures are called out where they bite.

---

## Before you start

**You need a server that can receive mail on port 25.** Many providers block it
by default and some will not unblock it at all. Check before anything else:

```bash
timeout 5 bash -c 'cat < /dev/null > /dev/tcp/gmail-smtp-in.l.google.com/25' \
  && echo "port 25 reachable" || echo "port 25 blocked"
```

Outbound being blocked almost always means inbound is too. If this fails, open a
ticket with your provider and stop here — nothing else will work.

**You need two domains, or a domain and a subdomain.** See below.

---

## 1. Pick two domains

This is the decision everything else follows from.

| | Example | Serves |
| --- | --- | --- |
| `SITE_ADDRESS` | `fana.example.com` | website, dashboard, API |
| `MAIL_DOMAINS` | `mail.fana.example.com` | the disposable addresses |

**Do not make them the same domain.** Two reasons:

- Every address on a mail domain is public by design. `billing@` and `admin@` on
  it would be readable by anyone who guesses them.
- Signup forms collect and block temp-mail domains. Listing your brand domain
  takes its sending reputation down with it — including for the mail you
  actually care about.

A subdomain is the simple split. Several short throwaway domains you can rotate
is the durable one: `MAIL_DOMAINS` takes a comma-separated list, and community
domains add more at runtime.

Short is better for a mail domain. `otter-9k7@mail.fana.example.com` is a lot to
type into a signup form.

---

## 2. DNS

For a site at `fana.example.com` and mail on `mail.fana.example.com`:

| Name | Type | Value |
| --- | --- | --- |
| `fana` | A | your server IP |
| `mx.fana` | A | your server IP |
| `mail.fana` | MX, priority 10 | `mx.fana.example.com.` |

Two things that catch people:

- **The trailing dot** on the MX value is not optional in most DNS panels.
- **An MX record may not point at a CNAME.** The MX target needs its own A
  record — that is what `mx.fana` is for.

Leave your brand domain's own MX alone. If `example.com` receives your real
mail through Google Workspace or similar, none of this touches it.

Verify before continuing:

```bash
dig +short A  fana.example.com
dig +short A  mx.fana.example.com
dig +short MX mail.fana.example.com
```

All three must answer.

### Reverse DNS

Set the PTR record for your server IP to `mx.fana.example.com`, in your
provider's panel. Senders check it, and mail from a host without one is widely
treated as suspicious.

```bash
dig +short -x <your server IP>
```

---

## 3. Firewall

Only three ports need to be open to the world:

```bash
sudo ufw allow 80,443,25/tcp && sudo ufw reload
```

`80` and `443` are the reverse proxy, `25` is inbound mail. Everything else —
Postgres, Redis, the API, the web app — is published on `127.0.0.1` only.

---

## 4. Install

```bash
git clone https://github.com/JastinXyz/fana && cd fana
cp .env.example .env
```

Edit `.env`. These are the values a deployment must change; everything else has
a working default and is documented in [configuration.md](configuration.md).

```bash
MAIL_DOMAINS=mail.fana.example.com
PUBLIC_WEB_URL=https://fana.example.com
PUBLIC_API_URL=https://fana.example.com
SITE_ADDRESS=fana.example.com
SITE_NAME=fana
PUBLIC_MX_HOST=mx.fana.example.com
MAIL_AUTH_MTA=mx.fana.example.com

DB_PASSWORD=            # openssl rand -hex 24
```

Generate the password with `openssl rand -hex 24`. Hex on purpose: it survives
every `.env` parser and URL without escaping, which base64 does not.

> **`PUBLIC_API_URL` is baked into the browser bundle at build time.** Getting it
> wrong means the browser calls the wrong host, and the symptom looks like a CORS
> error rather than a configuration one. `PUBLIC_WEB_URL` is read at runtime.

> **Do not change `API_PORT`, `API_UPSTREAM` or `WEB_UPSTREAM`.** Those are ports
> *inside* the containers, which is where the proxy reaches them. A container
> port cannot clash with anything on the host. If you need to change what the
> host publishes, use `API_HOST_PORT` and `WEB_HOST_PORT`.

Then:

```bash
docker compose up -d --build
```

The first boot prints the admin username, password and API token **once**. Copy
them now:

```bash
docker compose logs api | grep -iE "admin|password|token"
```

Migrations run automatically (`MIGRATE_ON_START=true`).

---

## 5. Verify

In this order — each check rules out a different layer.

```bash
curl -s https://fana.example.com/api/health
curl -s -o /dev/null -w 'v1:   %{http_code} %{content_type}\n' https://fana.example.com/v1/me
curl -s -o /dev/null -w 'docs: %{http_code}\n' https://fana.example.com/docs
curl -s https://fana.example.com/api/domains
```

| Check | Expected | If it differs |
| --- | --- | --- |
| `/api/health` | `{"ok":true,…}` | the API is down — `docker compose logs api` |
| `/v1/me` | **`401 application/json`** | see below |
| `/docs` | `200` | the web app is not being reached |
| `/api/domains` | lists your mail domain | `.env` was not picked up; rebuild |

**`/v1/me` returning `200 text/html` is the one to watch for.** It means `/v1`
is not routed to the API, so the request reaches the web app instead, where the
inbox catch-all answers with a page. An API client sees a successful HTML
response rather than an error, which is why this is worth checking explicitly.

Confirm the application ports are not exposed:

```bash
curl -m 5 -s -o /dev/null http://<your server IP>:4000/api/health \
  && echo "exposed — check your ports: mapping" || echo "closed"
```

### Receive a real message

Open the site, copy the address it gives you, and send it mail from a real
account. Then:

```bash
docker compose logs smtp --tail 30
```

Look for `[smtp] stored message for 1 recipient(s) in NNNms`.

Nothing at all in the log means the mail never reached the server — that is DNS
or the firewall, not the application. Re-check the MX record and port 25.

---

## 6. Sign-in for customers (optional)

Without this, the dashboard is operator-only and `/docs` has no way for a
developer to get a key.

Create an **OAuth App** at
[github.com/settings/developers](https://github.com/settings/developers) — the
*OAuth Apps* tab, not *GitHub Apps*; they are different products with different
flows.

| Field | Value |
| --- | --- |
| Homepage URL | `https://fana.example.com` |
| Authorization callback URL | `https://fana.example.com/api/auth/github/callback` |

The callback is matched as an exact string. A different scheme, a trailing
slash, or a different path all fail with `redirect_uri_mismatch`.

```bash
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
```

```bash
docker compose up -d api
curl -s https://fana.example.com/api/auth/providers
```

An empty `providers` array means one of the two values is missing — a provider
is only offered when both are set.

Adding another provider is an entry in `apps/api/src/auth/providers.ts` plus
`<ID>_CLIENT_ID` / `<ID>_CLIENT_SECRET`, not a new route.

---

## 7. After it works

**Change the admin password.** Sign in at `/admin` — or at whatever you moved
the dashboard path to — and change it.

**Set your branding.** `/dashboard` → Branding: name, tagline, accent colour,
logo, favicon. Stored in the database and applied on the next render, so a
prebuilt image can be rebranded without a rebuild.

**Move the dashboard path.** Access → Dashboard URL. `POST /api/admin/login` is
at a fixed URL regardless, so this only keeps scanners off the form — but that
is worth something.

**Back up the database.** Messages are ephemeral and losing them is survivable.
`users`, `api_keys`, `plans`, `webhooks` and `settings` are not:

```bash
docker compose exec -T postgres pg_dump -U fana fana | gzip > fana-$(date +%F).sql.gz
```

Put that on a schedule and keep the output somewhere other than this server.

---

## Upgrading

```bash
git pull
docker compose up -d --build
```

Migrations apply on boot. Take a database dump first — a migration is the one
change that a `git checkout` of the previous commit will not undo.

---

## Storing attachments elsewhere

Attachments live in Postgres by default, which is fine at small scale and gets
expensive as a backup grows. To use S3, R2 or MinIO instead:

```bash
STORAGE_DRIVER=s3
S3_BUCKET=fana-attachments
S3_REGION=auto
S3_ENDPOINT=https://<id>.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_FORCE_PATH_STYLE=false   # true for MinIO
```

This applies to newly received mail. Existing attachments stay where they are.

---

## Something went wrong

See [troubleshooting.md](troubleshooting.md) — it covers the failures that do
not announce themselves, which are the ones worth having written down.
