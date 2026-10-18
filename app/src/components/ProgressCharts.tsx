"use client";

// Progress charts — small multiples: one mini line chart per metric.
// (Metrics have incomparable scales — °, s, %, ms — so they never share
// an axis. One series per chart → direct title, no legend needed.)
// Line color #16a34a: validated against the dark surface (dataviz checks).
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  YAxis,
} from "recharts";
import type { SwingMetrics } from "@/lib/swingMetrics";

export interface ChartSession {
  createdAt: number;
  metrics?: SwingMetrics;
}

const SERIES: { key: keyof SwingMetrics; label: string; unit: string }[] = [
  { key: "sequenceGapMs", label: "Hips→shoulders gap", unit: "ms" },
  { key: "hipTurnDeg", label: "Hip turn", unit: "°" },
  { key: "tempoSec", label: "Tempo", unit: "s" },
  { key: "headDriftPct", label: "Head drift", unit: "%" },
  { key: "stridePct", label: "Stride", unit: "%" },
  { key: "kneeBraceDeg", label: "Knee brace", unit: "°" },
  { key: "shoulderTiltDeg", label: "Shoulder tilt", unit: "°" },
];

const LINE = "#16a34a";

export default function ProgressCharts({ sessions }: { sessions: ChartSession[] }) {
  // oldest → newest, only analyzed sessions
  const analyzed = sessions
    .filter((s) => s.metrics)
    .sort((a, b) => a.createdAt - b.createdAt);

  if (analyzed.length < 2) {
    return (
      <section className="mb-6 flex h-40 items-center justify-center rounded-2xl bg-card p-4 text-center text-sm text-muted-foreground">
        {analyzed.length === 0
          ? "Charts appear after your first analyzed swing."
          : "One swing analyzed — upload another and the trend lines begin."}
      </section>
    );
  }

  return (
    <section className="mb-6 grid grid-cols-2 gap-2 wide:gap-3">
      {SERIES.map(({ key, label, unit }) => {
        // Per-series filtering: an upper-body clip has no stride number, and a
        // gap in the trend line is better than a fake point at zero.
        const data = analyzed
          .filter((s) => typeof s.metrics![key] === "number")
          .map((s) => ({
            date: new Date(s.createdAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            }),
            value: s.metrics![key] as number,
          }));
        if (data.length < 2) return null;
        const latest = data[data.length - 1].value;
        return (
          <div key={key} className="dd-chart rounded-2xl bg-card p-3">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-muted-foreground">{label}</span>
              <span className="font-mono text-sm font-bold text-primary">
                {latest}
                <span className="text-xs text-muted-foreground">{unit}</span>
              </span>
            </div>
            <div className="mt-1 h-16">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 6, right: 6, bottom: 2, left: 6 }}>
                  <YAxis hide domain={["auto", "auto"]} />
                  <Tooltip
                    cursor={{ stroke: "#3f3f46", strokeWidth: 1 }}
                    contentStyle={{
                      background: "#1a1a1e",
                      border: "1px solid #3f3f46",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: "#a1a1aa" }}
                    itemStyle={{ color: "#e4e4e7" }}
                    formatter={(v) => [`${v as number}${unit}`, label]}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke={LINE}
                    strokeWidth={2}
                    dot={{ r: 4, fill: "#ffffff", stroke: LINE, strokeWidth: 1 }}
                    activeDot={{ r: 5 }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      })}
    </section>
  );
}
