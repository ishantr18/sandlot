"use client";

// Upload screen — the round trip: pick → preview → upload (private) → signed playback.
// Phase 2 will insert the on-device face-blur step between "pick" and "upload".
import { upload } from "@vercel/blob/client";
import { useRef, useState } from "react";

type Stage = "pick" | "ready" | "uploading" | "done" | "error";

export default function UploadPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("pick");
  const [progress, setProgress] = useState(0);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    if (!picked) return;
    // Object URL = local, in-memory address for the picked file.
    // This is how we preview WITHOUT uploading anything.
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(picked);
    setPreviewUrl(URL.createObjectURL(picked));
    setPlaybackUrl(null);
    setStage("ready");
  }

  async function handleUploadClick() {
    if (!file) return;
    setStage("uploading");
    setProgress(0);
    try {
      // Client upload: browser asks /api/upload for a short-lived permission
      // token, then sends the file straight to the store (no server bottleneck).
      const blob = await upload(`videos/${file.name}`, file, {
        access: "private",
        handleUploadUrl: "/api/upload",
        onUploadProgress: ({ percentage }) => setProgress(percentage),
      });

      // Prove the round trip: fetch an expiring signed URL and play from the store.
      const res = await fetch(
        `/api/video?pathname=${encodeURIComponent(blob.pathname)}`,
      );
      if (!res.ok) throw new Error("Could not get playback URL");
      const { url } = (await res.json()) as { url: string };
      setPlaybackUrl(url);
      setStage("done");
    } catch (err) {
      setErrorMsg((err as Error).message);
      setStage("error");
    }
  }

  return (
    <main className="mx-auto max-w-md p-6 pb-24">
      <h1 className="mb-4 text-2xl font-bold">Upload a Swing</h1>

      <section className="mb-4 rounded-lg border p-4 text-sm text-zinc-600">
        📱 Filming guide: side view · full body in frame · phone propped, not handheld
      </section>

      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        onChange={handlePick}
        className="hidden"
      />

      {!playbackUrl && (
        <button
          onClick={() => inputRef.current?.click()}
          className="mb-4 flex h-48 w-full items-center justify-center rounded-lg border-2 border-dashed"
        >
          {file ? (
            <span className="px-4 text-sm">{file.name}</span>
          ) : (
            <span className="text-zinc-400">Tap to record or choose a video</span>
          )}
        </button>
      )}

      {previewUrl && !playbackUrl && (
        <video src={previewUrl} controls playsInline className="mb-4 w-full rounded-lg" />
      )}

      {playbackUrl && (
        <div className="mb-4">
          <p className="mb-2 text-sm font-semibold text-green-700">
            ✅ Uploaded — now playing from private storage via an expiring link:
          </p>
          <video src={playbackUrl} controls playsInline className="w-full rounded-lg" />
        </div>
      )}

      <section className="mb-4 rounded-lg border p-4 text-sm text-zinc-600">
        🔒 Coming in Phase 2: faces blurred on your device before anything uploads.
      </section>

      {stage === "uploading" && (
        <div className="mb-4">
          <div className="h-2 w-full overflow-hidden rounded bg-zinc-200">
            <div
              className="h-full bg-green-700 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-1 text-center text-xs text-zinc-500">{Math.round(progress)}%</p>
        </div>
      )}

      {stage === "error" && (
        <p className="mb-4 text-sm text-red-600">Upload failed: {errorMsg}</p>
      )}

      <button
        onClick={handleUploadClick}
        disabled={stage !== "ready"}
        className="w-full rounded-lg bg-green-700 py-3 font-semibold text-white disabled:opacity-40"
      >
        {stage === "uploading"
          ? "Uploading…"
          : stage === "done"
            ? "Done — pick another to re-test"
            : "Analyze my swing"}
      </button>
    </main>
  );
}
