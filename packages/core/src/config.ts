/** Domains this instance accepts mail for, from MAIL_DOMAINS env. */
export function getMailDomains(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.MAIL_DOMAINS ?? "example.com")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

/** True if the address's domain is one this instance serves. */
export function isServedAddress(
  address: string,
  domains: string[],
): boolean {
  const domain = address.split("@")[1]?.toLowerCase();
  return domain !== undefined && domains.includes(domain);
}

export function messageTtlMs(env: NodeJS.ProcessEnv = process.env): number {
  const minutes = Number(env.MESSAGE_TTL_MINUTES ?? "60");
  return (Number.isFinite(minutes) ? minutes : 60) * 60_000;
}

/** How long a minted address stays reserved (renewed on each visit/claim). */
export function reservationTtlMs(env: NodeJS.ProcessEnv = process.env): number {
  const minutes = Number(env.RESERVATION_TTL_MINUTES ?? "1440");
  return (Number.isFinite(minutes) ? minutes : 1440) * 60_000;
}
