import { createHighlighter, type Highlighter } from "shiki";

/**
 * Server-side syntax highlighting for the docs.
 *
 * Runs during the render, so the browser gets coloured markup and none of the
 * highlighter — a docs page should not ship a tokenizer to read four code
 * samples. Both themes are emitted at once as CSS variables and `globals.css`
 * picks one, so the theme toggle needs no JavaScript and no second render.
 */

export type Lang = "bash" | "json" | "javascript" | "http";

const LANGS: Lang[] = ["bash", "json", "javascript", "http"];

// Created once per process: loading grammars is the expensive part, and the
// docs page is force-dynamic so it would otherwise pay on every request.
let pending: Promise<Highlighter> | null = null;

function highlighter(): Promise<Highlighter> {
  pending ??= createHighlighter({
    themes: ["github-light", "github-dark"],
    langs: LANGS,
  });
  return pending;
}

export async function highlight(code: string, lang: Lang): Promise<string> {
  try {
    const shiki = await highlighter();
    return shiki.codeToHtml(code, {
      lang,
      themes: { light: "github-light", dark: "github-dark" },
      // Emit both as CSS variables rather than baking one in — see globals.css.
      defaultColor: false,
    });
  } catch {
    // Never lose the sample over a highlighting failure: plain text still runs.
    return `<pre class="shiki"><code>${escapeHtml(code)}</code></pre>`;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
