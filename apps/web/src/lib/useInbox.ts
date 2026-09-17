"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Message, RealtimeEvent } from "@fana/core";
import { api, type ServedDomain } from "./api";
import { resolveSlug } from "./resolve";

/**
 * Inbox state is stored **per browser tab** (sessionStorage), which is how you
 * hold several at once: tab 1 on one address, tab 2 on another, neither
 * touching the other. localStorage keeps a copy purely as the "what was I using
 * last?" answer for a tab opened later — writing it can never disturb a tab
 * that's already open, because open tabs read their own session copy.
 */
const ADDRESS_KEY = "fana:address";
const TOKEN_KEY = "fana:token";

interface Inbox {
  address: string | null;
  domains: string[];
  domainDetails: ServedDomain[];
  messages: Message[];
  connected: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  refreshDomains: () => Promise<void>;
  /** Mint a fresh random address — random domain too, unless one is given. */
  regenerate: (domain?: string) => Promise<void>;
  /** Switch to an explicit, public address (no reservation). */
  useAddress: (local: string, domain: string) => void;
  openMessage: (id: string) => Promise<Message | null>;
  deleteMessage: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  purge: () => Promise<void>;
}

/** Reflect the current address in the URL so the inbox is shareable/bookmarkable. */
function syncUrl(address: string) {
  window.history.replaceState(null, "", `/${address}`);
}

/** This tab's inbox, falling back to the last one used in this browser. */
function readStored(): { address: string | null; token: string | null } {
  const address =
    sessionStorage.getItem(ADDRESS_KEY) ?? localStorage.getItem(ADDRESS_KEY);
  const token = sessionStorage.getItem(ADDRESS_KEY)
    ? sessionStorage.getItem(TOKEN_KEY)
    : localStorage.getItem(TOKEN_KEY);
  return { address, token };
}

function store(address: string, token: string | null) {
  sessionStorage.setItem(ADDRESS_KEY, address);
  localStorage.setItem(ADDRESS_KEY, address);
  if (token) {
    sessionStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
  }
}

export function useInbox(slug: string[]): Inbox {
  const [address, setAddress] = useState<string | null>(null);
  const [domainDetails, setDomainDetails] = useState<ServedDomain[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const tokenRef = useRef<string | null>(null);

  const adopt = useCallback((addr: string, token: string | null) => {
    tokenRef.current = token;
    store(addr, token);
    setMessages([]);
    setAddress(addr);
    syncUrl(addr);
  }, []);

  // Resolve the initial address from the URL, saved state, or a fresh mint.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const details = await api.domainDetails();
      if (cancelled) return;
      setDomainDetails(details);
      const list = details.map((d) => d.domain);

      const resolved = resolveSlug(slug, list);
      if (resolved.kind === "address") {
        adopt(resolved.address, null);
        return;
      }
      if (resolved.kind === "randomOn") {
        const m = await api.mint(resolved.domain);
        if (!cancelled) adopt(m.address, m.token);
        return;
      }

      // Root: keep using this tab's address, renewing the reservation we hold.
      const saved = readStored();
      if (saved.address && saved.token) {
        const res = await api
          .claim(saved.address, saved.token)
          .catch(() => ({ ok: false }));
        if (cancelled) return;
        if (res.ok) {
          adopt(saved.address, saved.token);
          return;
        }
      } else if (saved.address) {
        adopt(saved.address, null);
        return;
      }

      const m = await api.mint();
      if (!cancelled) adopt(m.address, m.token);
    })().catch(console.error);
    return () => {
      cancelled = true;
    };
    // Resolve once on mount; later address changes are driven by user actions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    try {
      setMessages(await api.messages(address));
    } finally {
      setLoading(false);
    }
  }, [address]);

  // Load messages + open realtime socket whenever the address changes.
  useEffect(() => {
    if (!address) return;
    void refresh();

    const ws = new WebSocket(api.wsUrl(address));
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (evt) => {
      const data = JSON.parse(evt.data as string) as RealtimeEvent | { type: "connected" };
      if (data.type === "message:new") {
        setMessages((prev) =>
          prev.some((m) => m.id === data.message.id) ? prev : [data.message, ...prev],
        );
      } else if (data.type === "message:deleted") {
        setMessages((prev) => prev.filter((m) => m.id !== data.id));
      } else if (data.type === "mailbox:purged") {
        setMessages([]);
      }
    };

    return () => ws.close();
  }, [address, refresh]);

  const refreshDomains = useCallback(async () => {
    setDomainDetails(await api.domainDetails());
  }, []);

  const regenerate = useCallback(
    async (domain?: string) => {
      // No domain given: the API picks one at random from everything it serves.
      const m = await api.mint(domain);
      adopt(m.address, m.token);
    },
    [adopt],
  );

  const useAddress = useCallback(
    (local: string, domain: string) => {
      adopt(`${local.toLowerCase()}@${domain}`, null);
    },
    [adopt],
  );

  const openMessage = useCallback(async (id: string) => {
    const full = await api.message(id); // marks seen server-side
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, seen: true } : m)));
    return full;
  }, []);

  const deleteMessage = useCallback(async (id: string) => {
    await api.deleteMessage(id);
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const markAllRead = useCallback(async () => {
    if (!address) return;
    await api.markAllRead(address);
    setMessages((prev) => prev.map((m) => ({ ...m, seen: true })));
  }, [address]);

  const purge = useCallback(async () => {
    if (!address) return;
    await api.purge(address);
    setMessages([]);
  }, [address]);

  return {
    address,
    domains: domainDetails.map((d) => d.domain),
    domainDetails,
    messages,
    connected,
    loading,
    refresh,
    refreshDomains,
    regenerate,
    useAddress,
    openMessage,
    deleteMessage,
    markAllRead,
    purge,
  };
}
