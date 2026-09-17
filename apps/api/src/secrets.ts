import { randomBytes } from "node:crypto";

/**
 * Random strings for secrets a human will copy, paste and eyeball.
 *
 * Not base64url: its alphabet contains `-` and `_`, so a key can come out as
 * `fk__x9…` — which reads like a typo, and a mis-copied separator fails with
 * nothing more helpful than "invalid key". Letters and digits only.
 */
const ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

// 62 doesn't divide 256, so bytes ≥ 248 would bias the low letters. Draw again
// instead — cheap, and keeps every character equally likely.
const CEILING = 256 - (256 % ALPHABET.length);

/** `length` characters of [a-zA-Z0-9]; ~5.95 bits of entropy each. */
export function randomToken(length = 32): string {
  let out = "";
  while (out.length < length) {
    for (const byte of randomBytes(length)) {
      if (byte >= CEILING) continue;
      out += ALPHABET[byte % ALPHABET.length];
      if (out.length === length) break;
    }
  }
  return out;
}
