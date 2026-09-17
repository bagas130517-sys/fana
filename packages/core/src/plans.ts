/**
 * Shape and validation for API plans. The plans themselves live in the DB and
 * are edited in /admin — an instance starts with a single free plan and only
 * grows paid ones when there's a reason to. Core owns the *rules* (what a plan
 * consists of, what a valid number is), never the price list.
 */

import { z } from "zod";

export const planLimitsSchema = z.object({
  /** Requests per calendar month. 0 = unlimited. */
  monthlyRequests: z.number().int().min(0).max(100_000_000),
  /** Burst ceiling, requests per minute. 0 = unlimited. */
  requestsPerMinute: z.number().int().min(0).max(100_000),
  /** How long this plan's messages are kept — the real cost driver. */
  retentionMinutes: z.number().int().min(1).max(365 * 24 * 60),
  /** Inboxes an account may hold reserved at once. 0 = unlimited. */
  concurrentInboxes: z.number().int().min(0).max(100_000),
});

export type PlanLimits = z.infer<typeof planLimitsSchema>;

export const planSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(32)
  .regex(/^[a-z0-9][a-z0-9-]*$/, "Use letters, digits and dashes");

export const planInputSchema = planLimitsSchema.extend({
  slug: planSlugSchema,
  label: z.string().trim().min(1).max(64),
});

export type PlanInput = z.infer<typeof planInputSchema>;

/** Seeded on first boot so an instance is usable before anyone edits anything. */
export const DEFAULT_PLAN: PlanInput = {
  slug: "free",
  label: "Free",
  monthlyRequests: 1_000,
  requestsPerMinute: 30,
  retentionMinutes: 60,
  concurrentInboxes: 3,
};

/** Usage is counted per calendar month in UTC, so a billing period is unambiguous. */
export function usagePeriod(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7); // YYYY-MM
}

/** 0 means "no ceiling" for every quota field. */
export function withinLimit(used: number, limit: number): boolean {
  return limit === 0 || used < limit;
}
