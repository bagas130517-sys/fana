# Operating an instance

The operator side: signing in, keeping the dashboard out of sight, and the
endpoints behind it.

---

## Admin accounts

Dashboard sign-in is username and password. Passwords are bcrypt hashes;
sessions are opaque tokens held in Redis with a sliding 12-hour expiry,
revocable per account.

Failed sign-ins are counted **per IP and per username**, so the lockout survives
an attacker rotating either one. A sign-in attempt for a username that does not
exist still runs a bcrypt comparison against a dummy hash, so timing does not
reveal which accounts are real.

**Nothing about admin access lives in `.env`.** The first account and the API
token are generated on first boot and printed once. After that they are managed
in the dashboard under **Access**: add or remove admins, reset a password (which
signs that account out everywhere), and regenerate the API token.

Only a SHA-256 of the API token is stored, so it can be replaced but never
re-read. Same for customer API keys.

---

## Keeping the sign-in form out of sight

Layered, cheapest first.

**1. Move it.** Access → Dashboard URL. `ADMIN_PATH` seeds this on first boot;
after that it lives in the database and a change takes effect within ~30s with
no restart. `/admin` then 404s like any other missing page.

The path is never sent to the browser and never appears in `robots.txt`. The
public API only answers "is this the dashboard path?" for a path the visitor
already typed, so guessing it costs exactly what guessing a URL costs.

**2. Restrict it at the proxy.** In [`infra/Caddyfile`](../infra/Caddyfile),
wrap the admin path in a matcher with `remote_ip` for your office or VPN range —
or put it behind mTLS or an identity proxy such as Tailscale or Cloudflare
Access.

**3. Don't publish it.** Run the dashboard on a private interface and reach it
over a VPN.

**Obscurity is not the control.** The password, the lockout and the rate limit
are. Moving the path only removes drive-by traffic — `POST /api/admin/login` is
at a fixed URL regardless. Pair it with (2) if the instance is public.

---

## Three gates

| Guard | Grants |
| --- | --- |
| `requireApiKey` | `/v1/*` — a customer key, charged against its account's plan |
| `requireSession` | signed in, either role. Also accepts the instance API token |
| `requireAdminRole` | `/api/admin/*`, on top of a session |

`/api/account/*` is session-only and every query is scoped to the caller, so
guessing another user's key id returns 404 rather than their key.

---

## The admin API

Everything below needs `Authorization: Bearer <token>` — either a dashboard
**session token** from `POST /api/admin/login`, or the instance **API token**
shown once when generated.

### Sessions and accounts

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/api/admin/login` | Sign in (`{username, password}`) → session token |
| `DELETE` | `/api/admin/logout` | Revoke the current session |
| `GET` | `/api/admin/session` | Who the current caller is |
| `GET` | `/api/admin/admins` | Dashboard accounts |
| `POST` | `/api/admin/admins` | Add an admin |
| `PUT` | `/api/admin/admins/:id/password` | Reset someone's password |
| `DELETE` | `/api/admin/admins/:id` | Remove an admin |
| `POST` | `/api/admin/account/password` | Change your own |
| `POST` | `/api/admin/sessions/revoke-all` | Sign out every admin |

### Customers, plans and keys

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/admin/users` | Customer accounts, paged |
| `PUT` | `/api/admin/users/:id` | Move an account to another plan |
| `GET` | `/api/admin/plans` | Plans |
| `POST` | `/api/admin/plans` | Add a plan |
| `PUT` | `/api/admin/plans/:slug` | Edit a plan |
| `DELETE` | `/api/admin/plans/:slug` | Remove a plan — refused while accounts are on it |
| `GET` | `/api/admin/keys` | Every customer key with usage |
| `POST` | `/api/admin/keys` | Issue a key to an account |
| `GET` | `/api/admin/keys/:id/usage` | One key's usage history |
| `DELETE` | `/api/admin/keys/:id` | Revoke a key |

### Instance

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/admin/stats` | Counters |
| `GET` | `/api/admin/activity` | Messages per hour, last 24h |
| `GET` | `/api/admin/health` | Database and Redis reachability |
| `GET` | `/api/admin/config` | Read-only configuration snapshot |
| `GET` | `/api/admin/messages` | Recent mail, metadata only, paged |
| `GET` | `/api/admin/domains` | Built-in and community domains, paged |
| `POST` | `/api/admin/domains` | Add a community domain |
| `POST` | `/api/admin/domains/:domain/verify` | Force an MX re-check |
| `DELETE` | `/api/admin/domains/:domain` | Revoke a community domain |
| `GET` | `/api/admin/abuse` | Top sender IPs and the block list |
| `POST` | `/api/admin/block` | Block a sender IP |
| `DELETE` | `/api/admin/block/:ip` | Unblock |

### Maintenance

| Method | Endpoint | Description |
| --- | --- | --- |
| `DELETE` | `/api/admin/mailbox/:address` | Purge one mailbox |
| `POST` | `/api/admin/purge-expired` | Force a purge sweep |
| `POST` | `/api/admin/purge-all` | Delete every message (`{confirm:"purge-all"}`) |
| `POST` | `/api/admin/release-reservations` | Free expired address holds |
| `POST` | `/api/admin/recheck-domains` | Re-verify every community domain |
| `POST` | `/api/admin/reset-rate-limits` | Clear per-IP counters and lockouts |

### Branding and the dashboard path

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` / `PUT` / `DELETE` | `/api/admin/branding` | Read, save, reset overrides |
| `GET` / `PUT` | `/api/admin/admin-path` | Read or move the dashboard |
| `GET` / `POST` | `/api/admin/api-token` | Prefix and usage, or regenerate |

---

## The free surface

No key, rate-limited per IP. This is what the website itself runs on, and every
inbox it touches is public.

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/api/mailbox/random?domain=` | Mint and reserve a random address |
| `POST` | `/api/mailbox/claim` | Renew or reclaim a reservation |
| `GET` | `/api/mailbox/:address/messages` | List an inbox |
| `POST` | `/api/mailbox/:address/read` | Mark all as read |
| `DELETE` | `/api/mailbox/:address` | Purge an inbox |
| `GET` | `/api/messages/:id` | Read a message, with codes and links extracted |
| `DELETE` | `/api/messages/:id` | Delete a message |
| `GET` | `/api/messages/:id/attachments/:attId` | Download an attachment |
| `GET` | `/api/messages/:id/raw` | Original RFC822 source |
| `GET` | `/api/domains` | Domains this instance serves |
| `POST` | `/api/domains` | Register a community domain |
| `GET` | `/api/plans` | Plans this instance offers |
| `GET` | `/api/branding` | Effective branding |
| `GET` | `/api/auth/providers` | Sign-in methods offered |

**WebSocket:** `wss://host/ws?mailbox=addr` — one inbox per socket. Mail for a
private inbox is never sent here; the socket has no authentication.

The keyed customer API (`/v1`) is documented at `/docs` on your own instance,
where it can state your base URL, your served domains and your plan limits.
