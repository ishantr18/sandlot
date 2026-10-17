"use client";

// In-browser video recorder — works on laptops (webcam) AND phones.
// getUserMedia = ask permission and get a live camera stream.
// MediaRecorder = capture that stream into a real video file, all on-device.
// Flow: open camera → 3-2-1 countdown → record → review → use / retake / discard.
import { Camera, Check, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Notice from "@/components/Notice";
import { pickMimeType } from "@/lib/videoFormat";

type Mode = "idle" | "live" | "countdown" | "recording" | "review";

export default function VideoRecorder({
  onRecorded,
  onUseLibrary,
}: {
  onRecorded: (file: File) => void;
  onUseLibrary?: () => void; // camera failed → offer a saved video instead
}) {
  const liveRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const [mode, setMode] = useState<Mode>("idle");
  const [count, setCount] = useState(3);
  const [error, setError] = useState("");
  // Held during review — nothing leaves the recorder until "Use this video"
  const [recorded, setRecorded] = useState<{ file: File; url: string } | null>(null);

  function cleanupStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  // Make sure the camera light goes OFF if the user navigates away
  useEffect(() => cleanupStream, []);

  // Attach the live stream to the <video> AFTER React has rendered it.
  // (Setting it during the click handler was a race — sometimes the element
  // didn't exist yet, which showed a black preview.)
  useEffect(() => {
    if (mode !== "idle" && mode !== "review" && liveRef.current && streamRef.current) {
      liveRef.current.srcObject = streamRef.current;
    }
  }, [mode]);

  // Countdown timers live in a ref so Cancel / unmount can stop them
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  function clearTimers() {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }
  useEffect(() => clearTimers, []);

  async function openCamera() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // "environment" = rear camera on phones; laptops just use the webcam
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false, // swing analysis needs no sound — fewer permissions = better privacy
      });
      streamRef.current = stream;
      setMode("live");
    } catch (e) {
      setError(
        (e as Error).name === "NotAllowedError"
          ? "Camera permission denied — allow camera access in the browser and try again."
          : `Camera error: ${(e as Error).message}`,
      );
    }
  }

  // 3 → 2 → 1 → start recording for real
  function startCountdown() {
    clearTimers();
    setCount(3);
    setMode("countdown");
    timersRef.current = [
      setTimeout(() => setCount(2), 1000),
      setTimeout(() => setCount(1), 2000),
      setTimeout(beginRecording, 3000),
    ];
  }

  function beginRecording() {
    const stream = streamRef.current;
    if (!stream) return;
    const { mime, ext } = pickMimeType();
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const type = recorder.mimeType || mime || "video/webm";
      const blob = new Blob(chunksRef.current, { type });
      cleanupStream();
      // Guard: some machines produce empty/broken recordings — catch it here
      if (blob.size < 2000) {
        setError("Recording came out empty — that's a browser hiccup, try again.");
        setMode("idle");
        return;
      }
      const file = new File([blob], `recording-${Date.now()}.${ext}`, { type });
      // Don't hand the clip over yet — let the user review it first
      setRecorded({ file, url: URL.createObjectURL(blob) });
      setMode("review");
    };
    recorderRef.current = recorder;
    recorder.start(250); // collect data every 250ms, not only at the end
    setMode("recording");
  }

  function stopRecording() {
    recorderRef.current?.stop();
  }

  function cancel() {
    clearTimers();
    if (recorderRef.current && mode === "recording") recorderRef.current.stop();
    else {
      cleanupStream();
      setMode("idle");
    }
  }

  function discardRecording() {
    if (recorded) URL.revokeObjectURL(recorded.url);
    setRecorded(null);
    setMode("idle");
  }

  function retake() {
    if (recorded) URL.revokeObjectURL(recorded.url);
    setRecorded(null);
    void openCamera();
  }

  function useRecording() {
    if (!recorded) return;
    const { file, url } = recorded;
    URL.revokeObjectURL(url);
    setRecorded(null);
    setMode("idle");
    onRecorded(file);
  }

  // Chrome's MediaRecorder writes files with duration = Infinity (a known bug:
  // it can't know the length while still recording). Some browsers then render
  // BLACK until you seek. Fix: seek far ahead, let the browser index the file,
  // then jump back to the start and play.
  function fixBlackPreview(e: React.SyntheticEvent<HTMLVideoElement>) {
    const v = e.currentTarget;
    if (v.duration === Infinity || Number.isNaN(v.duration)) {
      v.currentTime = 1e7;
      v.ontimeupdate = () => {
        v.ontimeupdate = null;
        v.currentTime = 0;
        void v.play();
      };
    }
  }

  if (mode === "idle") {
    return (
      <div>
        <button
          onClick={openCamera}
          className="flex h-56 w-full flex-col items-center justify-center gap-3 rounded-2xl bg-card text-sm font-medium transition-colors hover:bg-secondary wide:h-72"
        >
          <Camera className="h-8 w-8 text-primary" />
          <span className="text-muted-foreground">Record now</span>
        </button>
        {error && (
          <Notice
            tone="error"
            title="The camera didn't open"
            className="mt-2"
            actions={[
              ...(onUseLibrary ? [{ label: "Use a saved video", onClick: onUseLibrary }] : []),
              { label: "Try a sample swing", href: "/sample" },
            ]}
          >
            {error}
          </Notice>
        )}
      </div>
    );
  }

  if (mode === "review" && recorded) {
    return (
      <div className="overflow-hidden rounded-2xl bg-card p-2">
        <video
          src={recorded.url}
          controls
          autoPlay
          muted
          playsInline
          loop
          onLoadedMetadata={fixBlackPreview}
          className="w-full rounded"
        />
        <div className="mt-2 flex gap-2">
          <button
            onClick={useRecording}
            className="flex-1 rounded-full bg-primary py-2 text-sm font-semibold text-primary-foreground"
          >
            <Check className="mr-1 inline h-4 w-4" />Use this video
          </button>
          <button onClick={retake} className="rounded-full border border-border px-3 py-2 text-sm">
            <RotateCcw className="mr-1 inline h-4 w-4" />Retake
          </button>
          <button
            onClick={discardRecording}
            aria-label="Discard recording"
            className="rounded-full border border-border px-3 py-2 text-sm"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-card p-2">
      <div className="relative">
        <video ref={liveRef} autoPlay muted playsInline className="w-full rounded" />
        {mode === "countdown" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-8xl font-bold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
              {count}
            </span>
          </div>
        )}
        {mode === "recording" && (
          <span className="absolute left-2 top-2 flex items-center gap-1 rounded bg-black/60 px-2 py-1 text-xs font-semibold text-red-400">
            <span className="animate-pulse">●</span> REC
          </span>
        )}
      </div>
      <div className="mt-2 flex gap-2">
        {mode === "live" && (
          <button
            onClick={startCountdown}
            className="flex-1 rounded-full bg-red-600 py-2 text-sm font-semibold text-white"
          >
            ● Record (3s countdown)
          </button>
        )}
        {mode === "countdown" && (
          <div className="flex-1 rounded-full bg-secondary py-2 text-center text-sm font-semibold text-muted-foreground">
            Get in position…
          </div>
        )}
        {mode === "recording" && (
          <button
            onClick={stopRecording}
            className="flex-1 rounded-full bg-red-600 py-2 text-sm font-semibold text-white"
          >
            ■ Stop
          </button>
        )}
        <button onClick={cancel} className="rounded-full border border-border px-4 py-2 text-sm">
          Cancel
        </button>
      </div>
    </div>
  );
}
