import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import Redis from "ioredis";
import { runMigrations } from "@fana/db";

import { rateLimit } from "./ratelimit.js";
import { createEventBus } from "./events.js";
import { attachRealtime } from "./realtime.js";
import { startPurgeJob } from "./purge.js";
import { refreshDomains, startDomainRefresh } from "./domains.js";
import { mailboxRoutes } from "./routes/mailbox.js";
import { messageRoutes } from "./routes/messages.js";
import { domainRoutes } from "./routes/domains.js";
import { planRoutes } from "./routes/plans.js";
import { brandingRoutes } from "./routes/branding.js";
import { adminPathRoutes } from "./routes/adminPath.js";
import { adminRoutes } from "./routes/admin.js";
import { accountRoutes as adminAccountRoutes } from "./routes/accounts.js";
import { accountRoutes } from "./routes/account.js";
import { sessionRoutes } from "./routes/session.js";
import { oauthRoutes } from "./routes/oauth.js";
import { currentSession, requireAdminRole, requireSession } from "./auth/middleware.js";
import { currentKey, requireApiKey } from "./keys/middleware.js";
import { seedPlans } from "./keys/keys.js";
import { startUsageFlush } from "./keys/usage.js";
import { v1Routes } from "./routes/v1.js";
import { webhookRoutes } from "./routes/webhookRoutes.js";
import { startWebhookQueue } from "./webhooks/enqueue.js";
import { startWebhookDelivery } from "./webhooks/deliver.js";
import { keyRoutes } from "./routes/keys.js";
import { seedAuth } from "./auth/seed.js";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const redis = new Redis(redisUrl);
// One subscriber for the process, shared by the WebSocket fan-out and every
// long-polling /v1 request. A subscriber connection per waiter would not scale.
const events = createEventBus(redisUrl);

const app = new Hono();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: process.env.PUBLIC_WEB_URL ?? "*",
    // A method missing here fails the preflight, which reaches the browser as
    // "Failed to fetch" with no hint that CORS was the reason — so this list
    // has to grow whenever a route uses a verb it doesn't already name.
    allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  }),
);

app.get("/api/health", (c) => c.json({ ok: true, service: "fana-api" }));

// Public API is rate-limited per IP; admin and login have their own budgets.
const publicApi = new Hono();
const publicLimit = rateLimit({
  redis,
  max: Number(process.env.RATE_LIMIT_MAX ?? "300"),
  windowSeconds: Number(process.env.RATE_LIMIT_WINDOW_SECONDS ?? "60"),
  prefix: "public",
});
// Mounting at /api makes this `*` match /api/admin/* too. Skip those: an
// anonymous flood of the public API must never be able to lock the operator
// out of their own dashboard.
publicApi.use("*", (c, next) =>
  c.req.path.startsWith("/api/admin") ? next() : publicLimit(c, next),
);
publicApi.route("/", mailboxRoutes);
publicApi.route("/", messageRoutes);
publicApi.route("/", domainRoutes);
publicApi.route("/", planRoutes);
publicApi.route("/", brandingRoutes);
publicApi.route("/", adminPathRoutes);

app.route("/api", publicApi);

// Sign-in is unauthenticated by nature: it gets its own IP budget on top of the
// per-account lockout in auth/lockout.ts.
const login = new Hono();
const loginLimit = rateLimit({
  redis,
  max: Number(process.env.LOGIN_RATE_LIMIT_MAX ?? "20"),
  windowSeconds: Number(process.env.LOGIN_RATE_LIMIT_WINDOW_SECONDS ?? "60"),
  prefix: "login",
});
// Named paths, not `*`. A sub-app's `use("*")` mounted at /api becomes
// middleware for every /api/* route registered after it, so the sign-in budget
// of 20/min was being spent by /api/account/* and /api/admin/* — a few clicks
// around the dashboard and the operator was locked out of their own instance.
login.use("/admin/login", loginLimit);
login.use("/admin/logout", loginLimit);
login.use("/auth/*", loginLimit);
login.route("/", sessionRoutes(redis));
login.route("/", oauthRoutes(redis));
app.route("/api", login);

// The customer API. Keys carry their own quota + burst limit, so it gets no
// IP bucket: two customers behind one office NAT must not throttle each other.
const v1 = new Hono();
v1.use("*", requireApiKey(redis));
v1.route("/", v1Routes(redis, events));
v1.route("/", webhookRoutes((c) => currentKey(c).key.userId));
app.route("/v1", v1);

// A signed-in customer managing their own keys. Any role, but a session only —
// scoped to the caller, so it needs no admin gate.
//
// Mounted at its own prefix, not at /api: a sub-app's `use("*")` becomes
// middleware for every /api/* path registered after it, and mounting this one
// at /api put a "sign in to manage your account" guard in front of /api/admin/*.
const account = new Hono();
account.use("*", requireSession(redis));
account.route("/", accountRoutes(redis));
account.route("/", webhookRoutes((c) => currentSession(c)!.userId));
app.route("/api/account", account);

// Everything else under /api/admin needs a session or the API token, and gets a
// budget of its own so admin traffic can't be starved by (or starve) the public API.
const admin = new Hono();
admin.use(
  "*",
  rateLimit({
    redis,
    max: Number(process.env.ADMIN_RATE_LIMIT_MAX ?? "600"),
    windowSeconds: Number(process.env.ADMIN_RATE_LIMIT_WINDOW_SECONDS ?? "60"),
    prefix: "admin",
  }),
);
admin.use("*", requireSession(redis));
admin.use("*", requireAdminRole());
admin.route("/", adminRoutes);
admin.route("/", adminAccountRoutes(redis));
admin.route("/", keyRoutes(redis));
app.route("/api", admin);

// Apply pending DB migrations on boot (idempotent). Set MIGRATE_ON_START=false
// to run migrations as a separate deploy step instead.
if (process.env.MIGRATE_ON_START !== "false") {
  await runMigrations();
}

// Plans first: `users.plan_id` is NOT NULL and references them, so the admin
// account seedAuth creates cannot exist until there is a plan to put it on.
// The other order only works on a database that already has one — which is
// every database except a brand new one, so it survived until a first deploy.
await seedPlans();
// First boot: create the admin account and API token, printing them once.
await seedAuth();

// Warm the served-domain cache before accepting traffic, then keep it fresh.
await refreshDomains();

const port = Number(process.env.API_PORT ?? "4000");
const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[api] listening on :${info.port}`);
});

const stopRealtime = attachRealtime(server as never, events);
const stopPurge = startPurgeJob();
const stopDomainRefresh = startDomainRefresh();
const stopUsageFlush = startUsageFlush(redis);
// Mail arrives in SMTP but is pushed from here: the sender is blocked until
// `handleMessage` returns, and somebody else's HTTP server is not that path.
const stopWebhookQueue = startWebhookQueue(events);
const stopWebhookDelivery = startWebhookDelivery();

async function shutdown() {
  console.log("[api] shutting down");
  stopPurge();
  stopDomainRefresh();
  stopWebhookQueue();
  stopWebhookDelivery();
  // Flush the live usage counters before the process goes away.
  await stopUsageFlush();
  await stopRealtime();
  await events.close();
  await redis.quit();
  server.close();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
