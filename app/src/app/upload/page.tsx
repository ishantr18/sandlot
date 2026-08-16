"use client";

// Upload screen — pick → preview → upload (private) → signed playback.
// Phase 2 inserts the on-device face-blur step between "pick" and "upload".
import { upload } from "@vercel/blob/client";
import { addDoc, collection } from "firebase/firestore";
import { FolderOpen, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import FilmingGuide from "@/components/FilmingGuide";
import VideoRecorder from "@/components/VideoRecorder";
import { blurVideo } from "@/lib/faceblur";
import { db } from "@/lib/firebase";

type Stage = "pick" | "blurring" | "ready" | "uploading" | "done" | "error";

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
  // Faces are blurred ON-DEVICE here, before anything else can happen — the
  // preview below is already the blurred file, and it's the ONLY file that
  // can ever be uploaded.
  async function acceptFile(picked: File) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPlaybackUrl(null);
    setStage("blurring");
    setProgress(0);
    try {
      const blurred = await blurVideo(picked, (f) => setProgress(f * 100));
      setFile(blurred);
      setPreviewUrl(URL.createObjectURL(blurred));
      setStage("ready");
    } catch (err) {
      setErrorMsg(`Couldn't blur this video (${(err as Error).message}) — nothing was uploaded.`);
      setFile(null);
      setPreviewUrl(null);
      setStage("error");
    }
  }

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    if (picked) acceptFile(picked);
    e.target.value = "";
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
      const blob = await upload(`videos/${file.name}`, file, {
        access: "private",
        handleUploadUrl: "/api/upload",
        onUploadProgress: ({ percentage }) => setProgress(percentage),
      });

      if (user) {
        await addDoc(collection(db, "sessions"), {
          playerId: user.uid,
          videoPathname: blob.pathname,
          createdAt: Date.now(),
          status: "uploaded",
        });
      }

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
    <main className="mx-auto max-w-md p-6 pb-28 lg:max-w-5xl lg:px-10 lg:pt-12">
      <h1 className="mb-6 text-4xl font-bold tracking-tight lg:mb-10 lg:text-6xl">Upload</h1>
      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-8">
      <div>

      {!loading && !user && (
        <Link
          href="/auth"
          className="mb-4 block rounded-2xl bg-card p-4 text-sm text-muted-foreground"
        >
          👤 <span className="text-primary underline">Sign in</span> so your swings are
          saved to your Progress page.
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
          <VideoRecorder onRecorded={acceptFile} />
          <button
            onClick={() => inputRef.current?.click()}
            className="flex h-40 flex-col items-center justify-center gap-2 rounded-2xl bg-card text-xs font-medium"
          >
            <FolderOpen className="h-5 w-5 text-primary" />
            <span className="px-2 text-muted-foreground">
              {file ? file.name : "Choose from library"}
            </span>
          </button>
        </div>
      )}

      </div>

      <div>
      {stage === "blurring" && (
        <div className="mb-4 rounded-2xl bg-card p-4">
          <p className="mb-2 text-sm font-semibold">🔒 Blurring faces on your device…</p>
          <div className="h-2 w-full overflow-hidden rounded bg-secondary">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            The original video never leaves this device.
          </p>
        </div>
      )}

      {previewUrl && !playbackUrl && (
        <div className="mb-4 overflow-hidden rounded-2xl bg-card">
          <p className="p-3 text-sm font-semibold text-primary">
            🔒 Faces blurred on your device ✓ — this is the only version that can upload:
          </p>
          <video src={previewUrl} controls playsInline className="w-full" />
          <button
            onClick={removeVideo}
            className="flex w-full items-center justify-center gap-2 p-3 text-sm text-destructive"
          >
            <Trash2 className="h-4 w-4" /> Remove video
          </button>
        </div>
      )}

      {playbackUrl && (
        <div className="mb-4 overflow-hidden rounded-2xl bg-card">
          <p className="p-3 text-sm font-semibold text-primary">
            ✅ Uploaded — playing from private storage via an expiring link:
          </p>
          <video src={playbackUrl} controls playsInline className="w-full" />
        </div>
      )}

      {stage === "uploading" && (
        <div className="mb-4">
          <div className="h-2 w-full overflow-hidden rounded bg-secondary">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-1 text-center text-xs text-muted-foreground">
            {Math.round(progress)}%
          </p>
        </div>
      )}

      {stage === "error" && (
        <p className="mb-4 text-sm text-destructive">Upload failed: {errorMsg}</p>
      )}

      <button
        onClick={handleUploadClick}
        disabled={stage !== "ready"}
        className="w-full rounded-full bg-primary py-3 font-semibold text-primary-foreground disabled:opacity-40"
      >
        {stage === "uploading"
          ? "Uploading…"
          : stage === "done"
            ? "Done — pick another to re-test"
            : "Analyze my swing"}
      </button>
      </div>
      </div>
    </main>
  );
}
