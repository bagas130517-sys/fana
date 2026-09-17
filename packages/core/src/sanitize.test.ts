import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeEmailHtml } from "./sanitize.js";

test("strips <script> and its content", () => {
  const out = sanitizeEmailHtml('<p>hi</p><script>alert(1)</script>');
  assert.ok(out.includes("<p>hi</p>"));
  assert.ok(!out.includes("script"));
  assert.ok(!out.includes("alert"));
});

test("removes on* event handler attributes", () => {
  const out = sanitizeEmailHtml('<img src="https://e.com/x.png" onerror="alert(1)">');
  assert.ok(out.includes("<img"));
  assert.ok(!out.toLowerCase().includes("onerror"));
});

test("drops javascript: URLs on links", () => {
  const out = sanitizeEmailHtml('<a href="javascript:alert(1)">x</a>');
  assert.ok(!out.toLowerCase().includes("javascript:"));
});

test("keeps safe links and forces target/rel", () => {
  const out = sanitizeEmailHtml('<a href="https://example.com">link</a>');
  assert.ok(out.includes('href="https://example.com"'));
  assert.ok(out.includes('target="_blank"'));
  assert.ok(out.includes("noopener"));
});

test("preserves basic formatting and inline styles", () => {
  const out = sanitizeEmailHtml('<p style="color:red"><strong>bold</strong></p>');
  assert.ok(out.includes("<strong>bold</strong>"));
  assert.ok(out.includes("color:red"));
});

test("blocks data: URIs on images", () => {
  const out = sanitizeEmailHtml('<img src="data:text/html,<script>alert(1)</script>">');
  assert.ok(!out.includes("data:"));
});
