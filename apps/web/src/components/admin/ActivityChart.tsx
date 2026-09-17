"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ActivityPoint } from "@/lib/adminApi";

/**
 * Inbound mail per hour. Recharts rather than the hand-drawn bars this replaced:
 * real axes, a hover readout and sane behaviour at any width. The series uses
 * `currentColor`, so it follows the theme and whatever accent branding sets.
 */
export function ActivityChart({ data }: { data: ActivityPoint[] }) {
  const points = data.map((d) => ({
    ...d,
    label: new Date(d.hour).toLocaleTimeString([], { hour: "2-digit" }),
  }));
  const total = data.reduce((s, d) => s + d.count, 0);
  const peak = Math.max(...data.map((d) => d.count), 0);

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <p className="text-2xl font-bold tabular-nums">
          {total}
          <span className="ml-1.5 text-sm font-normal text-ink-2">in 24h</span>
        </p>
        <p className="text-xs text-ink-2">peak {peak}/h</p>
      </div>

      <div className="h-48 w-full text-accent">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: -22 }}>
            <defs>
              <linearGradient id="fana-activity" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity={0.35} />
                <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--color-rule)" strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              interval={5}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--color-ink-2)", fontSize: 11 }}
            />
            <YAxis
              allowDecimals={false}
              width={44}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--color-ink-2)", fontSize: 11 }}
            />
            <Tooltip
              cursor={{ stroke: "var(--color-rule)" }}
              contentStyle={{
                background: "var(--color-paper-2)",
                border: "1px solid var(--color-rule)",
                borderRadius: "var(--radius-md)",
                color: "var(--color-ink)",
                fontSize: 12,
                boxShadow: "var(--shadow-card)",
              }}
              formatter={(value) => {
                const n = Number(value);
                return [`${n} email${n === 1 ? "" : "s"}`, "Received"];
              }}
            />
            <Area
              type="monotone"
              dataKey="count"
              stroke="currentColor"
              strokeWidth={2}
              fill="url(#fana-activity)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
