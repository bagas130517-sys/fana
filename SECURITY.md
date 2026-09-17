# Security

## Reporting a vulnerability

Use GitHub's [private vulnerability
reporting](https://github.com/JastinXyz/fana/security/advisories/new) — it opens
a report only the maintainers can see. Please don't open a public issue for
something exploitable.

Include what you did, what happened, and what you expected. A request and its
response is usually enough.

This is a spare-time project, not a company: expect a reply in days, not hours,
and there's no bounty.

## What is and isn't a vulnerability

**Inbox contents are public by design.** Anyone who knows or guesses an address
can read the mail sent to it. That is what the product is, it is stated on the
front page, and reports that "I can read someone else's inbox by guessing the
address" are working as intended.

What *is* a vulnerability:

- Reading a **private** inbox — one minted through `/v1` — without that
  account's key. Private mail is stamped with an owner at ingestion; every
  keyless surface filters it out and `/v1` scopes reads to the caller's account.
- Any way past `requireApiKey`, `requireSession` or `requireAdminRole`, or a
  route that answers with another account's data.
- **Request forgery through webhooks.** A customer supplies the URL and the
  server fetches it. Private addresses are rejected at registration, the
  hostname is re-resolved before every delivery, and redirects are never
  followed. A way around any of those is a real finding.
- **Script execution from email HTML.** Mail is sanitized at ingestion and
  rendered in a sandboxed iframe. Anything that escapes either layer matters.
- Using the SMTP server to **send** mail. It receives only and never relays; if
  you can make it deliver outbound, that is serious.
- Injection of any kind, leaking a secret (`api_keys` and `api_tokens` are stored
  hashed, webhook secrets are not), or forging a webhook signature.

## Running an instance

A few things are your responsibility as an operator, and getting them wrong is
not a bug in the software:

- **Don't put your brand domain in `MAIL_DOMAINS`.** `billing@` on a mail domain
  is readable by anyone.
- **Keep `WEBHOOK_ALLOW_PRIVATE=false`.** It exists for local development and
  turns off the request-forgery protection.
- **Terminate TLS.** The bundled compose file does this with Caddy and publishes
  the app on `127.0.0.1` only; if you replace it, don't expose the API on plain
  HTTP — bearer tokens and mail bodies go over it.
- **Change the seeded admin password** after first boot, and move the dashboard
  path.

## Supported versions

The default branch is what gets fixes. There are no long-lived release branches,
so "upgrade" means pulling `main` and rebuilding.
