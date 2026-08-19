// Swing metrics engine — turns a pose time series into coaching.
//
// Design notes (see docs/BLUEPRINT.md):
// - All positions are normalized to BODY HEIGHT measured in-frame, so the
//   numbers don't depend on camera distance.
// - Target ranges are anchored in published biomechanics (pro kinematic
//   sequencing) but expressed as proxies measurable from a single 2D side
//   view. THRESHOLDS ARE PROVISIONAL — tuned against our own test clips.
// - The quality gate rejects clips the math can't trust (feet out of frame,
//   poor tracking) with actionable messages.
import type { PoseFrame } from "./poseExtract";

// MediaPipe pose landmark indices
const NOSE = 0;
const L_SHOULDER = 11, R_SHOULDER = 12;
const L_HIP = 23, R_HIP = 24;
const L_WRIST = 15, R_WRIST = 16;
const L_ANKLE = 27, R_ANKLE = 28;

export interface SwingMetrics {
  hipShoulderSepDeg: number; // peak line-angle difference before contact (proxy)
  tempoSec: number; // launch → peak hand speed
  headDriftPct: number; // nose travel as % of body height
  stridePct: number; // ankle spread as % of body height
  peakHandSpeed: number; // body-heights per second (relative unit)
  swingStart: number; // seconds — start of measured window
  swingPeak: number; // seconds — peak hand speed (≈ contact)
  trackingQuality: number; // 0..1 mean landmark visibility in window
}

export interface Finding {
  metric: keyof SwingMetrics | "quality";
  severity: "good" | "minor" | "major";
  message: string;
  drillIds: string[];
}

export type SwingAnalysis =
  | { ok: true; metrics: SwingMetrics; findings: Finding[] }
  | { ok: false; rejectReason: string };

// ---- PROVISIONAL THRESHOLDS (tune against test-clips/) ---------------------
const T = {
  minFrames: 12,
  minAnkleVis: 0.45, // below this → feet not reliably in frame
  minMeanVis: 0.5, // below this → lighting/tracking too poor
  minHandSpeed: 0.8, // body-heights/sec — below this, no swing detected
  sep: { good: 22, minor: 14 }, // degrees (2D side-view proxy)
  tempo: { fastest: 0.10, slowest: 0.45 }, // seconds
  headDrift: { good: 8, minor: 14 }, // % of body height
  stride: { min: 8, max: 35 }, // % of body height
};
// ---------------------------------------------------------------------------

const deg = (rad: number) => (rad * 180) / Math.PI;

function lineAngle(a: { x: number; y: number }, b: { x: number; y: number }) {
  return deg(Math.atan2(b.y - a.y, b.x - a.x));
}

function angleDiff(a: number, b: number) {
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

export function analyzeSwing(frames: PoseFrame[]): SwingAnalysis {
  // ---- Quality gate ----
  if (frames.length < T.minFrames) {
    return {
      ok: false,
      rejectReason:
        "Couldn't track a person in this clip. Make sure your whole body is visible and the clip is at least a few seconds long.",
    };
  }
  const mean = (vals: number[]) => vals.reduce((s, v) => s + v, 0) / vals.length;
  const ankleVis = mean(frames.map((f) => (f.lm[L_ANKLE].v + f.lm[R_ANKLE].v) / 2));
  if (ankleVis < T.minAnkleVis) {
    return {
      ok: false,
      rejectReason:
        "Your feet aren't reliably in frame — step back or tilt the camera down so your WHOLE body is visible (head to feet). The analysis needs your legs.",
    };
  }
  const meanVis = mean(frames.map((f) => mean(f.lm.map((l) => l.v))));
  if (meanVis < T.minMeanVis) {
    return {
      ok: false,
      rejectReason:
        "Tracking quality is too low — usually bad lighting or a backlit shot. Face the light source and try again.",
    };
  }

  // Body height in-frame (shoulder-mid to ankle-mid) — our distance-free ruler
  const heights = frames.map((f) => {
    const shoulderMidY = (f.lm[L_SHOULDER].y + f.lm[R_SHOULDER].y) / 2;
    const ankleMidY = (f.lm[L_ANKLE].y + f.lm[R_ANKLE].y) / 2;
    return Math.abs(ankleMidY - shoulderMidY);
  });
  const bodyH = mean(heights);
  if (bodyH < 0.1) {
    return {
      ok: false,
      rejectReason: "You're too far from the camera for reliable analysis — move closer.",
    };
  }

  // ---- Hand speed per frame (body-heights / second) ----
  const wrist = (f: PoseFrame) =>
    f.lm[L_WRIST].v > f.lm[R_WRIST].v ? f.lm[L_WRIST] : f.lm[R_WRIST];
  const speeds: number[] = [0];
  for (let i = 1; i < frames.length; i++) {
    const dt = frames[i].t - frames[i - 1].t || 1e-6;
    const a = wrist(frames[i - 1]);
    const b = wrist(frames[i]);
    speeds.push(Math.hypot(b.x - a.x, b.y - a.y) / bodyH / dt);
  }

  // ---- Find the swing: peak hand speed ≈ contact ----
  let peakI = 0;
  for (let i = 1; i < speeds.length; i++) if (speeds[i] > speeds[peakI]) peakI = i;
  const peakSpeed = speeds[peakI];
  if (peakSpeed < T.minHandSpeed) {
    return {
      ok: false,
      rejectReason:
        "No swing detected in this clip — make sure you take one full swing, and that your hands are visible.",
    };
  }
  // Launch = last time before the peak that speed was below 15% of peak
  let startI = peakI;
  while (startI > 0 && speeds[startI - 1] > peakSpeed * 0.15) startI--;

  const winStart = Math.max(0, startI - 3); // small pre-roll for separation peak
  const window = frames.slice(winStart, Math.min(frames.length, peakI + 3));

  // ---- Metric 1: hip–shoulder separation (peak, pre-contact) ----
  let sepPeak = 0;
  for (const f of frames.slice(winStart, peakI + 1)) {
    const sAng = lineAngle(f.lm[L_SHOULDER], f.lm[R_SHOULDER]);
    const hAng = lineAngle(f.lm[L_HIP], f.lm[R_HIP]);
    sepPeak = Math.max(sepPeak, angleDiff(sAng, hAng));
  }

  // ---- Metric 2: tempo (launch → peak) ----
  const tempo = frames[peakI].t - frames[startI].t;

  // ---- Metric 3: head drift (% of body height, within window) ----
  const noseXs = window.map((f) => f.lm[NOSE].x);
  const noseYs = window.map((f) => f.lm[NOSE].y);
  const drift =
    Math.hypot(
      Math.max(...noseXs) - Math.min(...noseXs),
      Math.max(...noseYs) - Math.min(...noseYs),
    ) / bodyH;

  // ---- Metric 4: stride (max ankle spread in window, % of body height) ----
  let strideMax = 0;
  for (const f of window) {
    strideMax = Math.max(
      strideMax,
      Math.abs(f.lm[L_ANKLE].x - f.lm[R_ANKLE].x) / bodyH,
    );
  }

  const metrics: SwingMetrics = {
    hipShoulderSepDeg: Math.round(sepPeak),
    tempoSec: Math.round(tempo * 100) / 100,
    headDriftPct: Math.round(drift * 100),
    stridePct: Math.round(strideMax * 100),
    peakHandSpeed: Math.round(peakSpeed * 10) / 10,
    swingStart: frames[startI].t,
    swingPeak: frames[peakI].t,
    trackingQuality: Math.round(meanVis * 100) / 100,
  };

  return { ok: true, metrics, findings: buildFindings(metrics) };
}

function buildFindings(m: SwingMetrics): Finding[] {
  const out: Finding[] = [];

  if (m.hipShoulderSepDeg >= T.sep.good) {
    out.push({
      metric: "hipShoulderSepDeg",
      severity: "good",
      message: `Great separation (${m.hipShoulderSepDeg}°) — your hips are leading and loading power like they should.`,
      drillIds: [],
    });
  } else if (m.hipShoulderSepDeg >= T.sep.minor) {
    out.push({
      metric: "hipShoulderSepDeg",
      severity: "minor",
      message: `Decent separation (${m.hipShoulderSepDeg}°), but there's more power available — let your hips start before your hands.`,
      drillIds: ["hip-fire-tee", "separation-stretch"],
    });
  } else {
    out.push({
      metric: "hipShoulderSepDeg",
      severity: "major",
      message: `Low separation (${m.hipShoulderSepDeg}°) — hips and shoulders are turning together, which leaks power. This is the #1 thing to work on.`,
      drillIds: ["hip-fire-tee", "separation-stretch"],
    });
  }

  if (m.tempoSec < T.tempo.fastest) {
    out.push({
      metric: "tempoSec",
      severity: "minor",
      message: `Very quick trigger (${m.tempoSec}s) — could be rushing. A slightly longer load gives your body time to sequence.`,
      drillIds: ["wall-bat-tempo"],
    });
  } else if (m.tempoSec > T.tempo.slowest) {
    out.push({
      metric: "tempoSec",
      severity: "minor",
      message: `Long swing (${m.tempoSec}s from launch to contact) — a more compact path gets you to the ball sooner.`,
      drillIds: ["wall-bat-tempo"],
    });
  } else {
    out.push({
      metric: "tempoSec",
      severity: "good",
      message: `Swing tempo (${m.tempoSec}s) is in a healthy range.`,
      drillIds: [],
    });
  }

  if (m.headDriftPct <= T.headDrift.good) {
    out.push({
      metric: "headDriftPct",
      severity: "good",
      message: `Quiet head (${m.headDriftPct}% drift) — that's what consistent contact is built on.`,
      drillIds: [],
    });
  } else if (m.headDriftPct <= T.headDrift.minor) {
    out.push({
      metric: "headDriftPct",
      severity: "minor",
      message: `Some head movement (${m.headDriftPct}% of body height) — keep your eyes level through contact.`,
      drillIds: ["balance-beam"],
    });
  } else {
    out.push({
      metric: "headDriftPct",
      severity: "major",
      message: `Big head movement (${m.headDriftPct}%) — you're likely lunging. A moving head makes the ball look like it's moving too.`,
      drillIds: ["balance-beam"],
    });
  }

  if (m.stridePct < T.stride.min) {
    out.push({
      metric: "stridePct",
      severity: "minor",
      message: `Narrow stride (${m.stridePct}% of height) — you may be all arms. A real stride gets your lower half into the swing.`,
      drillIds: ["stride-ladder"],
    });
  } else if (m.stridePct > T.stride.max) {
    out.push({
      metric: "stridePct",
      severity: "minor",
      message: `Very wide stride (${m.stridePct}%) — can cost you balance and rotation. Try a slightly more compact base.`,
      drillIds: ["stride-ladder"],
    });
  } else {
    out.push({
      metric: "stridePct",
      severity: "good",
      message: `Stride width (${m.stridePct}% of height) looks solid.`,
      drillIds: [],
    });
  }

  // Most important first: majors, then minors, then praise
  const rank = { major: 0, minor: 1, good: 2 };
  out.sort((a, b) => rank[a.severity] - rank[b.severity]);
  return out;
}
