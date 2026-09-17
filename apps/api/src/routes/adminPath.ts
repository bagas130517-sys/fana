import { Hono } from "hono";
import { matchesAdminPath } from "../adminPath.js";

export const adminPathRoutes = new Hono();

/**
 * GET /api/admin-path/check?path=xyz — is this segment the dashboard?
 *
 * Answers yes/no for a path the caller already has, and never hands the path
 * out, so guessing here costs exactly what guessing the URL costs. The web app
 * uses it to decide whether a URL is the dashboard or a mailbox.
 */
adminPathRoutes.get("/admin-path/check", async (c) => {
  const path = c.req.query("path") ?? "";
  return c.json({ match: path.length <= 64 && (await matchesAdminPath(path)) });
});
