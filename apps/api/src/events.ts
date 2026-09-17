import Redis from "ioredis";
import type { RealtimeEvent } from "@fana/core";

/**
 * One Redis subscription for the whole process, fanned out in memory.
 *
 * The WebSocket server used to own the only subscriber. Long-polling `/v1` needs
 * the same stream, and a second connection per waiting request would be a
 * connection per waiting request — so the subscription moved here and both
 * callers register listeners against it.
 */

export const REALTIME_CHANNEL = "fana:events";

/** Consecutive failed probes before a waiter stops retrying and just listens. */
const MAX_PROBE_RETRIES = 2;

export type EventListener = (event: RealtimeEvent) => void;

export interface EventBus {
  /** Listen for events addressed to `mailbox`. Returns an unsubscribe function. */
  on(mailbox: string, listener: EventListener): () => void;
  /**
   * Listen for every event, whatever the mailbox. For consumers that react to
   * mail nobody asked for by address — webhook delivery has to know an inbox
   * exists before it can care about it.
   */
  onAny(listener: EventListener): () => void;
  close(): Promise<void>;
}

export function createEventBus(redisUrl: string): EventBus {
  const sub = new Redis(redisUrl);
  const rooms = new Map<string, Set<EventListener>>();
  const all = new Set<EventListener>();

  void sub.subscribe(REALTIME_CHANNEL);
  sub.on("message", (_channel, payload) => {
    let event: RealtimeEvent;
    try {
      event = JSON.parse(payload) as RealtimeEvent;
    } catch {
      return;
    }
    // Copied before iterating: a listener that unsubscribes itself (every
    // long-poll does, on its first match) would otherwise mutate the live set.
    const listeners = [...all, ...(rooms.get(event.mailbox) ?? [])];
    for (const listener of listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("[events] listener failed:", err);
      }
    }
  });

  return {
    on(mailbox, listener) {
      let room = rooms.get(mailbox);
      if (!room) {
        room = new Set();
        rooms.set(mailbox, room);
      }
      room.add(listener);
      return () => {
        room.delete(listener);
        if (room.size === 0) rooms.delete(mailbox);
      };
    },
    onAny(listener) {
      all.add(listener);
      return () => all.delete(listener);
    },
    async close() {
      rooms.clear();
      all.clear();
      await sub.quit();
    },
  };
}

/**
 * Resolve with the first non-null `probe()` result, re-probing whenever an event
 * arrives for `mailbox`; null when `timeoutMs` passes or the caller goes away.
 *
 * The event is only a wake-up — the answer always comes from `probe`, so a
 * caller never has to trust a payload that crossed a pub/sub channel to decide
 * what it is allowed to see.
 *
 * A failing *first* probe rejects: a query that cannot run is a bug, and
 * swallowing it would report "no mail arrived" for the full timeout while the
 * inbox was never actually looked at. Later probes only log — by then the
 * caller is waiting on real events and one bad round should not end the wait.
 */
export function waitFor<T>(
  bus: EventBus,
  mailbox: string,
  probe: () => Promise<T | null | undefined>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<T | null> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let running = false;
    /** An event arrived that no completed probe has accounted for yet. */
    let pending = false;
    let failures = 0;
    let off: () => void = () => {};

    const done = () => {
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      off();
    };
    const finish = (value: T | null) => {
      if (settled) return;
      done();
      resolve(value);
    };
    const fail = (err: unknown) => {
      if (settled) return;
      done();
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    const onAbort = () => finish(null);
    const timer = setTimeout(() => finish(null), timeoutMs);

    const tick = async (first = false) => {
      if (settled) return;
      // Mail can arrive while a probe is in flight; remember it and re-run once
      // rather than firing overlapping queries at the database.
      if (running) {
        pending = true;
        return;
      }
      running = true;
      // This run answers for every event seen so far — unless it fails, in
      // which case they are still unanswered and the flag goes back up.
      pending = false;
      try {
        const value = await probe();
        if (value !== null && value !== undefined) return finish(value);
        failures = 0;
      } catch (err) {
        if (first) return fail(err);
        console.error("[events] probe failed:", err);
        // Retry the wake-ups this run was meant to answer, but only so far: a
        // probe that keeps failing must not turn into a loop hammering the
        // database until the timeout.
        if (++failures <= MAX_PROBE_RETRIES) pending = true;
      } finally {
        running = false;
      }
      if (pending && !settled) void tick();
    };

    // Listener first, then probe: a message landing between the two wakes the
    // waiter, whereas probing first would let it fall into the gap and time out.
    off = bus.on(mailbox, () => void tick());
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) return onAbort();
    void tick(true);
  });
}
