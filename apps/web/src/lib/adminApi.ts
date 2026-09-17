import type { Brand, BrandOverrides } from "@fana/core/brand";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
// Holds a session token, never the password and never the API key. Shared with
// the customer dashboard: one signed-in user, one session, either area.
const TOKEN_KEY = "fana:session";

export interface AdminStats {
  messages: number;
  attachments: number;
  storageBytes: number;
  reservations: number;
  activeMailboxes: number;
  expiredPending: number;
  unseen: number;
  last24h: number;
  verdicts: { verified: number; unverified: number; suspicious: number };
  topMailboxes: { mailbox: string; count: number }[];
  domains: { builtin: number; communityVerified: number; communityPending: number };
}

export interface ActivityPoint {
  hour: string;
  count: number;
}

export interface CommunityDomain {
  domain: string;
  verified: boolean;
  createdAt: string;
  verifiedAt: string | null;
}

export interface AdminDomains {
  builtin: string[];
  community: CommunityDomain[];
}

export interface AdminConfig {
  mailDomains: string[];
  messageTtlMinutes: number;
  reservationTtlMinutes: number;
  storageDriver: string;
  domainVerify: string;
  mxHost: string | null;
  rateLimit: { max: number; windowSeconds: number };
  smtpRateLimit: { max: number; windowSeconds: number };
}

export interface AdminBranding {
  overrides: BrandOverrides;
  brand: Brand;
}

export interface AdminHealth {
  db: boolean;
  redis: boolean;
}

export interface AdminAccount {
  id: string;
  username: string;
  createdAt: string;
  lastLoginAt: string | null;
  isSelf: boolean;
}

export interface Plan {
  slug: string;
  label: string;
  monthlyRequests: number;
  requestsPerMinute: number;
  retentionMinutes: number;
  concurrentInboxes: number;
}

export interface CustomerSummary {
  id: string;
  username: string;
  email: string | null;
  name: string | null;
  role: string;
  plan: string;
  planLabel: string;
  monthlyRequests: number;
  keys: number;
  usage: number;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface ApiKeySummary {
  id: string;
  label: string;
  owner: string;
  ownerId: string;
  email: string | null;
  prefix: string;
  plan: string;
  monthlyRequests: number;
  usage: number;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface ApiTokenInfo {
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface LoginResult {
  token: string;
  expiresAt: string;
  admin: { username: string; publicId: string };
}

/** Thrown by the API client so callers can react to lockout vs. bad password. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface AdminMessage {
  id: string;
  mailbox: string;
  fromAddress: string;
  fromName: string | null;
  subject: string;
  verdict: "verified" | "unverified" | "suspicious";
  seen: boolean;
  /** Belongs to a customer's private /v1 inbox — listed, never opened here. */
  private: boolean;
  receivedAt: string;
}

/** What a paged endpoint adds alongside its rows. */
export interface PageMeta {
  page: number;
  perPage: number;
  total: number;
  pages: number;
}

/** `?page=` / `?perPage=` as a query string, empty when unpaged. */
export const pageQuery = (page?: number, perPage?: number) =>
  page === undefined ? "" : `page=${page}${perPage ? `&perPage=${perPage}` : ""}`;

export interface AbuseData {
  topSenders: { ip: string; count: number }[];
  blocked: string[];
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    ...init,
    headers: { ...init.headers, authorization: `Bearer ${getToken() ?? ""}` },
  });

  if (!res.ok) {
    // Surface the API's own message (a rejected colour, a lockout) when it sends one.
    const body = ((await res.json().catch(() => null)) ?? {}) as {
      error?: string;
    } & Record<string, unknown>;

    // An expired or revoked session: drop it so the app falls back to sign-in.
    // The login route reports bad credentials the same way, so leave it alone.
    if (res.status === 401 && !path.startsWith("/admin/login")) {
      clearToken();
      onSignedOut?.();
    }
    throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status, body);
  }
  return res.json() as Promise<T>;
}

/** Set by the dashboard so an expired session sends it back to the login screen. */
let onSignedOut: (() => void) | undefined;
export function setSignedOutHandler(fn: (() => void) | undefined): void {
  onSignedOut = fn;
}

export const adminApi = {
  /** Exchange credentials for a session token and remember it. */
  async login(username: string, password: string): Promise<LoginResult> {
    const result = await req<LoginResult>("/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    localStorage.setItem(TOKEN_KEY, result.token);
    return result;
  },

  /** Revoke the session server-side, then forget it locally. */
  async logout(): Promise<void> {
    try {
      await req("/admin/logout", { method: "DELETE" });
    } finally {
      clearToken();
    }
  },

  session: () =>
    req<{ kind: "session" | "apiToken"; username?: string; expiresAt?: string }>(
      "/admin/session",
    ),
  admins: () => req<{ admins: AdminAccount[] }>("/admin/admins"),
  createAdmin: (username: string, password: string) =>
    req<{ id: string; username: string }>("/admin/admins", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    }),
  deleteAdmin: (id: string) =>
    req<{ ok: boolean }>(`/admin/admins/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  resetAdminPassword: (id: string, password: string) =>
    req<{ ok: boolean }>(`/admin/admins/${encodeURIComponent(id)}/password`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    }),
  changeOwnPassword: (currentPassword: string, newPassword: string) =>
    req<{ ok: boolean }>("/admin/account/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  plans: () => req<{ plans: Plan[] }>("/admin/plans"),
  createPlan: (plan: Plan) =>
    req<{ plan: string }>("/admin/plans", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(plan),
    }),
  updatePlan: (slug: string, plan: Partial<Plan>) =>
    req<{ ok: boolean }>(`/admin/plans/${encodeURIComponent(slug)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(plan),
    }),
  deletePlan: (slug: string) =>
    req<{ ok: boolean }>(`/admin/plans/${encodeURIComponent(slug)}`, { method: "DELETE" }),

  customers: (page = 1) =>
    req<{ users: CustomerSummary[] } & PageMeta>(`/admin/users?${pageQuery(page)}`),
  apiKeys: () => req<{ keys: ApiKeySummary[] }>("/admin/keys"),
  /** Omit `user` to issue the key to yourself — for testing the API. */
  createApiKey: (input: { label: string; user?: string }) =>
    req<{ key: string; id: string; prefix: string }>("/admin/keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  /** Plans belong to the account, so this moves the customer, not one key. */
  moveUserPlan: (userId: string, plan: string) =>
    req<{ ok: boolean }>(`/admin/users/${encodeURIComponent(userId)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan }),
    }),
  revokeApiKey: (id: string) =>
    req<{ ok: boolean }>(`/admin/keys/${encodeURIComponent(id)}`, { method: "DELETE" }),

  adminPath: () => req<{ path: string; default: string }>("/admin/admin-path"),
  saveAdminPath: (path: string) =>
    req<{ path: string }>("/admin/admin-path", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path }),
    }),
  apiToken: () => req<{ token: ApiTokenInfo | null }>("/admin/api-token"),
  regenerateApiToken: () =>
    req<{ token: string; info: ApiTokenInfo }>("/admin/api-token", { method: "POST" }),
  stats: () => req<AdminStats>("/admin/stats"),
  activity: () => req<{ activity: ActivityPoint[] }>("/admin/activity"),
  domains: (page = 1) => req<AdminDomains & PageMeta>(`/admin/domains?${pageQuery(page)}`),
  config: () => req<AdminConfig>("/admin/config"),
  branding: () => req<AdminBranding>("/admin/branding"),
  saveBranding: (overrides: BrandOverrides) =>
    req<AdminBranding>("/admin/branding", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(overrides),
    }),
  resetBranding: () => req<AdminBranding>("/admin/branding", { method: "DELETE" }),
  health: () => req<AdminHealth>("/admin/health"),
  verifyDomain: (d: string) =>
    req<{ domain: string; verified: boolean }>(
      `/admin/domains/${encodeURIComponent(d)}/verify`,
      { method: "POST" },
    ),
  revokeDomain: (d: string) =>
    req<{ ok: boolean }>(`/admin/domains/${encodeURIComponent(d)}`, {
      method: "DELETE",
    }),
  purgeMailbox: (a: string) =>
    req<{ ok: boolean; deleted: number }>(
      `/admin/mailbox/${encodeURIComponent(a)}`,
      { method: "DELETE" },
    ),
  purgeExpired: () => req<{ ok: boolean; deleted: number }>("/admin/purge-expired", { method: "POST" }),
  purgeAll: () =>
    req<{ ok: boolean; deleted: number }>("/admin/purge-all", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirm: "purge-all" }),
    }),
  releaseReservations: () =>
    req<{ ok: boolean; released: number }>("/admin/release-reservations", {
      method: "POST",
    }),
  recheckDomains: () =>
    req<{ ok: boolean; checked: number; verified: number }>("/admin/recheck-domains", {
      method: "POST",
    }),
  resetRateLimits: () =>
    req<{ ok: boolean; cleared: number }>("/admin/reset-rate-limits", { method: "POST" }),
  revokeAllSessions: () =>
    req<{ ok: boolean; admins: number }>("/admin/sessions/revoke-all", { method: "POST" }),
  messages: (mailbox?: string, page = 1) =>
    req<{ messages: AdminMessage[] } & PageMeta>(
      `/admin/messages?${pageQuery(page)}${mailbox ? `&mailbox=${encodeURIComponent(mailbox)}` : ""}`,
    ),
  abuse: () => req<AbuseData>("/admin/abuse"),
  blockIp: (ip: string) =>
    req<{ ok: boolean }>("/admin/block", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ip }),
    }),
  unblockIp: (ip: string) =>
    req<{ ok: boolean }>(`/admin/block/${encodeURIComponent(ip)}`, { method: "DELETE" }),
  addDomain: (domain: string) =>
    req<{ domain: string; verified: boolean }>("/admin/domains", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ domain }),
    }),
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
