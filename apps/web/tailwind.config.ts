import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Colors resolve to CSS vars that swap under `.dark` — no dark: variants needed.
      colors: {
        paper: "var(--color-paper)",
        "paper-2": "var(--color-paper-2)",
        "paper-3": "var(--color-paper-3)",
        ink: "var(--color-ink)",
        "ink-2": "var(--color-ink-2)",
        rule: "var(--color-rule)",
        accent: "var(--color-accent)",
        "accent-strong": "var(--color-accent-strong)",
        "accent-soft": "var(--color-accent-soft)",
        "accent-ink": "var(--color-accent-ink)",
        good: "var(--color-good)",
        "good-soft": "var(--color-good-soft)",
        warn: "var(--color-warn)",
        "warn-soft": "var(--color-warn-soft)",
        danger: "var(--color-danger)",
        "danger-soft": "var(--color-danger-soft)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        card: "var(--radius-card)",
        md: "var(--radius-md)",
        sm: "var(--radius-sm)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
      },
    },
  },
  plugins: [],
} satisfies Config;
