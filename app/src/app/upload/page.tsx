// WIREFRAME — Upload screen
// [Filming guide: side view, full body, propped phone]
// [Pick/record video] → (Phase 2: on-device face blur here) → [Upload]
export default function UploadPage() {
  return (
    <main className="mx-auto max-w-md p-6 pb-24">
      <h1 className="mb-4 text-2xl font-bold">Upload a Swing</h1>

      <section className="mb-4 rounded-lg border p-4 text-sm text-zinc-600">
        📱 Filming guide: side view · full body in frame · phone propped, not handheld
      </section>

      <section className="mb-4 flex h-48 items-center justify-center rounded-lg border-2 border-dashed">
        <span className="text-zinc-400">Tap to record or choose a video</span>
      </section>

      <section className="mb-4 rounded-lg border p-4 text-sm text-zinc-600">
        🔒 Faces are blurred on your device before anything uploads.
      </section>

      <button className="w-full rounded-lg bg-green-700 py-3 font-semibold text-white" disabled>
        Analyze my swing
      </button>
    </main>
  );
}
