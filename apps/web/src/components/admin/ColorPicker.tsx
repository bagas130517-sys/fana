"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { formatOklch, parseColor, type Oklch } from "@fana/core/brand";
import { Input } from "@/components/ui/Input";

/**
 * Accent picker for the branding form. Deliberately not `<input type="color">`:
 * that opens the OS picker (sRGB, off-brand chrome) and the theme is OKLCH, so
 * hue/chroma/lightness are the axes an operator actually wants. A text field is
 * kept for pasting an exact brand colour.
 */

const PRESETS: { name: string; color: Oklch }[] = [
  { name: "Indigo", color: { l: 0.56, c: 0.17, h: 274 } },
  { name: "Violet", color: { l: 0.56, c: 0.2, h: 305 } },
  { name: "Blue", color: { l: 0.58, c: 0.16, h: 245 } },
  { name: "Teal", color: { l: 0.6, c: 0.12, h: 195 } },
  { name: "Green", color: { l: 0.6, c: 0.15, h: 150 } },
  { name: "Amber", color: { l: 0.72, c: 0.16, h: 70 } },
  { name: "Orange", color: { l: 0.65, c: 0.18, h: 45 } },
  { name: "Rose", color: { l: 0.59, c: 0.22, h: 18 } },
];

const SLIDERS = [
  { key: "h", label: "Hue", min: 0, max: 360, step: 1 },
  { key: "c", label: "Chroma", min: 0, max: 0.3, step: 0.005 },
  { key: "l", label: "Lightness", min: 0.3, max: 0.9, step: 0.01 },
] as const;

/** Sample the axis being dragged so the track previews the actual result. */
function trackGradient(axis: "h" | "c" | "l", color: Oklch): string {
  const steps = 12;
  const stops = Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    if (axis === "h") return formatOklch({ ...color, h: t * 360 });
    if (axis === "c") return formatOklch({ ...color, c: t * 0.3 });
    return formatOklch({ ...color, l: 0.3 + t * 0.6 });
  });
  return `linear-gradient(to right, ${stops.join(", ")})`;
}

export function ColorPicker({
  value,
  fallback,
  onChange,
}: {
  /** Current override, or undefined when inheriting `fallback`. */
  value: string | undefined;
  fallback: Oklch;
  onChange: (value: string) => void;
}) {
  const color = parseColor(value) ?? fallback;
  // Kept separate from `value` so a half-typed "#e1" doesn't reset the sliders.
  const [text, setText] = useState<string | null>(null);
  const typed = text ?? value ?? "";
  const typedInvalid = typed.trim() !== "" && !parseColor(typed);

  function set(next: Oklch) {
    setText(null);
    onChange(formatOklch(next));
  }

  return (
    <div className="rounded-md border border-rule bg-paper p-3">
      <div className="mb-3 flex items-center gap-3">
        <span
          className="h-10 w-10 shrink-0 rounded-md border border-rule"
          style={{ background: formatOklch(color) }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <Input
            value={typed}
            onChange={(e) => {
              setText(e.target.value);
              const parsed = parseColor(e.target.value);
              if (parsed || e.target.value.trim() === "") onChange(e.target.value);
            }}
            onBlur={() => setText(null)}
            placeholder={formatOklch(fallback)}
            aria-label="Accent colour value"
            size="sm"
            mono
            invalid={typedInvalid}
            className="bg-paper-2"
          />
          <p className="mt-1 text-xs text-ink-2">
            {typedInvalid ? "Use #hex or oklch(L C H)." : "Paste a #hex, or use the sliders."}
          </p>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {PRESETS.map((p) => {
          const active =
            Math.abs(p.color.h - color.h) < 1 &&
            Math.abs(p.color.c - color.c) < 0.005 &&
            Math.abs(p.color.l - color.l) < 0.005;
          return (
            <button
              key={p.name}
              type="button"
              onClick={() => set(p.color)}
              title={p.name}
              aria-label={p.name}
              aria-pressed={active}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-rule transition hover:scale-110"
              style={{ background: formatOklch(p.color) }}
            >
              {active && (
                <Check
                  className="h-3.5 w-3.5"
                  style={{ color: p.color.l > 0.7 ? "oklch(20% 0 0)" : "oklch(99% 0 0)" }}
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="grid gap-2.5">
        {SLIDERS.map((s) => (
          <label key={s.key} className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-xs text-ink-2">{s.label}</span>
            <input
              type="range"
              min={s.min}
              max={s.max}
              step={s.step}
              value={color[s.key]}
              onChange={(e) => set({ ...color, [s.key]: Number(e.target.value) })}
              className="brand-slider min-w-0 flex-1"
              style={{ background: trackGradient(s.key, color) }}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
