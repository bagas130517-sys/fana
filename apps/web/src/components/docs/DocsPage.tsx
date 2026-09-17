import { ArrowRight, Terminal } from "lucide-react";
import { REPO_URL } from "@fana/core/brand";
import {
  DOMAINS_SHOWN,
  GROUPS,
  METHOD_TONE,
  SECTIONS,
  formatLimit,
  formatRetention,
  type Endpoint,
  type Param,
  type PublicPlan,
} from "@/lib/docs";
import { AccountLink } from "@/components/AccountLink";
import { Badge } from "@/components/ui/Badge";
import { CodeBlock } from "./CodeBlock";
import { TableOfContents } from "./TableOfContents";

/**
 * The API reference, rendered by the instance that serves the API.
 *
 * That is the whole reason it lives in the app rather than a separate static
 * site: every example below carries *this* deployment's base URL, *this*
 * instance's served domains and *this* operator's plan limits. A generated
 * site would document one deployment and be wrong for every self-hoster.
 */

interface Props {
  /** Browser-facing API base for this deployment. */
  apiUrl: string;
  siteName: string;
  domains: string[];
  plans: PublicPlan[];
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-rule pt-10">
      <h2 className="text-xl font-bold tracking-tight">
        {/* Anchored so a section can be linked to in a bug report. */}
        <a href={`#${id}`} className="hover:text-accent">
          {title}
        </a>
      </h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Params({ title, params }: { title: string; params: Param[] }) {
  return (
    <div className="mt-3">
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-2">
        {title}
      </p>
      <dl className="space-y-1.5">
        {params.map((p) => (
          <div key={p.name} className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <dt className="font-mono text-xs text-accent">{p.name}</dt>
            <span className="font-mono text-[11px] text-ink-2">{p.type}</span>
            {p.required && (
              <span className="text-[11px] font-semibold text-danger">required</span>
            )}
            <dd className="w-full text-ink-2 sm:w-auto sm:flex-1">{p.description}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function EndpointRow({ endpoint }: { endpoint: Endpoint }) {
  return (
    <div className="border-t border-rule py-4 first:border-t-0 first:pt-0">
      <p className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-sm px-1.5 py-1 font-mono text-[11px] font-bold leading-none ${METHOD_TONE[endpoint.method]}`}
        >
          {endpoint.method}
        </span>
        <code className="font-mono text-sm font-medium" style={{ overflowWrap: "anywhere" }}>
          {endpoint.path}
        </code>
      </p>
      <p className="mt-1.5 text-sm">{endpoint.summary}</p>
      {endpoint.description && (
        <p className="mt-1 text-sm text-ink-2">{endpoint.description}</p>
      )}
      {endpoint.query && <Params title="Query" params={endpoint.query} />}
      {endpoint.body && <Params title="Body" params={endpoint.body} />}
    </div>
  );
}

export function DocsPage({ apiUrl, siteName, domains, plans }: Props) {
  const free = plans[0];

  const quickstart = `# 1. Mint an inbox — private, only your keys can read it
ADDR=$(curl -s -X POST ${apiUrl}/v1/inboxes \\
  -H "Authorization: Bearer $FANA_KEY" \\
  -H "content-type: application/json" -d '{}' | jq -r .address)

# 2. Trigger whatever sends the mail, using $ADDR

# 3. Wait for it, and read the code straight out of the body
curl -s "${apiUrl}/v1/inboxes/$ADDR/wait?timeout=60" \\
  -H "Authorization: Bearer $FANA_KEY" | jq -r .message.extracted.codes[0]`;

  const nodeExample = `const key = process.env.FANA_KEY;
const headers = { authorization: \`Bearer \${key}\` };

const { address } = await fetch("${apiUrl}/v1/inboxes", {
  method: "POST",
  headers: { ...headers, "content-type": "application/json" },
  body: "{}",
}).then((r) => r.json());

await signUpWithEmail(address); // whatever you are testing

// Blocks until it lands — no polling loop, no sleep().
const { message } = await fetch(
  \`${apiUrl}/v1/inboxes/\${address}/wait?from=noreply&timeout=60\`,
  { headers },
).then((r) => r.json());

const code = message.extracted.codes[0];`;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:py-14">
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_13rem] lg:gap-10">
        <div className="min-w-0">
          <header>
            <Badge tone="accent">API reference</Badge>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
              Disposable inboxes, over HTTP
            </h1>
            <p className="mt-3 max-w-2xl text-ink-2">
              Create an address, send something to it, and block until the mail
              arrives — then read the one-time code straight out of the body.
              Built for the part of a test suite that has to receive an email.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <AccountLink
                signedOutLabel="Get a free key"
                signedInLabel="Go to your dashboard"
                className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-soft"
              >
                <ArrowRight className="h-4 w-4" />
              </AccountLink>
              <a
                href={REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-ink-2 underline-offset-4 hover:text-ink hover:underline"
              >
                Self-host it instead
              </a>
            </div>
          </header>

          <div className="mt-10 space-y-10">
            <section id="base-url" className="scroll-mt-20">
              <h2 className="text-xl font-bold tracking-tight">
                <a href="#base-url" className="hover:text-accent">
                  Base URL
                </a>
              </h2>
              <p className="mt-3 text-sm text-ink-2">
                Every path on this page is relative to this instance. A
                deployment you run yourself has its own, so read it from
                configuration rather than hard-coding {siteName}.
              </p>
              <CodeBlock code={apiUrl} label="Base URL" className="mt-4" />
            </section>

            <section id="quickstart" className="scroll-mt-20">
              <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight">
                <Terminal className="h-4 w-4 text-accent" />
                <a href="#quickstart" className="hover:text-accent">
                  Quickstart
                </a>
              </h2>
              <p className="mt-3 text-sm text-ink-2">
                Sign in, create a key in the dashboard, and the three calls below
                are the whole flow.
              </p>
              <CodeBlock code={quickstart} label="Quickstart" className="mt-4" />
              <p className="mt-4 text-sm text-ink-2">The same thing in JavaScript:</p>
              <CodeBlock
                code={nodeExample}
                lang="javascript"
                label="Example"
                className="mt-2"
              />
            </section>

            <Section id="authentication" title="Authentication">
              <p className="text-sm text-ink-2">
                Every <code className="font-mono text-accent">/v1</code> request
                carries your key as a bearer token. Keys start with{" "}
                <code className="font-mono">fk_</code>, belong to an account, and
                inherit that account&apos;s plan — holding two keys does not buy
                two allowances. Only a hash is stored, so a key is shown once and
                a lost one is revoked rather than recovered.
              </p>
              <CodeBlock
                code={`Authorization: Bearer fk_...`}
                lang="http"
                label="Header"
              />
            </Section>

            <Section id="limits" title="Limits and quota">
              <p className="text-sm text-ink-2">
                Counted per account, per calendar month in UTC. Every response
                carries what is left, so a client can back off before it runs out.
              </p>
              <CodeBlock
                code={`X-Plan: ${free?.slug ?? "free"}
X-Quota-Limit: ${free?.monthlyRequests ?? 1000}
X-Quota-Remaining: 998`}
                lang="http"
                label="Headers"
              />
              <p className="text-sm text-ink-2">
                Over the per-minute ceiling answers{" "}
                <code className="font-mono">429</code> with{" "}
                <code className="font-mono">Retry-After</code>; over the monthly
                quota answers <code className="font-mono">429</code> naming the
                plan. A waiting call costs one request however long it waits,
                which makes <code className="font-mono">/wait</code> cheaper than
                polling as well as faster.
              </p>

              {plans.length > 0 && (
                <div className="overflow-x-auto rounded-card border border-rule">
                  <table className="w-full min-w-[34rem] text-left text-sm">
                    <thead className="border-b border-rule bg-paper-2 text-xs uppercase tracking-wide text-ink-2">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Plan</th>
                        <th className="px-3 py-2 font-semibold">Requests / month</th>
                        <th className="px-3 py-2 font-semibold">Per minute</th>
                        <th className="px-3 py-2 font-semibold">Retention</th>
                        <th className="px-3 py-2 font-semibold">Inboxes at once</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plans.map((p) => (
                        <tr key={p.slug} className="border-t border-rule">
                          <td className="px-3 py-2 font-medium">{p.label}</td>
                          <td className="px-3 py-2 text-ink-2">
                            {formatLimit(p.monthlyRequests)}
                          </td>
                          <td className="px-3 py-2 text-ink-2">
                            {formatLimit(p.requestsPerMinute)}
                          </td>
                          <td className="px-3 py-2 text-ink-2">
                            {formatRetention(p.retentionMinutes)}
                          </td>
                          <td className="px-3 py-2 text-ink-2">
                            {formatLimit(p.concurrentInboxes)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-xs text-ink-2">
                These are {siteName}&apos;s numbers, read from this instance —
                a deployment you run yourself sets its own.
              </p>
            </Section>

            {GROUPS.map((group) => (
              <Section key={group.id} id={group.id} title={group.title}>
                <p className="text-sm text-ink-2">{group.blurb}</p>
                <div className="rounded-card border border-rule p-4">
                  {group.endpoints.map((e) => (
                    <EndpointRow key={`${e.method} ${e.path}`} endpoint={e} />
                  ))}
                </div>
              </Section>
            ))}

            <Section id="signatures" title="Verifying a webhook">
              <p className="text-sm text-ink-2">
                Every delivery carries{" "}
                <code className="font-mono">X-Fana-Signature</code>: an HMAC-SHA256
                of <code className="font-mono">{"<timestamp>.<raw body>"}</code>{" "}
                using the endpoint&apos;s signing secret. Check it before trusting
                the payload — anyone who learns your URL can post to it otherwise.
                The timestamp is signed too, so a captured request stops working
                once it is older than five minutes.
              </p>
              <CodeBlock
                lang="javascript"
                label="Verification"
                code={`import { createHmac, timingSafeEqual } from "node:crypto";

// The raw body, before any JSON parsing — re-serializing changes the bytes.
export function verify(secret, rawBody, header) {
  const { t, v1 } = Object.fromEntries(
    header.split(",").map((p) => p.trim().split("=")),
  );
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;

  const expected = createHmac("sha256", secret)
    .update(\`\${t}.\${rawBody}\`)
    .digest("hex");
  return timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
}`}
              />
              <p className="text-sm text-ink-2">
                Answer <code className="font-mono">2xx</code> to accept a delivery.
                Anything else is retried with a growing delay — seconds, then
                minutes, then hours — and given up on after six attempts. An
                endpoint whose deliveries keep failing is paused, and you turn it
                back on in the dashboard once it is fixed.
              </p>
            </Section>

            <Section id="extraction" title="Codes and links">
              <p className="text-sm text-ink-2">
                Reading a single message also returns what the mail was probably
                sent for. <code className="font-mono">codes</code> is ordered by
                how close each candidate sits to a word naming it, so{" "}
                <code className="font-mono">codes[0]</code> is the one to type.
                Numbers inside tracking links, prices, phone numbers and
                copyright years are excluded, and when nothing in the mail is
                called a code the list is empty rather than a guess.
              </p>
              <CodeBlock
                code={`{
  "message": {
    "subject": "Confirm your email",
    "extracted": {
      "codes": ["483920"],
      "links": ["https://example.com/verify?t=abc123"]
    }
  }
}`}
                lang="json"
                label="Response"
              />
              <p className="text-sm text-ink-2">
                Listings do not carry it — extraction is for the message you
                opened, and running it over a hundred rows nobody read would be
                pure work.
              </p>
            </Section>

            <Section id="errors" title="Errors">
              <p className="text-sm text-ink-2">
                Errors are JSON with an <code className="font-mono">error</code>{" "}
                string. A private message belonging to another account answers{" "}
                <code className="font-mono">404</code> rather than{" "}
                <code className="font-mono">403</code>, so nothing is confirmed
                about an address you do not own.
              </p>
              <div className="overflow-x-auto rounded-card border border-rule">
                <table className="w-full min-w-[30rem] text-left text-sm">
                  <tbody>
                    {[
                      ["400", "Malformed input — an unserved domain, a bad timestamp."],
                      ["401", "Missing or unknown key."],
                      ["404", "No such message or inbox, or not yours."],
                      ["429", "Over the per-minute burst, the monthly quota, or the concurrent-inbox limit."],
                      ["503", "Could not allocate an address; retry."],
                    ].map(([code, meaning]) => (
                      <tr key={code} className="border-t border-rule first:border-t-0">
                        <td className="w-16 px-3 py-2 font-mono font-semibold">{code}</td>
                        <td className="px-3 py-2 text-ink-2">{meaning}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            <Section id="domains" title="Domains">
              <p className="text-sm text-ink-2">
                Mail is accepted for{" "}
                <strong className="font-semibold text-ink">
                  {domains.length.toLocaleString("en-US")}
                </strong>{" "}
                domain{domains.length === 1 ? "" : "s"} right now. Any of them can
                be asked for by name when minting an inbox; omit the domain and
                one is picked at random.
              </p>
              {domains.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {domains.slice(0, DOMAINS_SHOWN).map((d) => (
                    <li
                      key={d}
                      className="rounded-md border border-rule bg-paper-2 px-2.5 py-1 font-mono text-xs"
                    >
                      {d}
                    </li>
                  ))}
                  {domains.length > DOMAINS_SHOWN && (
                    <li className="px-1 py-1 text-xs text-ink-2">
                      + {(domains.length - DOMAINS_SHOWN).toLocaleString("en-US")} more
                    </li>
                  )}
                </ul>
              )}
              <p className="text-sm text-ink-2">
                Community domains are self-service, so the set changes without
                notice and can grow well past what is worth printing. Read it at
                run time rather than copying from here.
              </p>
              <CodeBlock
                code={`curl ${apiUrl}/api/domains`}
                label="Domains request"
              />
            </Section>
          </div>

          <footer className="mt-14 border-t border-rule pt-6 text-sm text-ink-2">
            Ready?{" "}
            <AccountLink
              signedOutLabel="Create a free key"
              signedInLabel="Open your dashboard"
              className="font-medium text-accent hover:underline"
            />{" "}
            — sign in with a provider, no card, no email to verify.
          </footer>
        </div>

        {/* Desktop-only: on a phone this would push the content off the screen,
            and the document is short enough to scroll. */}
        <TableOfContents sections={SECTIONS} />
      </div>
    </main>
  );
}
