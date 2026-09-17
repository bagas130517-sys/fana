// Minimal ambient types for mailauth's authenticate() — the package ships no
// TypeScript declarations. Only the fields we consume are described here.
declare module "mailauth" {
  interface AuthMechResult {
    status?: { result?: string };
  }
  interface AuthenticateResult {
    spf?: { status?: { result?: string } };
    dkim?: { results?: AuthMechResult[] };
    dmarc?: { status?: { result?: string } };
  }
  interface AuthenticateOptions {
    ip?: string;
    helo?: string;
    sender?: string;
    mta?: string;
  }
  export function authenticate(
    message: Buffer | string,
    options?: AuthenticateOptions,
  ): Promise<AuthenticateResult>;
}
