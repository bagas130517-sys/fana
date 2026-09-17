import assert from "node:assert/strict";
import test from "node:test";
import type { RealtimeEvent } from "@fana/core";
import { waitFor, type EventBus, type EventListener } from "./events.js";

/**
 * `waitFor` is the whole of the long-poll, and its failure mode is silence: a
 * broken probe or a missed wake-up both look like "no mail arrived". Worth
 * testing directly — it needs neither Redis nor a database, only the bus shape.
 */

/** A bus that never talks to Redis; `emit` stands in for a message arriving. */
function fakeBus() {
  const rooms = new Map<string, Set<EventListener>>();
  const all = new Set<EventListener>();
  const bus: EventBus = {
    on(mailbox, listener) {
      const room = rooms.get(mailbox) ?? new Set<EventListener>();
      rooms.set(mailbox, room);
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
    close: () => Promise.resolve(),
  };
  const event: RealtimeEvent = { type: "mailbox:purged", mailbox: "a@b.test" };
  return {
    bus,
    listeners: (mailbox: string) => rooms.get(mailbox)?.size ?? 0,
    anyListeners: () => all.size,
    emit: (mailbox: string) => {
      const e = { ...event, mailbox };
      for (const l of [...all, ...(rooms.get(mailbox) ?? [])]) l(e);
    },
  };
}

const MB = "a@b.test";

test("returns what is already there without waiting for an event", async () => {
  const { bus } = fakeBus();
  assert.equal(await waitFor(bus, MB, () => Promise.resolve("found"), 5_000), "found");
});

test("resolves once an event makes the probe succeed", async () => {
  const { bus, emit } = fakeBus();
  let arrived = false;

  const pending = waitFor(bus, MB, () => Promise.resolve(arrived ? "mail" : null), 5_000);
  arrived = true;
  emit(MB);

  assert.equal(await pending, "mail");
});

test("ignores events for other mailboxes", async () => {
  const { bus, emit } = fakeBus();
  let probes = 0;

  const pending = waitFor(
    bus,
    MB,
    () => {
      probes++;
      return Promise.resolve(null);
    },
    60,
  );
  emit("someone-else@b.test");

  assert.equal(await pending, null);
  assert.equal(probes, 1, "only the initial probe should have run");
});

test("resolves null when the timeout passes", async () => {
  const { bus } = fakeBus();
  assert.equal(await waitFor(bus, MB, () => Promise.resolve(null), 30), null);
});

test("rejects when the first probe throws, rather than idling until timeout", async () => {
  const { bus } = fakeBus();
  await assert.rejects(
    waitFor(bus, MB, () => Promise.reject(new Error("bad query")), 5_000),
    /bad query/,
  );
});

test("keeps waiting when a later probe throws", async () => {
  const { bus, emit } = fakeBus();
  let call = 0;
  const probe = () => {
    call++;
    if (call === 2) return Promise.reject(new Error("blip"));
    return Promise.resolve(call >= 3 ? "mail" : null);
  };

  const pending = waitFor(bus, MB, probe, 5_000);
  emit(MB); // throws, must not settle
  emit(MB); // succeeds

  assert.equal(await pending, "mail");
});

test("unsubscribes however it settles", async () => {
  const { bus, listeners, emit } = fakeBus();

  await waitFor(bus, MB, () => Promise.resolve(null), 20);
  assert.equal(listeners(MB), 0, "timeout should unsubscribe");

  const pending = waitFor(bus, MB, () => Promise.resolve("mail"), 5_000);
  emit(MB);
  await pending;
  assert.equal(listeners(MB), 0, "a match should unsubscribe");
});

test("gives up when the caller disconnects", async () => {
  const { bus, listeners } = fakeBus();
  const controller = new AbortController();

  const pending = waitFor(
    bus,
    MB,
    () => Promise.resolve(null),
    60_000,
    controller.signal,
  );
  controller.abort();

  assert.equal(await pending, null);
  assert.equal(listeners(MB), 0);
});
