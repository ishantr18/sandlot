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
import { useRouter } from "next/navigation";
import { blurVideo, type BlurStage } from "@/lib/faceblur";
import { extractPose } from "@/lib/poseExtract";
import { analyzeSwing } from "@/lib/swingMetrics";
import { blacklistMime } from "@/lib/videoFormat";
import { db } from "@/lib/firebase";

type Stage = "pick" | "blurring" | "ready" | "analyzing" | "uploading" | "done" | "error";

const BLUR_STAGE_LABEL: Record<BlurStage, string> = {
  scan: "🔍 Scanning every frame for faces and heads…",
  render: "🔒 Pixelating faces on your device…",
  verify: "🕵️ Verifying anonymity of the result…",
};

export default function UploadPage() {
  const router = useRouter();
  const { user, profile, loading } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("pick");
  const [progress, setProgress] = useState(0);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [blurStage, setBlurStage] = useState<BlurStage>("scan");
  const [auditCount, setAuditCount] = useState<number | null>(null);

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
      const { file: blurred, auditFacesFound } = await blurVideo(picked, (s, f) => {
        setBlurStage(s);
        setProgress(f * 100);
      });
      setAuditCount(auditFacesFound);
      if (auditFacesFound > 0) {
        // A face was still detectable after two passes (the second with
        // bigger boxes). The privacy promise is "verified or it doesn't
        // upload" — so it doesn't upload.
        setErrorMsg(
          "We couldn't make sure every face is hidden in this clip — usually another person close to the camera. Film again with only you in the frame. Nothing was uploaded.",
        );
        setStage("error");
        return;
      }
      setFile(blurred);
      setPreviewUrl(URL.createObjectURL(blurred));
      setStage("ready");
    } catch (err) {
      const detail = (err as Error).message;
      const isFormat =
        (err as Error).name === "VideoFormatError" ||
        /codec|format|decode/i.test(detail);
      const fromOurRecorder = picked.name.startsWith("recording-");
      if (isFormat && fromOurRecorder) {
        // This device recorded a file it can't read back — remember the bad
        // format; the next recording automatically uses a different one.
        blacklistMime(picked.type);
      }
      setErrorMsg(
        isFormat && fromOurRecorder
          ? `This device's recorder produced an unreadable file (${detail}). That format is now blocked on this device — press 🎥 Record now again and the app will automatically try a different format.`
          : isFormat
            ? `This browser can't read that video format (${detail}). If the file came from an iPhone: use 🎥 Record now instead, open this page in Safari, or set the iPhone camera to Most Compatible (Settings → Camera → Formats). Nothing was uploaded.`
            : `Couldn't blur this video (${detail}) — nothing was uploaded.`,
      );
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
    if (!user) {
      // Uploads need an account: the server only issues upload tokens to
      // signed-in users, and every swing belongs to a player.
      setErrorMsg("Sign in to upload your swing.");
      setStage("error");
      return;
    }
    try {
      // 1) Run the swing engine ON-DEVICE against the blurred file
      setStage("analyzing");
      setProgress(0);
      const frames = await extractPose(file, (f) => setProgress(f * 100));
      const analysis = analyzeSwing(frames);

      // Quality gate: bad clips never reach the cloud
      if (!analysis.ok) {
        setErrorMsg(`Clip rejected by the analysis engine: ${analysis.rejectReason}`);
        setStage("error");
        return;
      }

      // 2) Upload the blurred video
      setStage("uploading");
      setProgress(0);
      const blob = await upload(`videos/${file.name}`, file, {
        access: "private",
        handleUploadUrl: "/api/upload",
        // Proves who's uploading — the server refuses anyone not signed in
        clientPayload: await user.getIdToken(),
        onUploadProgress: ({ percentage }) => setProgress(percentage),
      });

      // 3) Save the session: video path + landmark series + metrics + findings.
      // No name on the record — certified coaches read sessions, and players
      // are anonymous to them.
      const sessionDoc = await addDoc(collection(db, "sessions"), {
        playerId: user.uid,
        videoPathname: blob.pathname,
        createdAt: Date.now(),
        status: "analyzed",
        metrics: analysis.metrics,
        findings: analysis.findings,
        landmarks: JSON.stringify(frames),
      });
      router.push(`/analysis/${sessionDoc.id}`);
    } catch (err) {
      setErrorMsg((err as Error).message);
      setStage("error");
    }
  }

  if (profile?.role === "mentor" || profile?.role === "guardian") {
    return (
      <main className="mx-auto max-w-md p-6 pb-28">
        <h1 className="mb-6 text-4xl font-bold tracking-tight">Upload</h1>
        <p className="rounded-2xl bg-card p-6 text-sm text-muted-foreground">
          Uploading swings is a player thing.{" "}
          <Link href={profile.role === "mentor" ? "/coach" : "/family"} className="text-primary underline">
            {profile.role === "mentor" ? "Head to your review queue →" : "See your player's activity →"}
          </Link>
        </p>
      </main>
    );
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
            className="flex h-56 flex-col items-center justify-center gap-3 rounded-2xl bg-card text-sm font-medium transition-colors hover:bg-secondary lg:h-72"
          >
            <FolderOpen className="h-8 w-8 text-primary" />
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
          <p className="mb-2 text-sm font-semibold">{BLUR_STAGE_LABEL[blurStage]}</p>
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
            {auditCount === 0
              ? "🕵️ Anonymity verified — 0 faces detectable in this video. Only this version can upload:"
              : "⚠️ Faces pixelated on your device, but this device couldn't double-check the result — look over the preview before uploading:"}
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

      {stage === "analyzing" && (
        <div className="mb-4 rounded-2xl bg-card p-4">
          <p className="mb-2 text-sm font-semibold">📐 Analyzing your swing on this device…</p>
          <div className="h-2 w-full overflow-hidden rounded bg-secondary">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
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
        {stage === "analyzing"
          ? "Analyzing…"
          : stage === "uploading"
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
