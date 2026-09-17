# Contributing to fana

Thanks for helping out! 🎉

## Setup

```bash
pnpm install
docker compose up postgres redis -d
cp .env.example .env
pnpm db:push
pnpm dev
```

## Before opening a PR

```bash
pnpm typecheck   # must pass
pnpm lint
pnpm test
pnpm format
```

## Guidelines

- **One concern per PR.** Small, reviewable changes merge faster.
- **Conventional Commits** for messages: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`.
- **TypeScript strict** — no `any` escape hatches without a comment explaining why.
- Add or update docs when you change behavior or the API surface.

## Good first issues

- Add DOMPurify / iframe sandboxing for rendered HTML bodies
- S3 / object-storage backend for attachments
- Address reservation to prevent collisions on custom aliases
- i18n for the web UI
- E2E test that sends a real message through SMTP and asserts it in the UI

## Security

Found a vulnerability? Please **do not** open a public issue — instead report it
privately via [GitHub Security Advisories](https://github.com/JastinXyz/fana/security/advisories/new).
