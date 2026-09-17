# Build context is the repo root: docker build -f apps/smtp/Dockerfile .
FROM node:22-alpine
RUN corepack enable
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/storage/package.json packages/storage/
COPY apps/smtp/package.json apps/smtp/

RUN pnpm install --frozen-lockfile --filter @fana/smtp...

COPY packages/core packages/core
COPY packages/db packages/db
COPY packages/storage packages/storage
COPY apps/smtp apps/smtp

EXPOSE 25
CMD ["pnpm", "--filter", "@fana/smtp", "exec", "tsx", "src/index.ts"]
