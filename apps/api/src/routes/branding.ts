import { Hono } from "hono";
import { getBrand } from "../branding.js";

export const brandingRoutes = new Hono();

/**
 * GET /api/branding — the effective brand. Public: the web app renders it
 * server-side on every page, and none of it is secret.
 */
brandingRoutes.get("/branding", async (c) => c.json({ brand: await getBrand() }));
