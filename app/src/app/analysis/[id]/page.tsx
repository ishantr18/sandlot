"use client";

// Analysis page — THE screen. Blurred swing video with the AI skeleton
// overlaid (drawn from the stored landmark series, synced to playback),
// real metric tiles, and plain-English findings with assigned drills.
import { DrawingUtils, PoseLandmarker } from "@mediapipe/tasks-vision";
import { doc, getDoc } from "firebase/firestore";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { DRILLS } from "@/lib/drills";
import { db } from "@/lib/firebase";
import type { PoseFrame } from "@/lib/poseExtract";
import type { Finding, SwingMetrics } from "@/lib/swingMetrics";

interface SessionDoc {
  playerId: string;
  videoPathname: string;
  createdAt: number;
  metrics?: SwingMetrics;
  findings?: Finding[];
  landmarks?: string;
}

const SEVERITY_STYLE = {
  major: "border-l-4 border-red-500",
  minor: "border-l-4 border-yellow-500",
  good: "border-l-4 border-primary",
} as const;

export default function AnalysisSessionPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const framesRef = useRef<PoseFrame[]>([]);
  const rafRef = useRef(0);
  const [session, setSession] = useState<SessionDoc | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user || !id) return;
    (async () => {
      const snap = await getDoc(doc(db, "sessions", id));
      if (!snap.exists()) return setError("Session not found.");
      const data = snap.data() as SessionDoc;
      if (data.playerId !== user.uid) return setError("This isn't your session.");
      setSession(data);
      framesRef.current = data.landmarks ? (JSON.parse(data.landmarks) as PoseFrame[]) : [];
      const res = await fetch(
        `/api/video?pathname=${encodeURIComponent(data.videoPathname)}`,
      );
      if (res.ok) {
        const { url } = (await res.json()) as { url: string };
        setVideoUrl(url);
      } else setError("Couldn't load the video (link may have expired — reload).");
    })();
    return () => cancelAnimationFrame(rafRef.current);
  }, [user, id]);

  // Draw the skeleton for whichever stored frame is nearest to playback time
  function startOverlay() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d")!;
    const drawer = new DrawingUtils(ctx);
    const frames = framesRef.current;

    const loop = () => {
      const t = video.currentTime;
      // nearest frame by time (frames are sorted)
      let lo = 0,
        hi = frames.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (frames[mid].t < t) lo = mid + 1;
        else hi = mid;
      }
      const near =
        lo > 0 && Math.abs(frames[lo - 1].t - t) < Math.abs(frames[lo].t - t)
          ? frames[lo - 1]
          : frames[lo];

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (near && Math.abs(near.t - t) < 0.2) {
        const lms = near.lm.map((l) => ({ x: l.x, y: l.y, z: 0, visibility: l.v }));
        drawer.drawConnectors(lms, PoseLandmarker.POSE_CONNECTIONS, {
          color: "#22c55e",
          lineWidth: 3,
        });
        drawer.drawLandmarks(lms, { color: "#ffffff", radius: 3 });
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(loop);
  }

  if (!loading && !user) {
    return (
      <main className="mx-auto max-w-md p-6 pb-28">
        <p className="rounded-2xl bg-card p-6 text-sm text-muted-foreground">
          <Link href="/auth" className="text-primary underline">
            Sign in
          </Link>{" "}
          to view your analysis.
        </p>
      </main>
    );
  }

  const m = session?.metrics;
  const tiles = m
    ? [
        { label: "Hips→shoulders gap", value: m.sequenceGapMs, unit: "ms" },
        { label: "Hip–shoulder sep", value: m.hipShoulderSepDeg, unit: "°" },
        { label: "Swing tempo", value: m.tempoSec, unit: "s" },
        { label: "Head drift (after plant)", value: m.headDriftPct, unit: "%" },
        { label: "Stride", value: m.stridePct, unit: "%" },
        { label: "Front-knee brace", value: m.kneeBraceDeg, unit: "°" },
        { label: "Shoulder tilt", value: m.shoulderTiltDeg, unit: "°" },
        { label: "Tracking quality", value: Math.round((m.trackingQuality ?? 0) * 100), unit: "%" },
      ]
    : [];

  return (
    <main className="mx-auto max-w-md p-6 pb-28 lg:max-w-5xl lg:px-10 lg:pt-12">
      <div className="mb-6 flex items-center gap-3 lg:mb-10">
        <Link href="/progress" className="rounded-full bg-card p-2">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-4xl font-bold tracking-tight lg:text-6xl">Analysis</h1>
      </div>

      {error && <p className="mb-4 rounded-2xl bg-card p-4 text-sm text-destructive">{error}</p>}

      <div className="lg:grid lg:grid-cols-5 lg:items-start lg:gap-8">
        <div className="lg:col-span-3">
          <section className="relative mb-4 overflow-hidden rounded-2xl bg-card">
            {videoUrl ? (
              <>
                <video
                  ref={videoRef}
                  src={videoUrl}
                  controls
                  playsInline
                  muted
                  onPlay={startOverlay}
                  onSeeked={startOverlay}
                  className="w-full"
                />
                <canvas
                  ref={canvasRef}
                  className="pointer-events-none absolute inset-0 h-full w-full"
                />
              </>
            ) : (
              <div className="flex aspect-video items-center justify-center text-sm text-muted-foreground">
                Loading video…
              </div>
            )}
          </section>
          <p className="mb-4 text-xs text-muted-foreground">
            ▶ Play or scrub — the green skeleton is the AI&apos;s view of your body,
            computed on your device.
          </p>
        </div>

        <div className="lg:col-span-2">
          <section className="mb-4 grid grid-cols-2 gap-2 lg:gap-4">
            {tiles.map((t) => (
              <div key={t.label} className="rounded-2xl bg-card p-4">
                <div className="font-mono text-3xl font-bold text-primary">
                  {t.value}
                  <span className="text-lg text-muted-foreground">{t.unit}</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{t.label}</div>
              </div>
            ))}
          </section>

          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Coaching</h2>
          <div className="space-y-2">
            {session?.findings?.map((f, i) => (
              <section key={i} className={`rounded-2xl bg-card p-4 ${SEVERITY_STYLE[f.severity]}`}>
                <p className="text-sm">{f.message}</p>
                {f.drillIds.length > 0 && (
                  <p className="mt-2 text-xs text-primary">
                    → Drill:{" "}
                    {f.drillIds
                      .map((id) => DRILLS.find((d) => d.id === id)?.name ?? id)
                      .join(" · ")}
                  </p>
                )}
              </section>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
