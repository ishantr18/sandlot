// WIREFRAME — Drills screen
// [Assigned drills (from findings or mentor)] [Drill library list]
export default function DrillsPage() {
  return (
    <main className="mx-auto max-w-md p-6 pb-24">
      <h1 className="mb-4 text-2xl font-bold">Drills</h1>

      <h2 className="mb-2 font-semibold text-zinc-700">Assigned to you</h2>
      <section className="mb-6 rounded-lg border p-4 text-sm text-zinc-400">
        No drills assigned yet — upload a swing to get started.
      </section>

      <h2 className="mb-2 font-semibold text-zinc-700">Drill library</h2>
      <section className="space-y-2">
        {["Hip fire tee drill", "Balance-beam swings", "Stride ladder"].map((d) => (
          <div key={d} className="rounded-lg border p-3 text-sm">{d}</div>
        ))}
      </section>
    </main>
  );
}
