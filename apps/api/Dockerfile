# Build context is the repo root: docker build -f apps/api/Dockerfile .
FROM node:22-alpine
RUN corepack enable
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/storage/package.json packages/storage/
COPY apps/api/package.json apps/api/

RUN pnpm install --frozen-lockfile --filter @fana/api...

COPY packages/core packages/core
COPY packages/db packages/db
COPY packages/storage packages/storage
COPY apps/api apps/api

EXPOSE 4000
CMD ["pnpm", "--filter", "@fana/api", "exec", "tsx", "src/index.ts"]
