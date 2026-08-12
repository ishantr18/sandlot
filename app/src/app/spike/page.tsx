"use client";

// ⚡ POSE SPIKE (Aug 13) — GO/NO-GO test.
// Question: can the browser overlay a live skeleton on a video, on-device?
// Everything in Phase 3 (swing analysis) depends on the answer being yes.
// This is a lab page — not part of the final app UI, but great demo-video material.
import {
  DrawingUtils,
  FilesetResolver,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";
import { useEffect, useRef, useState } from "react";
import VideoRecorder from "@/components/VideoRecorder";

export default function SpikePage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const rafRef = useRef<number>(0);
  const [status, setStatus] = useState("Loading AI model…");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [fps, setFps] = useState(0);

  // Load the pose model ONCE when the page opens. Served from /public —
  // the model runs entirely on this device, no external servers.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
        const landmarker = await PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: "/mediapipe/pose_landmarker_lite.task" },
          runningMode: "VIDEO",
          numPoses: 1,
        });
        if (cancelled) return;
        landmarkerRef.current = landmarker;
        setStatus("Model ready — pick a video of a person moving.");
      } catch (e) {
        setStatus(`Model failed to load: ${(e as Error).message}`);
      }
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      landmarkerRef.current?.close();
    };
  }, []);

  function acceptFile(file: File) {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(URL.createObjectURL(file));
    setStatus("Press play on the video.");
  }

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) acceptFile(file);
  }

  // Every frame while the video plays: ask the model where the body is,
  // then draw dots (joints) and lines (bones) on the canvas overlay.
  function startTracking() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const landmarker = landmarkerRef.current;
    if (!video || !canvas || !landmarker) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d")!;
    const drawer = new DrawingUtils(ctx);

    let lastTime = -1;
    let frames = 0;
    let fpsWindowStart = performance.now();

    const loop = () => {
      if (video.paused || video.ended) return;
      // Guard: never analyze the same timestamp twice (model requires forward time)
      if (video.currentTime !== lastTime) {
        lastTime = video.currentTime;
        const result = landmarker.detectForVideo(video, performance.now());
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (const pose of result.landmarks) {
          drawer.drawConnectors(pose, PoseLandmarker.POSE_CONNECTIONS, {
            color: "#22c55e",
            lineWidth: 3,
          });
          drawer.drawLandmarks(pose, { color: "#ffffff", radius: 4 });
        }
        frames++;
        const now = performance.now();
        if (now - fpsWindowStart >= 1000) {
          setFps(Math.round((frames * 1000) / (now - fpsWindowStart)));
          frames = 0;
          fpsWindowStart = now;
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    setStatus("Tracking…");
  }

  return (
    <main className="mx-auto max-w-md p-6 pb-24">
      <h1 className="mb-2 text-2xl font-bold">⚡ Pose Spike</h1>
      <p className="mb-4 text-sm text-zinc-500">{status} {fps > 0 && `· ${fps} fps`}</p>

      <div className="mb-4 space-y-2 text-sm">
        <VideoRecorder onRecorded={acceptFile} />
        <label className="block cursor-pointer rounded-lg border px-3 py-2 text-center">
          📁 Choose video
          <input type="file" accept="video/*" onChange={handlePick} className="hidden" />
        </label>
      </div>

      {videoUrl && (
        <div className="relative">
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            playsInline
            muted
            onPlay={startTracking}
            className="w-full rounded-lg"
          />
          <canvas
            ref={canvasRef}
            className="pointer-events-none absolute inset-0 h-full w-full"
          />
        </div>
      )}
    </main>
  );
}
