// On-device face anonymization — THE privacy feature.
//
// Three-stage pipeline (see docs/BLUR-IMPROVEMENTS.md):
//  1. SCAN   — play the clip invisibly; every frame, find faces (face detector)
//              AND head positions (pose model — catches heads the face model
//              misses at distance or odd angles). Store timed boxes.
//  2. RENDER — play again into a canvas; pixelate every box seen within
//              ±HOLD_SEC of each frame (covers entry/exit frames and flicker
//              in BOTH directions), re-record as a new file.
//  3. VERIFY — self-audit: seek through the OUTPUT and try to detect faces.
//              If any are found, re-render with bigger boxes and audit again.
//
// The raw video never leaves the device; the output has no audio track.
import {
  FaceDetector,
  FilesetResolver,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface TimedBoxes {
  t: number;
  boxes: Box[];
}

export type BlurStage = "scan" | "render" | "verify";
export interface BlurResult {
  file: File;
  auditFacesFound: number; // faces still detectable in final output (goal: 0)
}

const HOLD_SEC = 0.4; // boxes cover this far before/after their sighting
const PIXEL_BLOCKS = 8;

let modelsPromise: Promise<{ face: FaceDetector; pose: PoseLandmarker }> | null =
  null;

function getModels() {
  if (!modelsPromise) {
    modelsPromise = (async () => {
      const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
      const [face, pose] = await Promise.all([
        FaceDetector.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: "/mediapipe/blaze_face_short_range.tflite" },
          runningMode: "VIDEO",
          minDetectionConfidence: 0.3, // low on purpose: over-blur beats under-blur
        }),
        PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: "/mediapipe/pose_landmarker_lite.task" },
          runningMode: "VIDEO",
          numPoses: 1,
        }),
      ]);
      return { face, pose };
    })();
  }
  return modelsPromise;
}

function pickMimeType(): { mime: string; ext: string } {
  const candidates: [string, string][] = [
    ["video/mp4", "mp4"],
    ["video/webm;codecs=vp9", "webm"],
    ["video/webm", "webm"],
  ];
  for (const [mime, ext] of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return { mime, ext };
  }
  return { mime: "", ext: "webm" };
}

async function loadVideo(src: Blob): Promise<HTMLVideoElement> {
  const video = document.createElement("video");
  video.src = URL.createObjectURL(src);
  video.muted = true;
  video.playsInline = true;
  await new Promise<void>((res, rej) => {
    video.onloadedmetadata = () => res();
    video.onerror = () => rej(new Error("Could not read video"));
  });
  return video;
}

// Monotonic timestamps for the detectors (they require forward-only time)
let ts = 0;
function nextTs() {
  ts = Math.max(ts + 1, performance.now());
  return ts;
}

// Head box from pose landmarks (0–10 are face/head points).
// Sized off the ear-to-ear distance; generous, since this is the backup net.
function headBoxFromPose(
  lms: { x: number; y: number; visibility?: number }[],
  W: number,
  H: number,
): Box | null {
  const head = lms.slice(0, 11).filter((l) => (l.visibility ?? 1) > 0.5);
  if (head.length < 3) return null;
  const cx = (head.reduce((s, l) => s + l.x, 0) / head.length) * W;
  const cy = (head.reduce((s, l) => s + l.y, 0) / head.length) * H;
  const earL = lms[7];
  const earR = lms[8];
  const earDist = Math.hypot((earL.x - earR.x) * W, (earL.y - earR.y) * H);
  const size = Math.max(earDist * 2.4, W * 0.04); // never smaller than 4% of frame
  return { x: cx - size / 2, y: cy - size / 2, w: size, h: size };
}

// ---- Stage 1: scan for faces + heads --------------------------------------
async function scanFaces(
  video: HTMLVideoElement,
  onFraction: (f: number) => void,
): Promise<TimedBoxes[]> {
  const { face, pose } = await getModels();
  const W = video.videoWidth;
  const H = video.videoHeight;
  const track: TimedBoxes[] = [];

  await new Promise<void>((resolve) => {
    const step = () => {
      if (video.ended) return resolve();
      const boxes: Box[] = [];

      for (const d of face.detectForVideo(video, nextTs()).detections) {
        const b = d.boundingBox!;
        const mx = b.width * 0.15;
        const my = b.height * 0.2;
        boxes.push({
          x: Math.max(0, b.originX - mx),
          y: Math.max(0, b.originY - my),
          w: b.width + mx * 2,
          h: b.height + my * 2,
        });
      }

      const poseResult = pose.detectForVideo(video, nextTs());
      for (const lms of poseResult.landmarks) {
        const hb = headBoxFromPose(lms, W, H);
        if (hb) boxes.push(hb);
      }

      if (boxes.length) track.push({ t: video.currentTime, boxes });
      onFraction(video.duration ? video.currentTime / video.duration : 0);
      requestAnimationFrame(step);
    };
    video.currentTime = 0;
    void video.play();
    requestAnimationFrame(step);
  });

  return track;
}

// ---- Stage 2: render pixelated copy ---------------------------------------
async function renderBlurred(
  video: HTMLVideoElement,
  track: TimedBoxes[],
  scale: number, // 1 normally; >1 on the re-blur retry after a failed audit
  baseName: string,
  onFraction: (f: number) => void,
): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d")!;
  const scratch = document.createElement("canvas");
  const sctx = scratch.getContext("2d")!;

  const { mime, ext } = pickMimeType();
  const stream = canvas.captureStream(30);
  const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const done = new Promise<File>((resolve) => {
    recorder.onstop = () => {
      const type = recorder.mimeType || mime || "video/webm";
      resolve(
        new File([new Blob(chunks, { type })], `${baseName}-blurred.${ext}`, { type }),
      );
    };
  });

  const drawFrame = () => {
    if (video.ended) return;
    ctx.drawImage(video, 0, 0);
    const cur = video.currentTime;

    // Union of every box sighted within ±HOLD_SEC of this frame
    for (const entry of track) {
      if (Math.abs(entry.t - cur) > HOLD_SEC) continue;
      for (const b of entry.boxes) {
        const grow = (scale - 1) / 2;
        const box = {
          x: b.x - b.w * grow,
          y: b.y - b.h * grow,
          w: b.w * scale,
          h: b.h * scale,
        };
        const bw = PIXEL_BLOCKS;
        const bh = Math.max(2, Math.round((PIXEL_BLOCKS * box.h) / box.w));
        scratch.width = bw;
        scratch.height = bh;
        sctx.drawImage(video, box.x, box.y, box.w, box.h, 0, 0, bw, bh);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(scratch, 0, 0, bw, bh, box.x, box.y, box.w, box.h);
        ctx.imageSmoothingEnabled = true;
      }
    }

    onFraction(video.duration ? cur / video.duration : 0);
    requestAnimationFrame(drawFrame);
  };

  await new Promise<void>((resolve) => {
    video.onended = () => setTimeout(() => resolve(), 300);
    video.currentTime = 0;
    recorder.start(250);
    void video.play();
    requestAnimationFrame(drawFrame);
  });
  recorder.stop();
  return done;
}

// ---- Stage 3: self-audit the output ---------------------------------------
async function auditOutput(
  blurred: Blob,
  onFraction: (f: number) => void,
): Promise<number> {
  const { face } = await getModels();
  const video = await loadVideo(blurred);
  const SAMPLES = 12;
  let found = 0;
  for (let i = 0; i < SAMPLES; i++) {
    const t = ((i + 0.5) / SAMPLES) * (video.duration || 0);
    await new Promise<void>((res) => {
      video.onseeked = () => res();
      video.currentTime = t;
    });
    found += face.detectForVideo(video, nextTs()).detections.length;
    onFraction((i + 1) / SAMPLES);
  }
  URL.revokeObjectURL(video.src);
  return found;
}

// ---- Public API ------------------------------------------------------------
export async function blurVideo(
  file: File,
  onProgress: (stage: BlurStage, fraction: number) => void,
): Promise<BlurResult> {
  const baseName = file.name.replace(/\.[^.]+$/, "");
  const video = await loadVideo(file);

  const track = await scanFaces(video, (f) => onProgress("scan", f));

  let out = await renderBlurred(video, track, 1, baseName, (f) =>
    onProgress("render", f),
  );
  let found = await auditOutput(out, (f) => onProgress("verify", f));

  if (found > 0) {
    // Audit failed → re-blur with 60% bigger boxes, audit once more
    out = await renderBlurred(video, track, 1.6, baseName, (f) =>
      onProgress("render", f),
    );
    found = await auditOutput(out, (f) => onProgress("verify", f));
  }

  URL.revokeObjectURL(video.src);
  return { file: out, auditFacesFound: found };
}
