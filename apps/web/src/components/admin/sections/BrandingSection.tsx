"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Palette, RotateCcw, Save } from "lucide-react";
import {
  DEFAULT_BRAND,
  darkAccentTokens,
  deriveDarkAccent,
  formatOklch,
  lightAccentTokens,
  parseColor,
  type BrandOverrides,
} from "@fana/core/brand";
import { adminApi, type AdminBranding } from "@/lib/adminApi";
import { useRefreshKey } from "../RefreshContext";
import { Panel } from "../Panel";
import { ColorPicker } from "../ColorPicker";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { SwitchField } from "@/components/ui/Switch";
import { toast } from "@/components/ui/Toaster";

type FieldKey = keyof BrandOverrides;

const FIELDS: {
  key: FieldKey;
  label: string;
  hint: string;
  placeholder: string;
  mono?: boolean;
  long?: boolean;
}[] = [
  {
    key: "siteName",
    label: "Site name",
    hint: "Shown in the header and the page title. The part after the first dot is accented.",
    placeholder: DEFAULT_BRAND.siteName,
  },
  {
    key: "tagline",
    label: "Tagline",
    hint: "The line under the header, also used as the meta description.",
    placeholder: DEFAULT_BRAND.tagline,
    long: true,
  },
  {
    key: "logoUrl",
    label: "Logo URL",
    hint: "https:// URL or a same-origin path. Blank shows the site name on its own.",
    placeholder: "/logo.svg",
    mono: true,
  },
  {
    key: "faviconUrl",
    label: "Favicon URL",
    hint: "https:// URL or a same-origin path.",
    placeholder: "/favicon.ico",
    mono: true,
  },
];

export function BrandingSection() {
  const refreshKey = useRefreshKey();
  const router = useRouter();
  const [form, setForm] = useState<BrandOverrides>({});
  const [saved, setSaved] = useState<AdminBranding | null>(null);
  const [busy, setBusy] = useState<"save" | "reset" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi
      .branding()
      .then((data) => {
        setSaved(data);
        setForm(data.overrides);
      })
      .catch(() => {});
  }, [refreshKey]);

  async function act(kind: "save" | "reset") {
    setBusy(kind);
    setError(null);
    try {
      const data =
        kind === "save"
          ? await adminApi.saveBranding(form)
          : await adminApi.resetBranding();
      setSaved(data);
      setForm(data.overrides);
      toast.success(
        kind === "save" ? "Branding saved" : "Reset to the built-in theme",
        { description: "Live on every page — no rebuild needed." },
      );
      // The layout resolves branding server-side; re-render so the change shows here too.
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  // Preview from what's typed, so a bad colour shows as "unchanged" immediately.
  const accent = parseColor(form.accent) ?? DEFAULT_BRAND.accent;
  const accentDark = parseColor(form.accentDark) ?? deriveDarkAccent(accent);
  const previews = [
    { mode: "Light", paper: "oklch(99% 0.004 95)", ink: "oklch(25% 0.02 275)", tokens: lightAccentTokens(accent) },
    { mode: "Dark", paper: "oklch(19% 0.012 275)", ink: "oklch(96% 0.004 275)", tokens: darkAccentTokens(accentDark) },
  ];

  return (
    <Panel
      title="Branding"
      icon={<Palette className="h-4 w-4 text-accent" />}
      action={
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            disabled={busy !== null || !saved || Object.keys(saved.overrides).length === 0}
            onClick={() => void act("reset")}
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </Button>
          <Button size="sm" disabled={busy !== null} onClick={() => void act("save")}>
            <Save className="h-4 w-4" />
            Save
          </Button>
        </div>
      }
    >
      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        {previews.map((p) => (
          <div
            key={p.mode}
            className="rounded-md border border-rule p-3"
            style={{ background: p.paper, color: p.ink }}
          >
            <p className="mb-2 text-xs font-medium opacity-70">{p.mode}</p>
            <div className="flex items-center gap-2">
              <span
                className="rounded-md px-2.5 py-1.5 text-xs font-semibold"
                style={{
                  background: p.tokens["--color-accent"],
                  color: p.tokens["--color-accent-ink"],
                }}
              >
                Button
              </span>
              <span
                className="rounded-md px-2.5 py-1.5 text-xs font-semibold"
                style={{
                  background: p.tokens["--color-accent-soft"],
                  color: p.tokens["--color-accent"],
                }}
              >
                Tint
              </span>
              <span
                className="h-6 w-6 rounded-md"
                style={{ background: p.tokens["--color-accent-strong"] }}
                title="hover / pressed"
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-ink-2">Accent</span>
            {form.accent && (
              <button
                type="button"
                onClick={() => setForm({ ...form, accent: "" })}
                className="text-xs text-ink-2 underline-offset-2 hover:text-ink hover:underline"
              >
                use default
              </button>
            )}
          </div>
          <ColorPicker
            value={form.accent}
            fallback={DEFAULT_BRAND.accent}
            onChange={(accent) => setForm({ ...form, accent })}
          />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-ink-2">Accent · dark mode</span>
            <SwitchField
              label="derive from accent"
              checked={!form.accentDark}
              onCheckedChange={(checked) =>
                setForm({
                  ...form,
                  accentDark: checked ? "" : formatOklch(deriveDarkAccent(accent)),
                })
              }
            />
          </div>
          {form.accentDark ? (
            <ColorPicker
              value={form.accentDark}
              fallback={deriveDarkAccent(accent)}
              onChange={(accentDark) => setForm({ ...form, accentDark })}
            />
          ) : (
            <div className="flex items-center gap-3 rounded-md border border-dashed border-rule bg-paper p-3">
              <span
                className="h-10 w-10 shrink-0 rounded-md border border-rule"
                style={{ background: formatOklch(accentDark) }}
                aria-hidden
              />
              <p className="text-xs text-ink-2">
                Lifted from the accent so it stays legible on dark surfaces.
                Untick to pick your own.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4">
        {FIELDS.map((f) => (
          <Field key={f.key} label={f.label} hint={f.hint}>
            {(props) =>
              f.long ? (
                <Textarea
                  {...props}
                  rows={2}
                  value={form[f.key] ?? ""}
                  placeholder={f.placeholder}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                />
              ) : (
                <Input
                  {...props}
                  value={form[f.key] ?? ""}
                  placeholder={f.placeholder}
                  mono={f.mono}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                />
              )
            }
          </Field>
        ))}
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      <p className="mt-4 text-xs text-ink-2">
        Blank fields inherit the built-in theme. Everything here is stored in the
        database — no rebuild, no redeploy.
      </p>
    </Panel>
  );
}
