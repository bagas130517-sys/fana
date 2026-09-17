import { REPO_URL } from "@fana/core/brand";
import { GithubMark } from "@/components/icons/GithubMark";

/**
 * Attribution link to the project. Deliberately not themeable — see
 * `packages/core/src/brand.ts`. Shared so the inbox and the docs carry the same
 * mark rather than two copies of the same path data.
 */
export function RepoLink({ className }: { className?: string }) {
  return (
    <a
      href={REPO_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Source repository"
      className={`inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-2 transition-colors hover:bg-paper-3 hover:text-ink ${className ?? ""}`}
    >
      <GithubMark />
    </a>
  );
}
