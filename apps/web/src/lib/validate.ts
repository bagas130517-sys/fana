// Client-side mirror of core's local-part rule (can't import core here — it
// would pull node:crypto into the browser bundle).
const LOCAL_RE = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;

export function isValidLocalPart(local: string): boolean {
  return LOCAL_RE.test(local.trim().toLowerCase());
}
