import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import { normalizeAddress } from "@fana/core";
import type { EventBus } from "./events.js";

/**
 * Attach a WebSocket server at /ws. Clients connect with ?mailbox=addr and
 * receive realtime events for that mailbox, fanned out from the shared event
 * bus so events reach clients regardless of which API instance the SMTP node
 * hit. One inbox per socket: a second inbox means a second browser tab.
 */
export function attachRealtime(server: Server, bus: EventBus): () => Promise<void> {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url ?? "", "http://localhost");
    const mailbox = normalizeAddress(url.searchParams.get("mailbox") ?? "");
    // Exactly one address. A list would be accepted as a nonsense mailbox that
    // matches nothing — a socket that looks connected and never delivers.
    if (!mailbox.includes("@") || /[\s,]/.test(mailbox)) {
      ws.close(1008, "one mailbox address required");
      return;
    }

    const off = bus.on(mailbox, (event) => {
      // Anyone may open a socket for any address — that's the point of a public
      // inbox — so mail belonging to a private one must never leave here.
      if (event.type === "message:new" && event.private) return;
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(event));
    });

    ws.on("close", off);
    ws.on("error", () => ws.close());

    ws.send(JSON.stringify({ type: "connected", mailbox }));
  });

  return async () => {
    for (const ws of wss.clients) ws.terminate();
    wss.close();
  };
}
