import type { Message } from "@fana/core";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export interface Minted {
  address: string;
  token: string;
}

export interface ServedDomain {
  domain: string;
  builtin: boolean;
  /** ISO timestamp the domain was verified; null for built-ins. */
  activeSince: string | null;
}

export interface DomainResult {
  domain: string;
  verified: boolean;
  mxHost: string | null;
  steps: string[];
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export const api = {
  baseUrl: API_URL,

  async domains(): Promise<string[]> {
    return (await this.domainDetails()).map((d) => d.domain);
  },

  /** Served domains with how long each has been accepting mail. */
  async domainDetails(): Promise<ServedDomain[]> {
    const data = await json<{ domains: string[]; details?: ServedDomain[] }>(
      await fetch(`${API_URL}/api/domains`),
    );
    return (
      data.details ??
      data.domains.map((domain) => ({ domain, builtin: true, activeSince: null }))
    );
  },

  /** Register a community domain. Throws with the server message on 400/409. */
  async addDomain(domain: string): Promise<DomainResult> {
    const res = await fetch(`${API_URL}/api/domains`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ domain }),
    });
    const data = (await res.json().catch(() => ({}))) as DomainResult & { error?: string };
    if (!res.ok) throw new Error(data.error ?? "Could not add domain");
    return data;
  },

  /** Re-check a pending domain's MX record. */
  async verifyDomain(domain: string): Promise<DomainResult> {
    const res = await fetch(
      `${API_URL}/api/domains/${encodeURIComponent(domain)}/verify`,
      { method: "POST" },
    );
    const data = (await res.json().catch(() => ({}))) as DomainResult & { error?: string };
    if (!res.ok) throw new Error(data.error ?? "Could not verify domain");
    return data;
  },

  /** Mint + reserve a random address (optionally on a specific served domain). */
  async mint(domain?: string): Promise<Minted> {
    const qs = new URLSearchParams();
    if (domain) qs.set("domain", domain);
    const res = await fetch(`${API_URL}/api/mailbox/random?${qs}`, { method: "POST" });
    return json<Minted>(res);
  },

  /** Renew/reclaim a reservation on return. `taken` means someone else holds it. */
  async claim(address: string, token: string): Promise<{ ok: boolean; taken?: boolean }> {
    const res = await fetch(`${API_URL}/api/mailbox/claim`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address, token }),
    });
    return json<{ ok: boolean; taken?: boolean }>(res);
  },

  async messages(address: string): Promise<Message[]> {
    const data = await json<{ messages: Message[] }>(
      await fetch(`${API_URL}/api/mailbox/${encodeURIComponent(address)}/messages`),
    );
    return data.messages;
  },

  async message(id: string): Promise<Message> {
    const data = await json<{ message: Message }>(
      await fetch(`${API_URL}/api/messages/${id}`),
    );
    return data.message;
  },

  async deleteMessage(id: string): Promise<void> {
    await fetch(`${API_URL}/api/messages/${id}`, { method: "DELETE" });
  },

  async purge(address: string): Promise<void> {
    await fetch(`${API_URL}/api/mailbox/${encodeURIComponent(address)}`, {
      method: "DELETE",
    });
  },

  async markAllRead(address: string): Promise<void> {
    await fetch(`${API_URL}/api/mailbox/${encodeURIComponent(address)}/read`, {
      method: "POST",
    });
  },

  attachmentUrl(messageId: string, attId: string): string {
    return `${API_URL}/api/messages/${messageId}/attachments/${attId}`;
  },

  wsUrl(address: string): string {
    const base = API_URL.replace(/^http/, "ws");
    return `${base}/ws?mailbox=${encodeURIComponent(address)}`;
  },
};
