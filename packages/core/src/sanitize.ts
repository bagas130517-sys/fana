import sanitizeHtml from "sanitize-html";

// NOTE: kept out of the package index so it never reaches the web bundle —
// server-only (apps/smtp imports "@fana/core/sanitize").

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [...sanitizeHtml.defaults.allowedTags, "img"],
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    "*": ["style", "align", "dir", "width", "height", "bgcolor", "color", "class"],
    a: ["href", "name", "target", "rel"],
    img: ["src", "alt", "title", "width", "height"],
    table: ["border", "cellpadding", "cellspacing", "width", "style", "bgcolor"],
    td: ["colspan", "rowspan", "align", "valign", "width", "style", "bgcolor"],
    th: ["colspan", "rowspan", "align", "valign", "width", "style", "bgcolor"],
  },
  // Only safe URL schemes; drops javascript:, and by omitting data: also
  // blocks data-URI SVG/script vectors.
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesByTag: { img: ["http", "https"] },
  disallowedTagsMode: "discard",
  // Drop these tags AND their text content (not just the tags).
  nonTextTags: ["script", "style", "textarea", "noscript", "title", "head"],
  // Force external links to open safely in a new tab.
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", {
      target: "_blank",
      rel: "noopener noreferrer nofollow",
    }),
  },
};

/**
 * Sanitize untrusted email HTML for rendering. Strips scripts, event handlers
 * (on*), javascript:/data: URLs, and disallowed tags. Inline styles are kept
 * (the web renders inside a sandboxed iframe as a second layer).
 */
export function sanitizeEmailHtml(dirty: string): string {
  return sanitizeHtml(dirty, OPTIONS);
}
