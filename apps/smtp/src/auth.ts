import { authenticate } from "mailauth";
import type { SMTPServerSession } from "smtp-server";
import { deriveVerdict, type AuthResults, type Verdict } from "@fana/core";

// Name this MTA presents in Authentication-Results. Purely cosmetic.
const MTA = process.env.MAIL_AUTH_MTA ?? "localhost";

interface MechResult {
  status?: { result?: string };
}

function pickDkim(results: MechResult[] | undefined): string | null {
  if (!results?.length) return null;
  if (results.some((r) => r.status?.result === "pass")) return "pass";
  if (results.some((r) => r.status?.result === "fail")) return "fail";
  return results[0]?.status?.result ?? null;
}

/**
 * Run SPF/DKIM/DMARC checks on an inbound message using the SMTP session
 * (client IP, HELO, MAIL FROM). Never throws — DNS/parse failures fall back to
 * an "unverified" verdict so a message is still delivered.
 */
export async function authenticateMessage(
  raw: Buffer,
  session: SMTPServerSession,
): Promise<AuthResults & { verdict: Verdict }> {
  const sender =
    typeof session.envelope.mailFrom === "object" && session.envelope.mailFrom
      ? session.envelope.mailFrom.address
      : "";
  try {
    const res = await authenticate(raw, {
      ip: session.remoteAddress,
      helo: session.hostNameAppearsAs || session.clientHostname,
      sender,
      mta: MTA,
    });
    const results: AuthResults = {
      spf: res.spf?.status?.result ?? null,
      dkim: pickDkim(res.dkim?.results),
      dmarc: res.dmarc?.status?.result ?? null,
    };
    return { ...results, verdict: deriveVerdict(results) };
  } catch (err) {
    console.error("[smtp] auth check failed:", err);
    const empty: AuthResults = { spf: null, dkim: null, dmarc: null };
    return { ...empty, verdict: deriveVerdict(empty) };
  }
}
