// Pose extraction — turns a (blurred) swing video into a time series of
// 33 body landmarks per frame. Runs entirely on-device; only the numeric
// series (not video) is stored alongside the session.
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

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

let ts = 0;
function nextTs() {
  ts = Math.max(ts + 1, performance.now());
  return ts;
}

const r4 = (n: number) => Math.round(n * 10000) / 10000;
const r2 = (n: number) => Math.round(n * 100) / 100;

const MAX_FPS = 60; // fine clock: a 150ms swing needs more than 20fps (tempo=0 bug)
const MAX_SECONDS = 15; // safety cap so a long video can't blow up the record

export async function extractPose(
  file: Blob,
  onProgress?: (f: number) => void,
): Promise<PoseFrame[]> {
  const pose = await getPose();

  const video = document.createElement("video");
  video.src = URL.createObjectURL(file);
  video.muted = true;
  video.playsInline = true;
  await new Promise<void>((res, rej) => {
    video.onloadedmetadata = () => res();
    video.onerror = () => rej(new Error("Could not read video for analysis"));
  });

  const frames: PoseFrame[] = [];
  let lastT = -1;

  await new Promise<void>((resolve) => {
    const step = () => {
      if (video.ended || video.currentTime > MAX_SECONDS) return resolve();
      const t = video.currentTime;
      if (t - lastT >= 1 / MAX_FPS) {
        lastT = t;
        const result = pose.detectForVideo(video, nextTs());
        const lms = result.landmarks[0];
        if (lms) {
          frames.push({
            t: r4(t),
            lm: lms.map((l) => ({ x: r4(l.x), y: r4(l.y), v: r2(l.visibility ?? 1) })),
          });
        }
      }
      onProgress?.(video.duration ? Math.min(1, t / video.duration) : 0);
      requestAnimationFrame(step);
    };
    video.onended = () => resolve();
    void video.play();
    requestAnimationFrame(step);
  });

  URL.revokeObjectURL(video.src);
  return frames;
}
