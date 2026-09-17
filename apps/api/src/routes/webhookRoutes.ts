import { Hono, type Context } from "hono";
import {
  createWebhook,
  deleteWebhook,
  listDeliveries,
  listWebhooks,
  testWebhook,
  updateWebhook,
} from "../webhooks/webhooks.js";
import { pageParams } from "../pagination.js";

/**
 * Endpoint management, mounted twice: under `/v1` with a key and under
 * `/api/account` with a session. Same routes, same module — the customer who
 * registers an endpoint from a script and the one who does it in the dashboard
 * must see the same thing.
 *
 * The caller's account id is resolved by whichever guard is in front, so this
 * takes it as a function rather than reaching for one of them.
 */
export function webhookRoutes(owner: (c: Context) => number) {
  const routes = new Hono();

  routes.get("/webhooks", async (c) =>
    c.json({ webhooks: await listWebhooks(owner(c)) }),
  );

  routes.post("/webhooks", async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      url?: string;
      label?: string;
    } | null;
    const result = await createWebhook(owner(c), body ?? {});
    if ("error" in result) return c.json({ error: result.error }, 400);
    return c.json({ webhook: result.webhook }, 201);
  });

  /** PATCH — re-enable one the deliverer switched off, or rename it. */
  routes.patch("/webhooks/:id", async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      enabled?: boolean;
      label?: string;
    } | null;
    const row = await updateWebhook(owner(c), c.req.param("id"), body ?? {});
    return row ? c.json({ webhook: row }) : c.json({ error: "Not found" }, 404);
  });

  routes.delete("/webhooks/:id", async (c) => {
    const gone = await deleteWebhook(owner(c), c.req.param("id"));
    return gone ? c.json({ ok: true }) : c.json({ error: "Not found" }, 404);
  });

  /**
   * POST /webhooks/:id/test — send a sample event now and report the answer.
   * Runs through the same signing and address checks as a real delivery, so a
   * pass says something about real deliveries.
   */
  routes.post("/webhooks/:id/test", async (c) => {
    const result = await testWebhook(owner(c), c.req.param("id"));
    if (!result) return c.json({ error: "Not found" }, 404);
    return c.json(result, result.ok ? 200 : 502);
  });

  /** The answer to "why didn't it arrive?" — attempts, status codes, errors. */
  routes.get("/webhooks/:id/deliveries", async (c) => {
    const result = await listDeliveries(owner(c), c.req.param("id"), pageParams(c.req.query()));
    if (!result) return c.json({ error: "Not found" }, 404);
    const { rows, ...meta } = result;
    return c.json({ deliveries: rows, ...meta });
  });

  return routes;
}
