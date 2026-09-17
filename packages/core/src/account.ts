/**
 * Rules for dashboard accounts. Kept in core (not in a route handler) so the
 * API and the web form reject the same things with the same wording.
 */

import { z } from "zod";

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 32;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;

/** Lowercase; letters, digits, dot, dash, underscore. No spaces, no @. */
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(USERNAME_MIN, `Username must be at least ${USERNAME_MIN} characters`)
  .max(USERNAME_MAX, `Username must be at most ${USERNAME_MAX} characters`)
  .regex(
    /^[a-z0-9][a-z0-9._-]*$/,
    "Username can use letters, digits, dot, dash and underscore",
  );

/**
 * Length over composition rules: a long passphrase beats "must contain a
 * symbol", and this is a single-operator login behind a lockout, not a
 * consumer signup.
 */
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters`)
  .max(PASSWORD_MAX, `Password must be at most ${PASSWORD_MAX} characters`);

export const credentialsSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1, "Password is required"),
});

export type Credentials = z.infer<typeof credentialsSchema>;

export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase();
}

/** First validation message, for APIs that report one error at a time. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid input";
}
