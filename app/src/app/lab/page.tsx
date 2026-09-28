"use client";

// 🧪 LAB — engine tuning bench (dev page).
// Drop test clips in, see raw metrics + verdicts side by side.
// Used to calibrate thresholds in lib/swingMetrics.ts against test-clips/.
import { useState } from "react";
import { extractPose } from "@/lib/poseExtract";
import { analyzeSwing, type SwingAnalysis } from "@/lib/swingMetrics";

interface Row {
  name: string;
  frames: number;
  result: SwingAnalysis;
}

export default function LabPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState("");

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    for (const f of files) {
      setBusy(`Analyzing ${f.name}…`);
      try {
        const frames = await extractPose(f);
        const result = analyzeSwing(frames);
        setRows((r) => [...r, { name: f.name, frames: frames.length, result }]);
      } catch (err) {
        setRows((r) => [
          ...r,
          {
            name: f.name,
            frames: 0,
            result: { ok: false, rejectReason: (err as Error).message },
          },
        ]);
      }
    }
    setBusy("");
    e.target.value = "";
  }

  return (
    <main className="mx-auto max-w-5xl p-6 pb-28 lg:px-10 lg:pt-12">
      <h1 className="mb-2 text-4xl font-bold tracking-tight">🧪 Lab</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Engine tuning bench — select one or more clips (multi-select works). Raw
        numbers only, nothing uploads.
      </p>

      <label className="mb-6 block cursor-pointer rounded-2xl bg-card p-6 text-center text-sm">
        📁 Choose test clips
        <input type="file" accept="video/*" multiple onChange={handlePick} className="hidden" />
      </label>

      {busy && <p className="mb-4 text-sm text-primary">{busy}</p>}

      <div className="space-y-4">
        {rows.map((r, i) => (
          <section key={i} className="rounded-2xl bg-card p-4">
            <h2 className="mb-2 font-mono text-sm font-bold">
              {r.name} <span className="text-muted-foreground">({r.frames} frames)</span>
            </h2>
            {r.result.ok ? (
              <>
                <div className="grid grid-cols-3 gap-2 text-xs sm:grid-cols-4 lg:grid-cols-6">
                  {Object.entries(r.result.metrics).map(([k, v]) => (
                    <div key={k} className="rounded-lg bg-secondary p-2">
                      <div className="font-mono text-sm font-bold text-primary">{v}</div>
                      <div className="text-muted-foreground">{k}</div>
                    </div>
                  ))}
                </div>
                <ul className="mt-3 space-y-1 text-xs">
                  {r.result.findings.map((f, j) => (
                    <li key={j}>
                      {f.severity === "major" ? "🔴" : f.severity === "minor" ? "🟡" : "🟢"}{" "}
                      {f.message}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-xs text-destructive">REJECTED: {r.result.rejectReason}</p>
            )}
          </section>
        ))}
      </div>
    </main>
  );
}
