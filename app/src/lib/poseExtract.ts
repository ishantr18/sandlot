// Pose extraction — turns a (blurred) swing video into a time series of
// 33 body landmarks per frame. Runs entirely on-device; only the numeric
// series (not video) is stored alongside the session.
//
// SAMPLING STRATEGY (v2): deterministic seeking, not real-time playback.
//
// v1 played the clip at 1x and kept whatever frames requestAnimationFrame
// happened to land on. Three problems, all of which cost us real videos:
//   1. The sample rate was a property of the DEVICE, not the code. On a 30Hz
//      display or a loaded phone we silently sampled at ~30fps or worse —
//      the exact condition that produced the original `tempo: 0` bug.
//   2. Analysis took at least as long as the clip played.
//   3. Anything past 15s was discarded, so a swing at 0:20 didn't exist.
//
// v2 seeks to explicit timestamps and records the frame that actually
// decoded (via requestVideoFrameCallback's mediaTime where available), in
// two passes:
//   Pass 1 — coarse (12fps, the whole clip up to 60s): find the swing.
//   Pass 2 — fine (60fps, a window around it): measure the swing.
// Sampling only the swing at full rate also cuts the stored series to a
// fraction of its old size, which keeps the session inside Firestore's 1MB
// document limit instead of gambling on clip length.
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import { ensureFiniteDuration } from "./faceblur";

export interface Lm {
  x: number; // normalized 0..1 (fraction of frame width)
  y: number; // normalized 0..1 (fraction of frame height)
  v: number; // visibility/confidence 0..1
}
export interface PoseFrame {
  t: number; // seconds into the clip
  lm: Lm[]; // 33 landmarks (MediaPipe pose topology)
}

let posePromise: Promise<PoseLandmarker> | null = null;
function getPose() {
  if (!posePromise) {
    posePromise = (async () => {
      const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
      return PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: "/mediapipe/pose_landmarker_lite.task" },
        runningMode: "VIDEO",
        numPoses: 1,
      });
    })();
  }
  return posePromise;
}

// MediaPipe requires strictly increasing timestamps across detectForVideo
// calls; our seeks jump backwards between passes, so we keep our own clock.
let ts = 0;
function nextTs() {
  ts = Math.max(ts + 1, performance.now());
  return ts;
}

const r4 = (n: number) => Math.round(n * 10000) / 10000;
const r2 = (n: number) => Math.round(n * 100) / 100;

const COARSE_FPS = 12; // enough to locate a swing, cheap enough to scan a long clip
const FINE_FPS = 60; // a 150ms swing needs a fine clock (the tempo=0 lesson)
const MAX_SCAN_SECONDS = 60; // was 15 — a swing late in a long clip used to be invisible
const PRE_ROLL = 1.2; // seconds of fine sampling before peak hand speed (load + stride)
const POST_ROLL = 0.8; // and after (extension + finish)
const MAX_COARSE_FRAMES = 240; // long clips scan at a lower rate rather than blow the budget
const MAX_FRAMES = 460; // hard cap on the stored series (Firestore 1MB doc limit)
const SEEK_TIMEOUT_MS = 2500; // a stalled seek must not hang the upload

// Landmark indices used only for locating the swing (the engine owns the rest)
const L_SHOULDER = 11, R_SHOULDER = 12, L_HIP = 23, R_HIP = 24;
const L_WRIST = 15, R_WRIST = 16;

interface FrameMeta {
  mediaTime: number;
}
type RVFCVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: FrameMeta) => void) => number;
};

// Seek to `t` and resolve with the timestamp of the frame that actually
// decoded — which is NOT always the requested time. Asking a 30fps video for
// a frame every 1/60s returns the same frame twice; keying on the real
// presentation time lets us drop the duplicate instead of inventing a
// zero-displacement frame that would corrupt every speed calculation.
function seekAndGrab(video: RVFCVideo, t: number): Promise<number | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(v);
    };
    const timer = setTimeout(() => finish(null), SEEK_TIMEOUT_MS);

    if (typeof video.requestVideoFrameCallback === "function") {
      video.requestVideoFrameCallback((_now, meta) => finish(meta.mediaTime));
    } else {
      // Firefox and older Safari: fall back to the seek event + currentTime.
      video.addEventListener("seeked", () => finish(video.currentTime), { once: true });
    }
    video.currentTime = t;
  });
}

async function samplePass(
  video: RVFCVideo,
  pose: PoseLandmarker,
  times: number[],
  sink: Map<number, PoseFrame>,
  onStep?: (done: number, total: number) => void,
) {
  for (let i = 0; i < times.length; i++) {
    const actual = await seekAndGrab(video, times[i]);
    onStep?.(i + 1, times.length);
    if (actual === null) break; // seeking unsupported or stalled — keep what we have
    const key = Math.round(actual * 1000);
    if (sink.has(key)) continue; // same decoded frame as the last seek
    const result = pose.detectForVideo(video, nextTs());
    const lms = result.landmarks[0];
    if (!lms) continue;
    sink.set(key, {
      t: r4(actual),
      lm: lms.map((l) => ({ x: r4(l.x), y: r4(l.y), v: r2(l.visibility ?? 1) })),
    });
  }
}

// Peak wrist speed ≈ contact. Speed is measured in torso-lengths/sec so that
// "fast" means fast relative to the PLAYER, not to the frame — the same
// distance-free idea the metrics engine uses, applied here so the swing can be
// found before we know anything else about the clip.
function findSwingTime(frames: PoseFrame[]): number | null {
  if (frames.length < 3) return null;
  const torso = frames.map((f) =>
    Math.abs(
      (f.lm[L_HIP].y + f.lm[R_HIP].y) / 2 - (f.lm[L_SHOULDER].y + f.lm[R_SHOULDER].y) / 2,
    ),
  );
  const scale = torso.reduce((s, x) => s + x, 0) / torso.length;
  if (!(scale > 0.01)) return null;

  const wrist = (f: PoseFrame) => (f.lm[L_WRIST].v > f.lm[R_WRIST].v ? f.lm[L_WRIST] : f.lm[R_WRIST]);
  let peakT: number | null = null;
  let peakSpeed = 0;
  for (let i = 1; i < frames.length; i++) {
    const dt = frames[i].t - frames[i - 1].t;
    if (dt <= 0) continue;
    const a = wrist(frames[i - 1]), b = wrist(frames[i]);
    const speed = Math.hypot(b.x - a.x, b.y - a.y) / scale / dt;
    if (speed > peakSpeed) {
      peakSpeed = speed;
      peakT = frames[i].t;
    }
  }
  return peakT;
}

// If the series is still over budget, thin the frames OUTSIDE the swing
// window first — context for the skeleton replay is worth less than the
// measurement frames.
function fitBudget(frames: PoseFrame[], from: number, to: number): PoseFrame[] {
  if (frames.length <= MAX_FRAMES) return frames;
  const inside = frames.filter((f) => f.t >= from && f.t <= to);
  const outside = frames.filter((f) => f.t < from || f.t > to);
  const room = Math.max(0, MAX_FRAMES - inside.length);
  const stride = room > 0 ? Math.ceil(outside.length / room) : outside.length + 1;
  const kept = outside.filter((_, i) => i % stride === 0);
  return [...inside, ...kept].sort((a, b) => a.t - b.t);
}

export async function extractPose(
  file: Blob,
  onProgress?: (f: number) => void,
): Promise<PoseFrame[]> {
  const pose = await getPose();

  const video = document.createElement("video") as RVFCVideo;
  video.src = URL.createObjectURL(file);
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  try {
    await new Promise<void>((res, rej) => {
      video.onloadedmetadata = () => res();
      video.onerror = () => rej(new Error("Could not read video for analysis"));
    });
    // Chrome reports MediaRecorder WebM as duration=Infinity until the file is
    // indexed — and seek-based sampling needs a real duration.
    await ensureFiniteDuration(video);
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    if (!duration) throw new Error("Could not read video for analysis");

    const scanEnd = Math.min(duration, MAX_SCAN_SECONDS);
    const sink = new Map<number, PoseFrame>();

    // ---- Pass 1: coarse scan of the whole clip ----
    const coarseStep = Math.max(1 / COARSE_FPS, scanEnd / MAX_COARSE_FRAMES);
    const coarseTimes: number[] = [];
    for (let t = 0; t < scanEnd; t += coarseStep) coarseTimes.push(r4(t));
    await samplePass(video, pose, coarseTimes, sink, (done, total) =>
      onProgress?.((done / total) * 0.45),
    );

    const coarse = [...sink.values()].sort((a, b) => a.t - b.t);
    const center = findSwingTime(coarse);

    // No swing found in the scan: hand back the coarse series and let the
    // engine's quality gate explain why, in its own words.
    if (center === null) {
      onProgress?.(1);
      return coarse;
    }

    // ---- Pass 2: fine sampling around the swing ----
    const from = Math.max(0, center - PRE_ROLL);
    const to = Math.min(scanEnd, center + POST_ROLL);
    const fineTimes: number[] = [];
    for (let t = from; t <= to; t += 1 / FINE_FPS) fineTimes.push(r4(t));
    await samplePass(video, pose, fineTimes, sink, (done, total) =>
      onProgress?.(0.45 + (done / total) * 0.55),
    );

    onProgress?.(1);
    return fitBudget([...sink.values()].sort((a, b) => a.t - b.t), from, to);
  } finally {
    URL.revokeObjectURL(video.src);
    video.removeAttribute("src");
    video.load();
  }
}
