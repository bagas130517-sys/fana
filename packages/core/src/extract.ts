/**
 * Pull the two things anyone actually opens a temp inbox for out of a message:
 * the one-time code, and the link you're meant to click.
 *
 * Deliberately heuristic and deliberately pure — no DOM, no network, no
 * `node:crypto` — so the same function serves the API and the browser bundle.
 * It is a convenience over the message, never a replacement for it: when the
 * guess is wrong the full body is right there, so the cost of a miss is low and
 * the rules below stay simple enough to reason about.
 */

export interface Extracted {
  /** Likely one-time codes, most likely first. */
  codes: string[];
  /** Absolute http(s) links, in the order they appear, deduplicated. */
  links: string[];
}

/**
 * How many *candidates* to hand back, not how long a code may be — the length
 * limits live in the patterns below. Past a handful the list stops being "the
 * code" and starts being every number in the mail.
 */
const MAX_CODES_RETURNED = 5;
const MAX_LINKS_RETURNED = 50;

/** How far either side of a candidate a word like "code" still counts as context. */
const CONTEXT_CHARS = 48;

/**
 * Words that turn a number into a code. English plus Indonesian, since those
 * are the two languages the UI ships in — adding a language is adding words
 * here, not another mechanism.
 */
const CODE_WORDS =
  /\b(code|otp|pin|passcode|password|one[- ]time|verification|verify|verifying|confirm(?:ation)?|token|auth(?:entication)?|security|login|sign[- ]?in|kode|sandi|verifikasi|masuk)\b/gi;

/** A run of digits on its own — the overwhelmingly common shape. */
const NUMERIC = /\b\d{4,8}\b/g;

/**
 * Mixed letters and digits, upper-case, no separators: G2Q4B7, A1B2C3.
 * Requiring at least one digit keeps ordinary shouted words out.
 */
const ALPHANUMERIC = /\b(?=[A-Z0-9]*\d)[A-Z0-9]{6,10}\b/g;

const URL_IN_TEXT = /\bhttps?:\/\/[^\s<>"')\]]+/gi;
const HREF = /\bhref\s*=\s*["']([^"']+)["']/gi;

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

/**
 * Crude tag-stripping, enough to scan for codes. The HTML reaching this has
 * already been through `sanitize`, so the hostile cases are gone; script and
 * style are dropped anyway because their contents are full of digits that would
 * read as codes.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&[a-z#0-9]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? " ")
    .replace(/[^\S\n]+/g, " ");
}

/** Spans covering every URL, so digits inside a tracking link are never a code. */
function urlSpans(text: string): [number, number][] {
  const spans: [number, number][] = [];
  for (const m of text.matchAll(URL_IN_TEXT)) {
    spans.push([m.index, m.index + m[0].length]);
  }
  return spans;
}

const inside = (spans: [number, number][], at: number, end: number) =>
  spans.some(([from, to]) => at >= from && end <= to);

interface Candidate {
  value: string;
  index: number;
  /** Characters to the nearest code word; Infinity when there is none in range. */
  distance: number;
}

/**
 * How far a candidate sits from the nearest word naming it.
 *
 * A boolean "is there a keyword nearby" is not enough: in "Order 88991122
 * shipped. Your confirmation code is 445566" both numbers are near the word
 * code, and whichever tiebreak comes next picks the order number about as often
 * as the real one. Distance answers the question the reader answers by eye.
 */
function distanceToKeyword(
  keywords: [number, number][],
  start: number,
  end: number,
): number {
  let best = Infinity;
  for (const [from, to] of keywords) {
    const gap = to <= start ? start - to : from >= end ? from - end : 0;
    if (gap < best) best = gap;
  }
  return best;
}

function collect(
  text: string,
  pattern: RegExp,
  spans: [number, number][],
  keywords: [number, number][],
  out: Candidate[],
): void {
  for (const m of text.matchAll(pattern)) {
    const start = m.index;
    const end = start + m[0].length;
    if (inside(spans, start, end)) continue;

    // A digit run that is part of something longer — a phone number, an order
    // reference, a decimal — is not a code. \b already stops mid-number matches;
    // this catches the separator-joined shapes it doesn't.
    const before = text[start - 1] ?? " ";
    const after = text[end] ?? " ";
    if (/[.,:/\-+%$£€@]/.test(before) && /\d/.test(text[start - 2] ?? "")) continue;
    if (/[./\-+%]/.test(after) && /\d/.test(text[end + 1] ?? "")) continue;

    const distance = distanceToKeyword(keywords, start, end);

    // A bare year with nothing calling it a code is a copyright line.
    if (distance > CONTEXT_CHARS && /^(19|20)\d{2}$/.test(m[0])) continue;

    out.push({ value: m[0], index: start, distance });
  }
}

function findCodes(text: string): string[] {
  const spans = urlSpans(text);
  const keywords: [number, number][] = [];
  for (const m of text.matchAll(CODE_WORDS)) {
    keywords.push([m.index, m.index + m[0].length]);
  }

  const candidates: Candidate[] = [];
  collect(text, NUMERIC, spans, keywords, candidates);
  collect(text, ALPHANUMERIC, spans, keywords, candidates);

  // Closest to a word naming it wins; a longer code breaks a tie, and reading
  // order breaks that.
  candidates.sort(
    (a, b) =>
      a.distance - b.distance ||
      b.value.length - a.value.length ||
      a.index - b.index,
  );

  // Nothing was called a code, so anything here is a guess about loose digits.
  // Better to return none than to point at a street number.
  if (!candidates.some((c) => c.distance <= CONTEXT_CHARS)) return [];

  const seen = new Set<string>();
  const codes: string[] = [];
  for (const c of candidates) {
    if (seen.has(c.value)) continue;
    seen.add(c.value);
    codes.push(c.value);
    if (codes.length === MAX_CODES_RETURNED) break;
  }
  return codes;
}

function findLinks(html: string | null, text: string | null): string[] {
  const seen = new Set<string>();
  const links: string[] = [];

  const add = (raw: string) => {
    // Text URLs swallow the punctuation that ended the sentence.
    const url = raw.replace(/[.,;:!?)\]}'"]+$/, "");
    if (!/^https?:\/\//i.test(url) || seen.has(url)) return;
    seen.add(url);
    if (links.length < MAX_LINKS_RETURNED) links.push(url);
  };

  // Anchors first and in document order: that is the order a reader sees them.
  if (html) {
    for (const m of html.matchAll(HREF)) {
      add(htmlToText(m[1] ?? "").trim());
    }
  }
  for (const m of (text ?? "").matchAll(URL_IN_TEXT)) add(m[0]);

  return links;
}

/**
 * Read a message for codes and links. `subject` counts as body text — plenty of
 * senders put the code there and nowhere else.
 */
export function extractFromMessage(message: {
  subject?: string | null;
  text?: string | null;
  html?: string | null;
}): Extracted {
  const body = message.text?.trim()
    ? message.text
    : message.html
      ? htmlToText(message.html)
      : "";
  const scannable = `${message.subject ?? ""}\n${body}`;

  return {
    codes: findCodes(scannable),
    links: findLinks(message.html ?? null, message.text ?? null),
  };
}
