import { highlight, type Lang } from "@/lib/highlight";
import { CopyButton } from "@/components/ui/CopyButton";

/**
 * A code sample you are meant to run, so copying it is the primary action
 * rather than a nicety — the whole page exists to get a first request working.
 *
 * Highlighted on the server: the markup arrives coloured and the highlighter
 * never reaches the browser. Only the copy button is interactive.
 */
export async function CodeBlock({
  code,
  lang = "bash",
  label,
  className,
}: {
  code: string;
  lang?: Lang;
  /** What copying gets you — used in the toast. */
  label?: string;
  className?: string;
}) {
  const html = await highlight(code, lang);

  return (
    <div
      className={`code-block relative overflow-hidden rounded-card border border-rule bg-paper-2 text-xs leading-relaxed ${className ?? ""}`}
    >
      {/* No stacking context of its own: a z-index here would ride over the
          sticky header on scroll. */}
      <div className="absolute right-2 top-2">
        <CopyButton value={code} toastMessage={label ? `${label} copied` : "Copied"} />
      </div>
      {/* The wrapper owns the surface and the padding lives on the <pre> — see
          globals.css. Two backgrounds would read as a box inside a box. */}
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
