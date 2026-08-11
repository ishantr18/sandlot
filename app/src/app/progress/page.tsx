// WIREFRAME — Progress screen
// [Metric-over-time charts] [Session history list]
export default function ProgressPage() {
  return (
    <main className="mx-auto max-w-md p-6 pb-24">
      <h1 className="mb-4 text-2xl font-bold">Progress</h1>

      <section className="mb-4 flex h-40 items-center justify-center rounded-lg border text-zinc-400">
        Improvement charts (Phase 4)
      </section>

      <h2 className="mb-2 font-semibold text-zinc-700">Session history</h2>
      <section className="rounded-lg border p-4 text-sm text-zinc-400">
        Your analyzed swings will appear here.
      </section>
    </main>
  );
}
