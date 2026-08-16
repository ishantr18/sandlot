// On-device face blurring — THE privacy feature.
// Pipeline: video plays into a canvas → face detector finds faces each frame →
// those regions get repainted blurred → the canvas is re-recorded into a NEW
// video file. The raw (unblurred) video never leaves the device.
import { FaceDetector, FilesetResolver } from "@mediapipe/tasks-vision";

let detectorPromise: Promise<FaceDetector> | null = null;

// Load the model once and reuse it across blurs
function getDetector(): Promise<FaceDetector> {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
      return FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: "/mediapipe/blaze_face_short_range.tflite" },
        runningMode: "VIDEO",
        minDetectionConfidence: 0.3, // low threshold: better to blur a false positive than miss a face
      });
    })();
  }
  return detectorPromise;
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

export async function blurVideo(
  file: File,
  onProgress: (fraction: number) => void,
): Promise<File> {
  const detector = await getDetector();

  // Hidden video element to decode the original clip
  const video = document.createElement("video");
  video.src = URL.createObjectURL(file);
  video.muted = true;
  video.playsInline = true;
  await new Promise<void>((res, rej) => {
    video.onloadedmetadata = () => res();
    video.onerror = () => rej(new Error("Could not read video"));
  });

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d")!;

  // Tiny scratch canvas for pixelation — a face gets squashed down to
  // PIXEL_BLOCKS×~PIXEL_BLOCKS pixels, then stretched back up. The detail is
  // destroyed, not smoothed: no amount of enhancement can recover it, and it
  // is equally anonymous for close-ups and distant faces.
  const PIXEL_BLOCKS = 8;
  const scratch = document.createElement("canvas");
  const sctx = scratch.getContext("2d")!;

  // Re-record the canvas as a new video, at the clip's own pace
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
      const blob = new Blob(chunks, { type });
      URL.revokeObjectURL(video.src);
      resolve(
        new File([blob], file.name.replace(/\.[^.]+$/, "") + `-blurred.${ext}`, {
          type,
        }),
      );
    };
  });

  // Track faces a few frames after last sighting so quick head turns
  // (where detection flickers) stay covered.
  let lastBoxes: { x: number; y: number; w: number; h: number }[] = [];
  let framesSinceSeen = 0;
  const HOLD_FRAMES = 10;

  const drawFrame = () => {
    ctx.drawImage(video, 0, 0);
    const result = detector.detectForVideo(video, performance.now());

    if (result.detections.length > 0) {
      lastBoxes = result.detections.map((d) => {
        const b = d.boundingBox!;
        // Tight box: modest margin keeps the mosaic concentrated on the face
        // itself (hairline/chin) without swallowing the surrounding frame
        const mx = b.width * 0.15;
        const my = b.height * 0.2;
        return {
          x: Math.max(0, b.originX - mx),
          y: Math.max(0, b.originY - my),
          w: b.width + mx * 2,
          h: b.height + my * 2,
        };
      });
      framesSinceSeen = 0;
    } else {
      framesSinceSeen++;
      if (framesSinceSeen > HOLD_FRAMES) lastBoxes = [];
    }

    // Pixelate each face region: squash to a tiny mosaic, stretch back up
    for (const box of lastBoxes) {
      const bw = Math.max(2, PIXEL_BLOCKS);
      const bh = Math.max(2, Math.round((PIXEL_BLOCKS * box.h) / box.w));
      scratch.width = bw;
      scratch.height = bh;
      sctx.drawImage(video, box.x, box.y, box.w, box.h, 0, 0, bw, bh);
      ctx.imageSmoothingEnabled = false; // keep the blocks chunky, no re-smoothing
      ctx.drawImage(scratch, 0, 0, bw, bh, box.x, box.y, box.w, box.h);
      ctx.imageSmoothingEnabled = true;
    }

    onProgress(video.duration ? video.currentTime / video.duration : 0);
    if (!video.ended) requestAnimationFrame(drawFrame);
  };

  video.onended = () => {
    // small delay so the last frames flush into the recording
    setTimeout(() => recorder.stop(), 300);
  };

  recorder.start(250);
  await video.play();
  requestAnimationFrame(drawFrame);

  return done;
}
