import { randomBytes } from "node:crypto";

// Word lists sized so adj-noun-* formats clear ~1e9 combinations.
const ADJECTIVES = [
  "brave", "calm", "clever", "eager", "gentle", "happy", "jolly", "kind",
  "lucky", "mighty", "neat", "proud", "quick", "swift", "witty", "zesty",
  "bold", "bright", "cozy", "crisp", "dandy", "fair", "fond", "glad",
  "keen", "lush", "merry", "noble", "plush", "prime", "ripe", "sleek",
  "snug", "spry", "sunny", "tidy", "vivid", "warm", "wise", "agile",
  "breezy", "dapper", "frosty", "hardy", "mellow", "nimble", "plucky", "rustic",
];

const NOUNS = [
  "otter", "falcon", "maple", "comet", "pebble", "willow", "raven", "cobra",
  "meadow", "ember", "harbor", "cactus", "walrus", "pixel", "nebula", "quartz",
  "badger", "canyon", "cedar", "dune", "finch", "glacier", "heron", "ibis",
  "jasper", "koala", "lily", "marlin", "newt", "onyx", "panda", "quail",
  "robin", "sable", "tundra", "umbra", "vulture", "wombat", "yak", "zebra",
  "birch", "coral", "delta", "fjord", "grove", "hazel", "lotus", "mango",
];

// Base31: a-z0-9 minus visually ambiguous 0/o/1/l/i. ~4.95 bits/char.
const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";

const LOCAL_RE = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;

function pick<T>(arr: readonly T[]): T {
  return arr[randomBytes(1)[0]! % arr.length]!;
}

function randomToken(len: number): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i]! % ALPHABET.length];
  return out;
}

function randomDigits(len: number): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += String(bytes[i]! % 10);
  return out;
}

/**
 * Address-style generators, one picked at random per address for variety.
 * Each is tuned to ~1e9+ combinations so no single style is a collision floor.
 */
const FORMATS: ReadonlyArray<() => string> = [
  () => `${pick(ADJECTIVES)}-${pick(NOUNS)}-${randomDigits(6)}`, // 48·48·1e6 ≈ 2.3e9
  () => `${pick(NOUNS)}-${randomToken(5)}`, //                     48·31^5   ≈ 1.4e9
  () => randomToken(7), //                                         31^7      ≈ 2.7e10
];

/** Random local part in one of several styles, e.g. "otter-9k7hm". */
export function randomLocalPart(): string {
  return pick(FORMATS)();
}

/** Full random address on the given domain. */
export function randomAddress(domain: string): string {
  return `${randomLocalPart()}@${domain.toLowerCase()}`;
}

/** Validate a user-supplied local part (custom alias). */
export function isValidLocalPart(local: string): boolean {
  return LOCAL_RE.test(local.toLowerCase());
}

/** Normalize an address for storage / lookup (lowercase, trim). */
export function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}
