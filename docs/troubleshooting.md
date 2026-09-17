# Troubleshooting

Failures that do not announce themselves, in rough order of how long they cost
to work out.

---

## API calls return HTML with status 200

**Symptom.** `curl https://your-host/v1/me` answers `200` with
`content-type: text/html`. The website works. Nothing is in any error log.

**Cause.** `/v1` is not routed to the API. The request reaches the web app,
whose inbox catch-all resolves the unknown path to an inbox and renders a page —
so the failure arrives as a success.

**Fix.** The API has **two** top-level mounts, `/api` *and* `/v1`, plus `/ws`.
Every one of them needs a route in your reverse proxy. The bundled Caddyfile has
them; a hand-written nginx config usually starts with only `/api`.

```nginx
location /v1/ {
    proxy_pass http://127.0.0.1:4589;
    proxy_http_version 1.1;
    proxy_set_header Host              $host;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 180s;
}
```

Check with `nginx -T | grep "location /v1"` — reading the file you *think* is
loaded is not the same as asking nginx what it loaded.

---

## The site loads but has no styling

**Symptom.** The page renders as unstyled HTML. No JavaScript runs.

**Cause.** A reverse proxy rule is serving static assets from disk instead of
passing them to the app. Control panels (aaPanel, Plesk) add these by default:

```nginx
location ~ .*\.(js|css)?$ { expires 12h; }
```

That is a **regex** location, and in nginx a regex beats a prefix. So
`/_next/static/chunks/main.js` never reaches the app — it is served from the
site root, which is an empty directory, and 404s.

**Fix.** Delete those blocks. The app serves and caches its own assets.

---

## `/v1/inboxes/:address/wait` disconnects after 60 seconds

**Cause.** `wait` holds the connection open for up to 120 seconds. Most proxies
default to a 60-second read timeout.

**Fix.** `proxy_read_timeout 180s;` on the `/v1` location. Caddy has no such
default and needs nothing.

---

## Rate limits trip almost immediately

**Cause.** Your proxy is not forwarding the client address, so every request
looks like one client and they share a single budget.

**Fix.** `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` on every
proxied location.

The inverse also happens: a request from a private address with *no* forwarded
header is treated as the deployment's own server-side rendering and is not
limited at all. If your proxy strips the header, rate limiting silently stops
working rather than misfiring.

```bash
curl -sI https://your-host/api/domains | grep -i ratelimit
```

The `ratelimit-*` headers should be present and count down.

---

## Port 25 is already in use

```
Bind for 0.0.0.0:25 failed: port is already allocated
```

**Find out what holds it before stopping anything:**

```bash
sudo ss -tlnp | grep ':25\s'
```

- **A local MTA** (Postfix, Exim). Most VPS images ship one for system mail. If
  nothing depends on it: `sudo systemctl disable --now postfix`.
- **`docker-proxy`** — another container. `docker ps` and `docker compose ls`
  will show which. A previous install from a different directory is a different
  compose project and keeps running.
- **A full mail server** you actually use (mailcow, Mailu, poste.io). Only one
  process per IP can hold port 25 and an MX record cannot name a different port,
  so either it moves, fana gets a second IP, or fana receives relayed mail from
  it. Relaying costs you the SPF/DKIM verdicts unless the relay forwards the
  original client address with XCLIENT.

If the MTA only listens on `127.0.0.1`, you can bind fana to the public address
instead of stopping it:

```yaml
smtp:
  ports:
    - "<public IP>:25:25"
```

---

## The API container exits on first boot

Check the log — it prints the reason and then stops:

```bash
docker compose ps -a
docker compose logs api --tail 50
```

Two causes worth knowing:

- **Database authentication fails.** `POSTGRES_PASSWORD` is only read when the
  volume is first created. If a volume already exists, changing `DB_PASSWORD`
  changes what the API sends and not what Postgres expects. Note that the
  Postgres healthcheck passes either way — `pg_isready` does not log in.

  On a new install with no data worth keeping:
  ```bash
  docker compose down && docker volume rm fana_pgdata && docker compose up -d
  ```
  On a real one:
  ```bash
  docker compose exec postgres psql -U fana -d fana \
    -c "ALTER USER fana WITH PASSWORD 'the new one';"
  ```

- **`no plan configured`.** Fixed in current versions; if you are on an older
  commit, pull.

---

## Mail never arrives and the SMTP log is silent

Silence means it never reached the server. That is DNS or the firewall.

```bash
dig +short MX mail.your-domain     # must answer, with a trailing dot in the value
dig +short A  mx.your-domain       # the MX target needs its own A record
sudo ufw status | grep 25
```

If the log *does* show the message but the inbox looks empty, the address is
probably on a domain the instance does not serve — `GET /api/domains` lists what
it accepts.

---

## Sign-in redirects somewhere strange

**Symptom.** After authorising with the provider the browser lands on a URL like
`/api/auth/github/=https://your-host/dashboard#token=…`, and the page shows an
error.

**Cause.** `PUBLIC_WEB_URL` is malformed — usually a doubled `=` in `.env`. The
redirect is built from it, so a value of `=https://your-host` produces a
*relative* URL that the browser resolves against the callback path.

The `#token=` in the URL means the sign-in itself worked; only the destination
was wrong.

```bash
docker compose exec api sh -c 'echo "[$PUBLIC_WEB_URL]"'
```

It should print the URL with no `=`, no spaces and no trailing slash.

---

## Webhooks never arrive

- **Endpoints on private or loopback addresses are refused.** A webhook makes
  the server fetch a URL somebody else chose, so private literals are rejected
  at registration and the hostname is resolved and re-checked before every
  delivery. `WEBHOOK_ALLOW_PRIVATE=true` lifts this **for local development
  only**.
- **Redirects are never followed.** Your endpoint must answer directly.
- **Only mail your account owns is delivered.** A public inbox has no owner, so
  there is nobody to notify — webhooks are a `/v1` feature.
- `GET /v1/webhooks/:id/deliveries` records every attempt with its status code
  and error, and the dashboard shows the same list. The **Send test** button
  posts a sample event through the same signing and address checks as a real
  delivery, so a passing test means something.
