import { Hono } from "hono";
import { listPlans } from "../keys/keys.js";

export const planRoutes = new Hono();

/**
 * GET /api/plans — what this instance offers, for the docs page.
 *
 * Public and keyless on purpose: a plan's limits are what a prospective
 * customer is deciding on, and the docs have to state *this* instance's numbers
 * rather than the ones the project happened to ship with. Nothing here is
 * sensitive — it is a price list without the prices.
 *
 * Ordered by monthly quota so the page can render them cheapest-first without
 * knowing anything about how the operator named them.
 */
planRoutes.get("/plans", async (c) => {
  const rows = await listPlans();
  return c.json({
    plans: rows
      .map((p) => ({
        slug: p.slug,
        label: p.label,
        monthlyRequests: p.monthlyRequests,
        requestsPerMinute: p.requestsPerMinute,
        retentionMinutes: p.retentionMinutes,
        concurrentInboxes: p.concurrentInboxes,
      }))
      // 0 means unlimited, which sorts last rather than first.
      .sort((a, b) =>
        a.monthlyRequests === 0
          ? 1
          : b.monthlyRequests === 0
            ? -1
            : a.monthlyRequests - b.monthlyRequests,
      ),
  });
});
