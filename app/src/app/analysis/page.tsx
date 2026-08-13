// Analysis — full-bleed video + 2×2 stat tiles (huge mono numbers).
// The pose engine wires in here in Phase 3 (Aug 19–24).
const METRICS = [
  { label: "Hip–shoulder sep", unit: "°" },
  { label: "Swing tempo", unit: "s" },
  { label: "Head movement", unit: "cm" },
  { label: "Stride", unit: "%" },
];

export default function AnalysisPage() {
  return (
    <main className="mx-auto max-w-md p-6 pb-28">
      <h1 className="mb-6 text-4xl font-bold tracking-tight">Analysis</h1>

      <section className="mb-4 flex aspect-video items-center justify-center rounded-2xl bg-card text-sm text-muted-foreground">
        Your swing + AI skeleton overlay (Phase 3)
      </section>

      <section className="mb-4 grid grid-cols-2 gap-2">
        {METRICS.map((m) => (
          <div key={m.label} className="rounded-2xl bg-card p-4">
            <div className="font-mono text-3xl font-bold text-primary">
              –<span className="text-lg text-muted-foreground">{m.unit}</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{m.label}</div>
          </div>
        ))}
      </section>

      <section className="rounded-2xl bg-card p-4 text-sm text-muted-foreground">
        Plain-English findings appear here — &ldquo;Your hips fire late → Hip fire tee
        drill assigned.&rdquo;
      </section>
    </main>
  );
}
