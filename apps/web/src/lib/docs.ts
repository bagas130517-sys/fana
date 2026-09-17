/**
 * The API reference as data.
 *
 * Deliberately a list of objects rather than hand-written markup: the page
 * renders it, so adding an endpoint is adding an entry, and the day this is
 * generated from an OpenAPI document only the source of this array changes.
 *
 * Kept free of runtime values — the base URL and the served domains belong to
 * whichever instance is rendering, and are passed in at the top of the page.
 */

export type Surface = "v1" | "free";

export interface Param {
  name: string;
  type: string;
  required?: boolean;
  description: string;
}

export interface Endpoint {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  summary: string;
  description?: string;
  query?: Param[];
  body?: Param[];
}

export interface Group {
  id: string;
  title: string;
  surface: Surface;
  blurb: string;
  endpoints: Endpoint[];
}

export const GROUPS: Group[] = [
  {
    id: "inboxes",
    title: "Inboxes",
    surface: "v1",
    blurb:
      "An inbox is an address this instance will accept mail for, held for as long as your plan keeps mail. Inboxes minted here are private: only your account's keys can read what arrives.",
    endpoints: [
      {
        method: "POST",
        path: "/v1/inboxes",
        summary: "Mint an address and hold it",
        description:
          "Omit the domain and one of the served domains is picked at random, which spreads addresses across the instance instead of piling them onto the first one.",
        body: [
          {
            name: "domain",
            type: "string",
            description: "One of the served domains. Random when omitted.",
          },
          {
            name: "private",
            type: "boolean",
            description:
              "Defaults to true. Pass false for a shareable inbox that behaves like the website's.",
          },
        ],
      },
      {
        method: "GET",
        path: "/v1/inboxes",
        summary: "List the inboxes you are holding",
        description:
          "Includes how many messages are in each and how long the hold has left, plus the plan's concurrent-inbox limit.",
      },
      {
        method: "GET",
        path: "/v1/inboxes/:address/messages",
        summary: "List messages, newest first",
        query: [
          { name: "limit", type: "int", description: "1–100, default 50." },
        ],
      },
      {
        method: "GET",
        path: "/v1/inboxes/:address/wait",
        summary: "Block until a message matches",
        description:
          "Mail already in the inbox matches immediately, so a message that arrived between triggering the signup and making the call is never missed. The oldest match after `since` wins — pass the previous message's receivedAt back to walk forward without skipping.",
        query: [
          {
            name: "from",
            type: "string",
            description: "Case-insensitive substring of the sender address.",
          },
          {
            name: "subject",
            type: "string",
            description: "Case-insensitive substring of the subject.",
          },
          {
            name: "since",
            type: "ISO 8601",
            description: "Only mail received after this timestamp.",
          },
          {
            name: "timeout",
            type: "int",
            description: "Seconds to wait. Default 30, maximum 120.",
          },
        ],
      },
      {
        method: "DELETE",
        path: "/v1/inboxes/:address",
        summary: "Empty an inbox, keep the address",
        description: "For reusing one address across test runs.",
      },
      {
        method: "POST",
        path: "/v1/inboxes/:address/release",
        summary: "Give the address back",
        description:
          "Drops the hold and deletes its mail. This is what frees a concurrent-inbox slot early.",
      },
    ],
  },
  {
    id: "messages",
    title: "Messages",
    surface: "v1",
    blurb:
      "Reading one message also returns the codes and links pulled out of it. Listings don't carry that — see Extraction below.",
    endpoints: [
      {
        method: "GET",
        path: "/v1/messages/:id",
        summary: "Read a message and mark it seen",
      },
      { method: "DELETE", path: "/v1/messages/:id", summary: "Delete a message" },
    ],
  },
  {
    id: "webhooks",
    title: "Webhooks",
    surface: "v1",
    blurb:
      "Push instead of poll, for callers that cannot hold a connection open — a serverless function, a short CI step. Endpoints belong to the account, so rotating a key does not stop deliveries. Only mail your account owns is sent; a public inbox has nobody to notify.",
    endpoints: [
      { method: "GET", path: "/v1/webhooks", summary: "List your endpoints" },
      {
        method: "POST",
        path: "/v1/webhooks",
        summary: "Register an endpoint",
        body: [
          {
            name: "url",
            type: "string",
            required: true,
            description: "https, and reachable from the internet.",
          },
          { name: "label", type: "string", description: "For your own reference." },
        ],
      },
      {
        method: "PATCH",
        path: "/v1/webhooks/:id",
        summary: "Pause, resume or rename",
        description:
          "Resuming also clears the failure count, so a fixed endpoint gets a clean run.",
        body: [
          { name: "enabled", type: "boolean", description: "Pause or resume delivery." },
          { name: "label", type: "string", description: "Rename it." },
        ],
      },
      {
        method: "POST",
        path: "/v1/webhooks/:id/test",
        summary: "Send a sample event now",
        description:
          "Runs through the same signing and address checks as a real delivery and answers with what your endpoint said, so a pass means something. Not queued and not retried.",
      },
      { method: "DELETE", path: "/v1/webhooks/:id", summary: "Remove an endpoint" },
      {
        method: "GET",
        path: "/v1/webhooks/:id/deliveries",
        summary: "Recent attempts, with status codes and errors",
        query: [{ name: "limit", type: "int", description: "1–100, default 20." }],
      },
    ],
  },
  {
    id: "account",
    title: "Account",
    surface: "v1",
    blurb: "What your key is, what plan it inherits, and what is left of it.",
    endpoints: [
      {
        method: "GET",
        path: "/v1/me",
        summary: "Key, plan, quota used and inboxes held",
      },
      {
        method: "GET",
        path: "/v1/domains",
        summary: "Domains this instance accepts mail for",
      },
    ],
  },
  {
    id: "free",
    title: "The free surface",
    surface: "free",
    blurb:
      "What the website itself runs on. No key, no quota beyond a per-IP rate limit, and no privacy: every inbox here is readable by anyone who knows the address. Good for a quick look, wrong for anything you would automate.",
    endpoints: [
      {
        method: "POST",
        path: "/api/mailbox/random",
        summary: "Mint a random public address",
      },
      {
        method: "GET",
        path: "/api/mailbox/:address/messages",
        summary: "List public messages for an address",
      },
      {
        method: "GET",
        path: "/api/messages/:id",
        summary: "Read one public message",
      },
      {
        method: "GET",
        path: "/api/domains",
        summary: "Domains this instance serves",
      },
      { method: "GET", path: "/api/plans", summary: "Plans this instance offers" },
    ],
  },
];

/** Page sections, in order — the sidebar and the document share this list. */
export const SECTIONS: { id: string; title: string }[] = [
  { id: "base-url", title: "Base URL" },
  { id: "quickstart", title: "Quickstart" },
  { id: "authentication", title: "Authentication" },
  { id: "limits", title: "Limits and quota" },
  ...GROUPS.map((g) => ({ id: g.id, title: g.title })),
  { id: "signatures", title: "Verifying a webhook" },
  { id: "extraction", title: "Codes and links" },
  { id: "errors", title: "Errors" },
  { id: "domains", title: "Domains" },
];

/**
 * Domains shown inline before the list turns into a wall. Community domains are
 * self-service, so an instance can accumulate far more of them than anyone
 * wants rendered — past this the count and the endpoint say more than the names.
 */
export const DOMAINS_SHOWN = 12;

export const METHOD_TONE: Record<Endpoint["method"], string> = {
  GET: "bg-good-soft text-good",
  POST: "bg-accent-soft text-accent",
  PATCH: "bg-warn-soft text-warn",
  DELETE: "bg-danger-soft text-danger",
};

/** Plan limits as this instance has them — 0 means no ceiling. */
export interface PublicPlan {
  slug: string;
  label: string;
  monthlyRequests: number;
  requestsPerMinute: number;
  retentionMinutes: number;
  concurrentInboxes: number;
}

export function formatRetention(minutes: number): string {
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return `${days} day${days === 1 ? "" : "s"}`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  return `${minutes} min`;
}

export const formatLimit = (n: number) =>
  n === 0 ? "unlimited" : n.toLocaleString("en-US");
