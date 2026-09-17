import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import nextPlugin from "@next/eslint-plugin-next";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/node_modules/**",
      "**/*.config.js",
      "**/*.config.mjs",
      "**/*.config.ts",
      "apps/web/next-env.d.ts",
      "packages/db/drizzle/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // TypeScript already reports undefined identifiers; the core rule only
      // produces false positives on ambient/global types here.
      "no-undef": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Web app: React hooks + Next.js rules.
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "@next/next": nextPlugin,
    },
    settings: {
      // eslint runs from the repo root; point the Next plugin at the app.
      next: { rootDir: "apps/web" },
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
);
