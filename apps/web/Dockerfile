# Build context is the repo root: docker build -f apps/web/Dockerfile .
FROM node:22-alpine AS builder
RUN corepack enable
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY apps/web/package.json apps/web/

RUN pnpm install --frozen-lockfile --filter @fana/web...

COPY packages/core packages/core
COPY apps/web apps/web

# Only the browser-facing API URL is baked in; branding (SITE_NAME, BRAND_*)
# is read from env at request time, so this image rebrands without a rebuild.
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN pnpm --filter @fana/web build

FROM node:22-alpine AS runner
RUN corepack enable
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app ./
EXPOSE 3000
CMD ["pnpm", "--filter", "@fana/web", "start"]
