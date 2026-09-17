import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";

// bcryptjs (pure JS) over the native binding on purpose: self-hosters build on
// alpine/ARM where node-gyp is a common failure, and a login is not hot enough
// for the speed difference to matter.
const ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? "12");

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

/** Constant-time inside bcrypt; false for a malformed stored hash. */
export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash).catch(() => false);
}

/**
 * A real hash of a value nobody knows, compared against when the username
 * doesn't exist — otherwise a missing user answers noticeably faster than a
 * wrong password and the login becomes a username oracle.
 */
export const DUMMY_HASH = bcrypt.hashSync(randomBytes(24).toString("base64"), ROUNDS);
