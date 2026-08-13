"use client";

// Upload screen — the round trip: pick → preview → upload (private) → signed playback.
// Phase 2 will insert the on-device face-blur step between "pick" and "upload".
import { upload } from "@vercel/blob/client";
import { addDoc, collection } from "firebase/firestore";
import Link from "next/link";
import { useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import FilmingGuide from "@/components/FilmingGuide";
import VideoRecorder from "@/components/VideoRecorder";
import { db } from "@/lib/firebase";

type Stage = "pick" | "ready" | "uploading" | "done" | "error";

export default function UploadPage() {
  const { user, loading } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("pick");
  const [progress, setProgress] = useState(0);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  // One entry point whether the video was recorded in-browser or picked from disk.
  // Object URL = local, in-memory address for the file — preview WITHOUT uploading.
  function acceptFile(picked: File) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(picked);
    setPreviewUrl(URL.createObjectURL(picked));
    setPlaybackUrl(null);
    setStage("ready");
  }

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    if (picked) acceptFile(picked);
    e.target.value = ""; // allow re-picking the same file after removing it
  }

  function removeVideo() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setPlaybackUrl(null);
    setStage("pick");
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

      // Session record → Firestore, so this swing shows up under Progress
      if (user) {
        await addDoc(collection(db, "sessions"), {
          playerId: user.uid,
          videoPathname: blob.pathname, // path in the private store, NOT a public URL
          createdAt: Date.now(),
          status: "uploaded",
        });
      }

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

      {!loading && !user && (
        <Link
          href="/auth"
          className="mb-4 block rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm text-amber-800"
        >
          👤 <span className="underline">Sign in</span> so your swings are saved to your
          Progress page.
        </Link>
      )}

      <FilmingGuide />

      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        onChange={handlePick}
        className="hidden"
      />

      {!playbackUrl && (
        <div className="mb-4 grid grid-cols-2 gap-2">
          {/* In-browser recorder: works on laptop webcams AND phone cameras */}
          <VideoRecorder onRecorded={acceptFile} />
          <button
            onClick={() => inputRef.current?.click()}
            className="flex h-40 flex-col items-center justify-center rounded-lg border-2 border-dashed"
          >
            <span className="text-2xl">📁</span>
            <span className="mt-1 text-sm text-zinc-500">
              {file ? file.name : "Choose from library"}
            </span>
          </button>
        </div>
      )}

      {previewUrl && !playbackUrl && (
        <div className="mb-4">
          <video src={previewUrl} controls playsInline className="w-full rounded-lg" />
          <button
            onClick={removeVideo}
            className="mt-2 w-full rounded-lg border py-2 text-sm text-red-600"
          >
            🗑 Remove video
          </button>
        </div>
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
