# Roadmap

## v0.1 — MVP (current scaffold)

- [x] Inbound SMTP → parse → store
- [x] Random + custom addresses
- [x] Realtime inbox (WebSocket + Redis pub/sub)
- [x] Attachments (store + download)
- [x] Auto-expiry + purge job
- [x] Public REST API + per-IP rate limit
- [x] Token-guarded admin stats/purge
- [x] Admin accounts (username + password, sessions, login lockout)
- [x] Docker Compose one-command deploy
- [x] HTML sanitization (sanitize-html at ingestion + sandboxed iframe render)
- [ ] Live public demo
- [x] Unit tests for address gen + parser + rate limit

## v0.2 — Hardening

- [x] Object-storage (S3/R2/MinIO) backend for attachments (STORAGE_DRIVER=s3)
- [x] Inbound SMTP rate-limit per IP (flood protection)
      <!-- Greylisting / content spam-scoring intentionally dropped: they add
           delay/rejection, which fights temp-mail's "receive everything instantly"
           goal. The SPF/DKIM verdict badge already covers sender trust. -->

- [x] SPF/DKIM/DMARC verification + verdict badge in the UI
- [x] Address reservation to avoid custom-alias collisions

## v0.3 — Product polish

- [x] Community domains — bring-your-own via MX (self-service, MX-verified)
- [x] Admin web dashboard (not just API)
- [x] QR code (shareable inbox URL) + copy
- [x] Dark mode toggle (system-aware, no-flash)
- [x] URL-addressable inboxes (/alias@domain) + shareable links
- [x] Multiple concurrent inboxes (one per browser tab, independent state)
- [ ] i18n (EN / ID first) — **parked**, no implementation planned yet
      <!-- Not queued work. Nothing about the product is blocked on it: the
           audience so far reads the API reference, which is English either way,
           and every string an operator can change (name, tagline) is already
           theirs. Picking a library before there is a second locale to serve
           would freeze a decision on no evidence. Revisit when a non-English
           audience actually shows up, or when a self-hoster asks. -->

- [x] Themeable branding for self-hosters (DB-backed, edited in /admin, no rebuild)

## v0.4 — Making it a product

- [x] Customer API (`/v1`) with per-key quotas and usage metering
- [x] Plans in the DB (retention, quota, burst), editable in /admin
- [x] Customer accounts (GitHub sign-in) + self-serve keys at /dashboard
- [x] Public API reference at `/docs` — instance-aware (own base URL, served
      domains, plan limits), linked from the inbox header
- [x] Private inboxes — readable only by the account that created them (default on `/v1`)
- [x] `wait` endpoint (long-poll for a matching message)
- [x] Extract OTP codes + links from a message
- [x] Cut ingestion latency — blob upload off the critical path, parse/auth/policy
      in parallel, PTR lookup dropped, stats counter unawaited
      <!-- Measured end to end (SMTP connect → realtime event): a message with a
           64KB attachment went 165ms → 146ms median, and the part we control
           (excluding smtp-server's fixed 100ms early-talker delay) 63ms → 44ms.
           Without attachments it is unchanged — parsing is ~2ms and the policy
           lookup was already cached, so there was nothing there to win.

           DKIM/SPF stays *on* the hot path deliberately. Moving it off means
           storing and publishing a message whose verdict is not known yet, so
           the UI would show an unverified badge that later changes — for ~15ms.
           A sender's MTA does not care about 15ms; a wrong badge is worse. -->


## Later

- [ ] Optional password-protected private inboxes
- [x] Webhook forwarding (push inbound mail to a user URL)
- [ ] Helm chart for Kubernetes
