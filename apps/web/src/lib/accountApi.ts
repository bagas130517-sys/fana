import { ApiError, clearToken, getToken } from "./adminApi";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** The customer side of the API: your account, your keys, your usage. */

export interface Account {
  id: string;
  username: string;
  name: string | null;
  email: string | null;
  role: string;
  createdAt: string;
}

export interface AccountPlan {
  slug: string;
  label: string;
  monthlyRequests: number;
  requestsPerMinute: number;
  retentionMinutes: number;
}

export interface AccountKey {
  id: string;
  label: string;
  prefix: string;
  /** This key's share of the account's usage — the quota itself is the account's. */
  usage: number;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface AccountKeys {
  plan: AccountPlan;
  /** Requests this account made this month, across every key. */
  usage: number;
  keys: AccountKey[];
}

/** An inbox the account is holding — minted with a key, listed with a session. */
export interface HeldInbox {
  address: string;
  /** Private ones are readable only through /v1 with one of this account's keys. */
  private: boolean;
  reservedUntil: string;
  createdAt: string;
  messages: number;
}

/** What a paged endpoint adds alongside its rows. */
export interface PageMeta {
  page: number;
  perPage: number;
  total: number;
  pages: number;
}

export interface HeldInboxes extends PageMeta {
  inboxes: HeldInbox[];
  /** The plan's concurrentInboxes. 0 = unlimited. */
  limit: number;
}

/** A place the account wants its mail pushed to. */
export interface Webhook {
  id: string;
  url: string;
  label: string;
  /** Readable, not write-only: the receiver needs it to verify signatures. */
  secret: string;
  enabled: boolean;
  failures: number;
  lastError: string | null;
  lastDeliveryAt: string | null;
  createdAt: string;
}

export interface Delivery {
  id: string;
  event: string;
  status: string;
  attempts: number;
  lastStatus: number | null;
  lastError: string | null;
  nextAttemptAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

export interface Provider {
  id: string;
  label: string;
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    ...init,
    headers: { ...init.headers, authorization: `Bearer ${getToken() ?? ""}` },
  });

  if (!res.ok) {
    const body = ((await res.json().catch(() => null)) ?? {}) as {
      error?: string;
    } & Record<string, unknown>;
    if (res.status === 401) clearToken();
    throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status, body);
  }
  return res.json() as Promise<T>;
}

export const accountApi = {
  /** Sign-in methods this instance offers — empty when none is configured. */
  providers: () =>
    fetch(`${API_URL}/api/auth/providers`)
      .then((r) => r.json() as Promise<{ providers: Provider[] }>)
      .catch(() => ({ providers: [] })),

  signInUrl: (provider: string, returnTo = "/dashboard") =>
    `${API_URL}/api/auth/${provider}?returnTo=${encodeURIComponent(returnTo)}`,

  me: () => req<{ user: Account }>("/account"),
  keys: () => req<AccountKeys>("/account/keys"),
  createKey: (label: string) =>
    req<{ key: string; id: string; prefix: string }>("/account/keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label }),
    }),
  revokeKey: (id: string) =>
    req<{ ok: boolean }>(`/account/keys/${encodeURIComponent(id)}`, { method: "DELETE" }),

  webhooks: () => req<{ webhooks: Webhook[] }>("/account/webhooks"),
  createWebhook: (url: string, label: string) =>
    req<{ webhook: Webhook }>("/account/webhooks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url, label }),
    }),
  /** Re-enabling also clears the failure streak, so it gets a clean run. */
  setWebhookEnabled: (id: string, enabled: boolean) =>
    req<{ webhook: Webhook }>(`/account/webhooks/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled }),
    }),
  deleteWebhook: (id: string) =>
    req<{ ok: boolean }>(`/account/webhooks/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  /** Sends a sample event now and reports what the endpoint answered. */
  testWebhook: (id: string) =>
    req<{ ok: boolean; status?: number; error?: string }>(
      `/account/webhooks/${encodeURIComponent(id)}/test`,
      { method: "POST" },
    ),
  deliveries: (id: string, page = 1) =>
    req<{ deliveries: Delivery[] } & PageMeta>(
      `/account/webhooks/${encodeURIComponent(id)}/deliveries?page=${page}`,
    ),

  inboxes: (page = 1) => req<HeldInboxes>(`/account/inboxes?page=${page}`),
  /** Frees a concurrent-inbox slot — and deletes the mail in it. */
  releaseInbox: (address: string) =>
    req<{ ok: boolean; deleted: number }>(
      `/account/inboxes/${encodeURIComponent(address)}`,
      { method: "DELETE" },
    ),
  signOut: () => req<{ ok: boolean }>("/admin/logout", { method: "DELETE" }),
};
