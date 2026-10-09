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
import { findBursts, fixSideSwaps, TORSO_RATIO } from "./swingMetrics";

export interface Lm {
  x: number; // normalized 0..1 (fraction of frame width)
  y: number; // normalized 0..1 (fraction of frame height)
  v: number; // visibility/confidence 0..1
}
export interface PoseFrame {
  t: number; // seconds into the clip
  lm: Lm[]; // 33 landmarks (MediaPipe pose topology)
  // 3D "world" coordinates in meters (hip-centered; x sideways, y down,
  // z depth) for the 4 points rotation needs, in this order:
  // L shoulder, R shoulder, L hip, R hip — 12 numbers. A single camera can't
  // see depth directly; BlazePose INFERS it from body shape, which is enough
  // to tell how far the hips and shoulders have turned. Absent on old swings.
  w?: number[];
}

// Indices into the 33 landmarks whose 3D position we keep (see PoseFrame.w)
export const WORLD_POINTS = [11, 12, 23, 24];

export type PoseModel = "lite" | "full" | "heavy";
const posePromises: Partial<Record<PoseModel, Promise<PoseLandmarker>>> = {};
function getPose(model: PoseModel) {
  return (posePromises[model] ??= (async () => {
    const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
    return PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: `/mediapipe/pose_landmarker_${model}.task` },
      runningMode: "VIDEO",
      numPoses: 1,
    });
  })());
}

// Crop-and-zoom: the region of the frame (0..1 coords) that holds the player.
interface Roi {
  x: number;
  y: number;
  w: number;
  h: number;
}
// Where the player is during the swing, from the coarse pass: every point the
// model saw, padded generously (the arms and bat reach out during the swing).
function playerRoi(frames: PoseFrame[], from: number, to: number): Roi | null {
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
  for (const f of frames) {
    if (f.t < from || f.t > to) continue;
    for (const l of f.lm) {
      if (l.v < 0.3) continue;
      x0 = Math.min(x0, l.x); x1 = Math.max(x1, l.x);
      y0 = Math.min(y0, l.y); y1 = Math.max(y1, l.y);
    }
  }
  if (x1 <= x0 || y1 <= y0) return null;
  const pw = (x1 - x0) * 0.35, ph = (y1 - y0) * 0.2;
  const roi = {
    x: Math.max(0, x0 - pw),
    y: Math.max(0, y0 - ph),
    w: Math.min(1, x1 + pw) - Math.max(0, x0 - pw),
    h: Math.min(1, y1 + ph) - Math.max(0, y0 - ph),
  };
  // Already most of the frame → cropping gains nothing
  return roi.w * roi.h > 0.7 ? null : roi;
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
// Chosen Oct 9 on 41 clips (test-clips/web/exp/compare.mts):
//   lite, no crop  — jitter 10.3‰, swing timed right 16/29
//   full + crop    — jitter  3.2‰, timed right 21/29, same speed (4.6 s/clip)
//   heavy + crop   — jitter  2.5‰, but 7× slower and no more accurate
const DEFAULT_MODEL: PoseModel = "full";
const DEFAULT_CROP = true;

// Landmark indices used only for locating the swing (the engine owns the rest)
const L_SHOULDER = 11, R_SHOULDER = 12, L_HIP = 23, R_HIP = 24;

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
  roi: Roi | null = null,
) {
  // With a crop, the model sees only the player's region, scaled so the
  // player fills its input — more pixels per joint, steadier points.
  const canvas = roi ? document.createElement("canvas") : null;
  if (canvas && roi) {
    const scale = Math.max(1, 640 / (roi.h * video.videoHeight)); // at least 640 px tall
    canvas.width = Math.round(roi.w * video.videoWidth * scale);
    canvas.height = Math.round(roi.h * video.videoHeight * scale);
  }
  for (let i = 0; i < times.length; i++) {
    const actual = await seekAndGrab(video, times[i]);
    onStep?.(i + 1, times.length);
    if (actual === null) break; // seeking unsupported or stalled — keep what we have
    const key = Math.round(actual * 1000);
    if (sink.has(key)) continue; // same decoded frame as the last seek
    if (canvas && roi)
      canvas.getContext("2d")!.drawImage(
        video,
        roi.x * video.videoWidth, roi.y * video.videoHeight,
        roi.w * video.videoWidth, roi.h * video.videoHeight,
        0, 0, canvas.width, canvas.height,
      );
    const result = pose.detectForVideo(canvas ?? video, nextTs());
    const raw = result.landmarks[0];
    if (!raw) continue;
    // Map crop coordinates back to the whole frame (world/3D points are in
    // meters and don't depend on the crop)
    const lms = roi ? raw.map((l) => ({ ...l, x: roi.x + l.x * roi.w, y: roi.y + l.y * roi.h })) : raw;
    const world = result.worldLandmarks?.[0];
    sink.set(key, {
      t: r4(actual),
      lm: lms.map((l) => ({ x: r4(l.x), y: r4(l.y), v: r2(l.visibility ?? 1) })),
      ...(world ? { w: WORLD_POINTS.flatMap((i) => [r4(world[i].x), r4(world[i].y), r4(world[i].z)]) } : {}),
    });
  }
}

// Where is the swing? Same rule the engine uses (findBursts): the fast
// stretch in which the hands travel furthest — not the single fastest frame,
// which a wobble or a flipped left/right label can win. Speed is measured
// against the torso scaled to body height, so "fast" is relative to the
// PLAYER, not the frame, before we know anything else about the clip.
function findSwingTime(frames: PoseFrame[]): number | null {
  if (frames.length < 3) return null;
  const clean = fixSideSwaps(frames);
  const torso = clean.map((f) =>
    Math.abs(
      (f.lm[L_HIP].y + f.lm[R_HIP].y) / 2 - (f.lm[L_SHOULDER].y + f.lm[R_SHOULDER].y) / 2,
    ),
  );
  const scale = torso.reduce((s, x) => s + x, 0) / torso.length / TORSO_RATIO;
  if (!(scale > 0.02)) return null;
  const { handSpeed, bursts } = findBursts(clean, scale);
  if (!bursts.length) return null;
  let peak = bursts[0].from;
  for (let i = bursts[0].from; i <= bursts[0].to; i++)
    if (handSpeed[i] > handSpeed[peak]) peak = i;
  return clean[peak].t;
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

// Overrides for the coarse scan — used by /lab's validation runner to scan a
// long multi-swing video densely and cut it into one clip per swing. The app
// itself always uses the defaults.
export interface ScanOptions {
  coarseFps?: number;
  maxScanSeconds?: number;
  maxCoarseFrames?: number;
  poseModel?: PoseModel; // validation: compare model sizes
  crop?: boolean; // validation: crop-and-zoom on the swing pass
}

export async function extractPose(
  file: Blob,
  onProgress?: (f: number) => void,
  opts: ScanOptions = {},
): Promise<PoseFrame[]> {
  const pose = await getPose(opts.poseModel ?? DEFAULT_MODEL);
  const crop = opts.crop ?? DEFAULT_CROP;

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

    const scanEnd = Math.min(duration, opts.maxScanSeconds ?? MAX_SCAN_SECONDS);
    const sink = new Map<number, PoseFrame>();

    // ---- Pass 1: coarse scan of the whole clip ----
    const coarseStep = Math.max(
      1 / (opts.coarseFps ?? COARSE_FPS),
      scanEnd / (opts.maxCoarseFrames ?? MAX_COARSE_FRAMES),
    );
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
    const roi = crop ? playerRoi(coarse, from, to) : null;
    // Cropped and uncropped points must not mix inside the measured window
    if (roi) for (const [k, f] of sink) if (f.t >= from && f.t <= to) sink.delete(k);
    await samplePass(
      video,
      pose,
      fineTimes,
      sink,
      (done, total) => onProgress?.(0.45 + (done / total) * 0.55),
      roi,
    );

    onProgress?.(1);
    return fitBudget([...sink.values()].sort((a, b) => a.t - b.t), from, to);
  } finally {
    URL.revokeObjectURL(video.src);
    video.removeAttribute("src");
    video.load();
  }
}
