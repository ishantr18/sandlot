// Independent face check — YuNet (OpenCV Zoo, MIT license), a different
// network from Google's BlazeFace, run on-device through ONNX Runtime Web
// (WebAssembly). The blur's boxes come from BlazeFace + BlazePose; the
// self-audit uses THIS model, so a blind spot BlazeFace has doesn't also
// hide the leak from the check. Decoding matches OpenCV's FaceDetectorYN
// exactly (verified box-for-box in test-clips/blur, Oct 9).
import * as ort from "onnxruntime-web/wasm"; // plain WebAssembly build (no WebGPU) — matches /public/ort

export interface FaceBox {
  x: number;
  y: number;
  w: number;
  h: number;
  score: number;
}

let session: Promise<ort.InferenceSession> | null = null;
function getSession() {
  if (!session) {
    ort.env.wasm.wasmPaths = "/ort/"; // runtime files served from our own domain
    ort.env.wasm.numThreads = 1; // works without cross-origin isolation
    session = ort.InferenceSession.create("/models/yunet.onnx", { executionProviders: ["wasm"] });
  }
  return session;
}

const SIZE = 640; // the model's fixed input

// Faces inside a region of a video/canvas, in source pixels.
export async function yunetDetect(
  src: CanvasImageSource,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  minScore = 0.6,
): Promise<FaceBox[]> {
  const s = await getSession();
  // Letterbox: scale the region to fit 640×640, pad the rest with black
  const scale = SIZE / Math.max(sw, sh);
  const c = document.createElement("canvas");
  c.width = SIZE;
  c.height = SIZE;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, sw * scale, sh * scale);
  const px = ctx.getImageData(0, 0, SIZE, SIZE).data;
  const plane = SIZE * SIZE;
  const data = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    // BGR, raw 0–255 — the input OpenCV feeds it
    data[i] = px[i * 4 + 2];
    data[plane + i] = px[i * 4 + 1];
    data[2 * plane + i] = px[i * 4];
  }
  const out = await s.run({ input: new ort.Tensor("float32", data, [1, 3, SIZE, SIZE]) });
  const boxes: FaceBox[] = [];
  for (const st of [8, 16, 32]) {
    const cols = SIZE / st;
    const cls = out[`cls_${st}`].data as Float32Array;
    const obj = out[`obj_${st}`].data as Float32Array;
    const bb = out[`bbox_${st}`].data as Float32Array;
    for (let i = 0; i < cls.length; i++) {
      const score = Math.sqrt(Math.min(1, Math.max(0, cls[i])) * Math.min(1, Math.max(0, obj[i])));
      if (score < minScore) continue;
      const r = Math.floor(i / cols), col = i % cols;
      const cx = (col + bb[i * 4]) * st, cy = (r + bb[i * 4 + 1]) * st;
      const w = Math.exp(bb[i * 4 + 2]) * st, h = Math.exp(bb[i * 4 + 3]) * st;
      boxes.push({ x: sx + (cx - w / 2) / scale, y: sy + (cy - h / 2) / scale, w: w / scale, h: h / scale, score });
    }
  }
  boxes.sort((a, b) => b.score - a.score);
  const kept: FaceBox[] = [];
  for (const b of boxes) if (kept.every((k) => iou(k, b) < 0.3)) kept.push(b);
  return kept;
}

function iou(a: FaceBox, b: FaceBox) {
  const iw = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const ih = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = iw * ih;
  return inter / (a.w * a.h + b.w * b.h - inter || 1);
}
