import {
  bigint,
  bigserial,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// Postgres bytea <-> Node Buffer.
const bytea = customType<{ data: Buffer; default: false }>({
  dataType() {
    return "bytea";
  },
});

// Shared audit columns. `id` is an internal incremental key (fast joins); tables
// exposed by the public API also carry an unguessable `public_id` (see messages
// / attachments) so nobody can enumerate rows by counting.
const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const messages = pgTable(
  "messages",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    publicId: uuid("public_id").notNull().defaultRandom().unique(),
    // Full recipient address, lowercased: user@domain.
    mailbox: text("mailbox").notNull(),
    fromAddress: text("from_address").notNull(),
    fromName: text("from_name"),
    subject: text("subject").notNull().default(""),
    text: text("text"),
    html: text("html"),
    // Raw RFC822 source, kept for "view original" + reprocessing.
    raw: bytea("raw"),
    // Sender authentication results (SPF/DKIM/DMARC) + derived verdict.
    spf: text("spf"),
    dkim: text("dkim"),
    dmarc: text("dmarc"),
    verdict: text("verdict").notNull().default("unverified"),
    seen: boolean("seen").notNull().default(false),
    // Who may read this message. NULL = public, the default the website mints:
    // anyone who knows the address sees it. Set at ingestion when the inbox was
    // minted private through /v1, and then only that account's keys can read it.
    // Stamped on the message rather than resolved from the reservation at read
    // time, so mail does not become public the moment the reservation expires.
    // Deliberately not a foreign key: `ON DELETE CASCADE` would delete rows
    // behind `deleteMessagesWhere` and orphan their attachment blobs in S3.
    ownerUserId: bigint("owner_user_id", { mode: "number" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => ({
    mailboxIdx: index("messages_mailbox_idx").on(t.mailbox, t.createdAt),
    expiresIdx: index("messages_expires_idx").on(t.expiresAt),
    ownerIdx: index("messages_owner_idx").on(t.ownerUserId),
  }),
);

export const attachments = pgTable(
  "attachments",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    publicId: uuid("public_id").notNull().defaultRandom().unique(),
    messageId: bigint("message_id", { mode: "number" })
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull().default("application/octet-stream"),
    size: integer("size").notNull(),
    // Blob lives in exactly one place: inline `content` (db driver) OR the
    // object store keyed by `storageKey` (s3 driver).
    content: bytea("content"),
    storageKey: text("storage_key"),
    ...timestamps,
  },
  (t) => ({
    messageIdx: index("attachments_message_idx").on(t.messageId),
  }),
);

// Soft claim on an address so the random generator never hands the same one to
// two clients at once, and a returning client can reclaim its own. Looked up by
// address (unique), never exposed by id — no public_id needed.
export const reservations = pgTable(
  "reservations",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    address: text("address").notNull().unique(),
    token: text("token").notNull(),
    // Which key minted this inbox — kept for "which key is busy" in the
    // dashboard. Retention and ownership come from `ownerUserId` instead, so
    // revoking a key does not change what an inbox it minted is entitled to.
    keyId: bigint("key_id", { mode: "number" }),
    // The account that minted this inbox through /v1. Its plan sets retention
    // for mail arriving here, and it counts against that plan's concurrent
    // inbox limit.
    ownerUserId: bigint("owner_user_id", { mode: "number" }),
    // Private inboxes stamp `messages.owner_user_id` at ingestion, so only the
    // owner's keys can read the mail. Public ones (everything the website
    // mints) stay readable by anyone who knows the address.
    isPrivate: boolean("private").notNull().default(false),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => ({
    expiresIdx: index("reservations_expires_idx").on(t.expiresAt),
    ownerIdx: index("reservations_owner_idx").on(t.ownerUserId),
  }),
);

// Community-added domains. Usable once the MX points at this instance (verified).
// Built-in domains from MAIL_DOMAINS are always served and are NOT stored here.
export const domains = pgTable("domains", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  domain: text("domain").notNull().unique(),
  verified: boolean("verified").notNull().default(false),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  ...timestamps,
});

// Everyone with an account: the operators who run the instance and the
// customers who buy API keys. One table because an operator normally wants a
// key too, and both need the same sessions — `role` is the only difference.
//
// Credentials differ by how you got here: an operator is seeded on first boot
// with a password (a self-hosted instance may have no OAuth configured at all),
// a customer signs in through a provider and has no password.
export const users = pgTable("users", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  publicId: uuid("public_id").notNull().defaultRandom().unique(),
  username: text("username").notNull().unique(),
  email: text("email"),
  name: text("name"),
  role: text("role").notNull().default("customer"), // admin | customer
  // The plan this account is on. Keys inherit it: quota and retention are what
  // the customer subscribed to, not a property of whichever key they used.
  planId: bigint("plan_id", { mode: "number" })
    .notNull()
    .references(() => plans.id),
  passwordHash: text("password_hash"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  ...timestamps,
});

// OAuth logins linked to a user. A separate table so a second provider is a row
// rather than another pair of columns, and so one account can hold several.
export const identities = pgTable(
  "identities",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // github, …
    providerUserId: text("provider_user_id").notNull(),
    email: text("email"),
    ...timestamps,
  },
  (t) => ({
    providerIdx: uniqueIndex("identities_provider_user_idx").on(
      t.provider,
      t.providerUserId,
    ),
    userIdx: index("identities_user_idx").on(t.userId),
  }),
);

// Machine token for the REST API (curl, cron, monitoring). Only the SHA-256 of
// the token is stored; the plaintext is shown once when it's generated. `prefix`
// is the leading chars, kept so the dashboard can identify the active token.
export const apiTokens = pgTable("api_tokens", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  prefix: text("prefix").notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  ...timestamps,
});

// What an API key is allowed to do. Rows, not code: an instance starts with a
// single free plan (seeded on boot) and the operator adds paid ones from /admin
// when there's a reason to.
export const plans = pgTable("plans", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  slug: text("slug").notNull().unique(),
  label: text("label").notNull(),
  monthlyRequests: integer("monthly_requests").notNull().default(1000),
  requestsPerMinute: integer("requests_per_minute").notNull().default(30),
  // Overrides MESSAGE_TTL_MINUTES for mail addressed to this plan's inboxes.
  retentionMinutes: integer("retention_minutes").notNull().default(60),
  concurrentInboxes: integer("concurrent_inboxes").notNull().default(3),
  ...timestamps,
});

// Customer keys for the /v1 API. Like the instance token, only the SHA-256 is
// stored and the plaintext is shown once at creation.
export const apiKeys = pgTable(
  "api_keys",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    publicId: uuid("public_id").notNull().defaultRandom().unique(),
    // The customer this key belongs to. Admin-issued keys are assigned to a
    // user too — there is no such thing as an ownerless key.
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // What the owner calls it: "CI", "staging", …
    label: text("label").notNull(),
    keyHash: text("key_hash").notNull().unique(),
    prefix: text("prefix").notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    userIdx: index("api_keys_user_idx").on(t.userId),
  }),
);

// Requests per key per calendar month. Counting happens in Redis on the hot
// path; this is the durable copy that survives a flush and backs any invoice.
export const apiKeyUsage = pgTable(
  "api_key_usage",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    keyId: bigint("key_id", { mode: "number" })
      .notNull()
      .references(() => apiKeys.id, { onDelete: "cascade" }),
    period: text("period").notNull(), // YYYY-MM, UTC
    requests: integer("requests").notNull().default(0),
    ...timestamps,
  },
  (t) => ({
    keyPeriodIdx: uniqueIndex("api_key_usage_key_period_idx").on(t.keyId, t.period),
  }),
);

// Where a customer wants their mail pushed. Owned by the account, never by a
// key: a message records `owner_user_id` and nothing else, and an endpoint tied
// to a key would stop delivering the moment that key was rotated — for inboxes
// that are still alive and still the customer's.
export const webhooks = pgTable(
  "webhooks",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    publicId: uuid("public_id").notNull().defaultRandom().unique(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    /** Signing secret. Shown whenever asked — the receiver needs it to verify. */
    secret: text("secret").notNull(),
    /** What the customer calls it: "staging", "ci". */
    label: text("label").notNull().default(""),
    enabled: boolean("enabled").notNull().default(true),
    /** Consecutive failed deliveries; reset by any success. */
    failures: integer("failures").notNull().default(0),
    /** Why the last attempt failed, so the dashboard can answer "why not?". */
    lastError: text("last_error"),
    lastDeliveryAt: timestamp("last_delivery_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    userIdx: index("webhooks_user_idx").on(t.userId),
  }),
);

// One row per (endpoint, message): the queue, the retry state and the record of
// what happened. In Postgres rather than Redis because "why did my webhook not
// arrive" is a question a customer will ask, and the answer has to outlive a
// cache flush.
export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    publicId: uuid("public_id").notNull().defaultRandom().unique(),
    webhookId: bigint("webhook_id", { mode: "number" })
      .notNull()
      .references(() => webhooks.id, { onDelete: "cascade" }),
    // Deliberately not a foreign key: messages are hard-deleted when they
    // expire, and a delivery still in flight must survive its message.
    messageId: bigint("message_id", { mode: "number" }).notNull(),
    event: text("event").notNull().default("message.received"),
    // The body as it will be sent, snapshotted at enqueue. The message may be
    // purged before a retry succeeds, and a retry that can no longer say what
    // arrived is not a retry.
    payload: jsonb("payload").notNull(),
    /** pending | sending | delivered | failed */
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastStatus: integer("last_status"),
    lastError: text("last_error"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    // Every API node sees the same realtime event, so all of them try to
    // enqueue. This is what makes the second one a no-op instead of a duplicate.
    onceIdx: uniqueIndex("webhook_deliveries_once_idx").on(t.webhookId, t.messageId),
    dueIdx: index("webhook_deliveries_due_idx").on(t.status, t.nextAttemptAt),
  }),
);

// Instance settings an operator can change at runtime from /admin, keyed by
// name with a JSON payload (`branding` today). Env stays the source of truth for
// infrastructure config — this is only for things the dashboard can edit.
export const settings = pgTable("settings", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  key: text("key").notNull().unique(),
  value: jsonb("value").notNull().default({}),
  ...timestamps,
});

export type MessageRow = typeof messages.$inferSelect;
export type NewMessageRow = typeof messages.$inferInsert;
export type AttachmentRow = typeof attachments.$inferSelect;
export type NewAttachmentRow = typeof attachments.$inferInsert;
export type ReservationRow = typeof reservations.$inferSelect;
export type DomainRow = typeof domains.$inferSelect;
export type SettingRow = typeof settings.$inferSelect;
export type UserRow = typeof users.$inferSelect;
export type IdentityRow = typeof identities.$inferSelect;
export type ApiTokenRow = typeof apiTokens.$inferSelect;
export type PlanRow = typeof plans.$inferSelect;
export type ApiKeyRow = typeof apiKeys.$inferSelect;
export type WebhookRow = typeof webhooks.$inferSelect;
export type WebhookDeliveryRow = typeof webhookDeliveries.$inferSelect;
export type NewWebhookDeliveryRow = typeof webhookDeliveries.$inferInsert;
