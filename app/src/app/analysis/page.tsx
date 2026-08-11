// WIREFRAME — Analysis screen
// [Video player w/ skeleton overlay + scrubber]
// [4 metric cards] [Findings in plain English] [→ assigned drills]
export default function AnalysisPage() {
  return (
    <main className="mx-auto max-w-md p-6 pb-24">
      <h1 className="mb-4 text-2xl font-bold">Analysis</h1>

      <section className="mb-4 flex h-56 items-center justify-center rounded-lg bg-zinc-900 text-zinc-400">
        Video + skeleton overlay (Phase 3)
      </section>

      <section className="mb-4 grid grid-cols-2 gap-2">
        {["Hip–shoulder sep.", "Swing tempo", "Head movement", "Stride"].map((m) => (
          <div key={m} className="rounded-lg border p-3">
            <div className="text-xs text-zinc-500">{m}</div>
            <div className="text-lg font-bold">—</div>
          </div>
        ))}
      </section>

      <section className="rounded-lg border p-4 text-sm text-zinc-600">
        Findings appear here: “Your hips fire late — try Drill 3.”
      </section>
    </main>
  );
}
