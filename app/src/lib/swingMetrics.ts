// Swing metrics engine v2 — turns a pose time series into coaching.
//
// Grounded in coaching literature (docs/RESEARCH.md + Aug 18 research):
// the master key is the KINEMATIC SEQUENCE (hips fire before shoulders);
// supporting checks: separation, lunge (head drift AFTER front-foot plant),
// front-knee brace at contact, backside collapse, stride, tempo.
//
// Design rules:
// - Positions normalized to BODY HEIGHT in-frame → distance-independent.
// - 2D side-view PROXIES, honestly labeled — no fake lab numbers.
// - THRESHOLDS PROVISIONAL — tuned against test-clips/ (our own swings).
// - Quality gate rejects clips the math can't trust, with actionable fixes.
import type { PoseFrame } from "./poseExtract";

// MediaPipe pose landmark indices
const NOSE = 0;
const L_SHOULDER = 11, R_SHOULDER = 12;
const L_HIP = 23, R_HIP = 24;
const L_WRIST = 15, R_WRIST = 16;
const L_KNEE = 25, R_KNEE = 26;
const L_ANKLE = 27, R_ANKLE = 28;

export interface SwingMetrics {
  // The flagship: kinematic sequence
  sequenceGapMs: number; // hip-rotation peak → shoulder-rotation peak (+ = hips first ✓)
  hipShoulderSepDeg: number; // peak line-angle difference pre-contact (proxy)
  tempoSec: number; // launch → peak hand speed
  headDriftPct: number; // nose travel AFTER front-foot plant, % of body height (lunge)
  stridePct: number; // ankle spread as % of body height
  kneeBraceDeg: number; // front-knee angle at contact (≈180 = braced)
  shoulderTiltDeg: number; // back-shoulder dip at launch (collapse/uppercut)
  peakHandSpeed: number; // body-heights per second (relative unit)
  swingStart: number; // s — launch
  footPlant: number; // s — front-foot plant (estimated)
  swingPeak: number; // s — peak hand speed (≈ contact)
  trackingQuality: number; // 0..1 mean landmark visibility
  viewRatio: number; // shoulder-width/body-height — camera-angle indicator (side ≈ <0.2)
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
export const T = {
  minFrames: 12,
  minAnkleVis: 0.45,
  minMeanVis: 0.5,
  minHandSpeed: 0.8, // body-heights/sec — below this, no swing detected
  seq: { good: 25, ok: 0 }, // ms hip-peak leads shoulder-peak
  sep: { good: 22, minor: 14 }, // degrees (2D proxy)
  tempo: { fastest: 0.1, slowest: 0.6 }, // seconds (0.5s was a real swing — widened)
  headDrift: { good: 6, minor: 12 }, // % of body height AFTER plant
  stride: { min: 8, max: 35 }, // % of body height
  knee: { braced: 158, soft: 140 }, // degrees at contact
  tilt: { level: 15, dipped: 25 }, // degrees at launch
  viewRatioMax: 0.22, // shoulder width / body height — above this it's a front-facing video
};
// ---------------------------------------------------------------------------

const deg = (rad: number) => (rad * 180) / Math.PI;
const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;

function lineAngle(a: { x: number; y: number }, b: { x: number; y: number }) {
  return deg(Math.atan2(b.y - a.y, b.x - a.x));
}
function angleDiff(a: number, b: number) {
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return d;
}
function signedAngleDelta(a: number, b: number) {
  return ((a - b + 540) % 360) - 180;
}
// Interior angle at joint B (degrees) for segment A-B-C
function jointAngle(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
) {
  const v1 = { x: a.x - b.x, y: a.y - b.y };
  const v2 = { x: c.x - b.x, y: c.y - b.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const mag = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y) || 1e-9;
  return deg(Math.acos(Math.min(1, Math.max(-1, dot / mag))));
}
function smooth3(v: number[]) {
  return v.map((_, i) => {
    const a = v[Math.max(0, i - 1)], b = v[i], c = v[Math.min(v.length - 1, i + 1)];
    return (a + b + c) / 3;
  });
}
// |angular speed| series (deg/sec) of the line between two landmarks
function rotationSpeed(frames: PoseFrame[], ia: number, ib: number) {
  const angles = frames.map((f) => lineAngle(f.lm[ia], f.lm[ib]));
  const out = [0];
  for (let i = 1; i < frames.length; i++) {
    const dt = frames[i].t - frames[i - 1].t || 1e-6;
    out.push(Math.abs(signedAngleDelta(angles[i], angles[i - 1])) / dt);
  }
  return smooth3(out);
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

  // Body height in-frame — our distance-free ruler
  const bodyH = mean(
    frames.map((f) =>
      Math.abs(
        (f.lm[L_ANKLE].y + f.lm[R_ANKLE].y) / 2 -
          (f.lm[L_SHOULDER].y + f.lm[R_SHOULDER].y) / 2,
      ),
    ),
  );
  if (bodyH < 0.1) {
    return {
      ok: false,
      rejectReason: "You're too far from the camera for reliable analysis — move closer.",
    };
  }

  // Camera-angle check: side-view math on a front-facing video produces
  // confident nonsense (proven by our Front.MOV test). Shoulders wide apart
  // horizontally = facing the camera.
  const viewRatio =
    mean(frames.map((f) => Math.abs(f.lm[L_SHOULDER].x - f.lm[R_SHOULDER].x))) / bodyH;
  if (viewRatio > T.viewRatioMax) {
    return {
      ok: false,
      rejectReason:
        "This looks like a front-facing video — the analysis needs a SIDE view. Set the camera to your side (where the pitcher would see your profile) and try again.",
    };
  }

  // ---- Hand speed → find the swing ----
  const wrist = (f: PoseFrame) =>
    f.lm[L_WRIST].v > f.lm[R_WRIST].v ? f.lm[L_WRIST] : f.lm[R_WRIST];
  const handSpeed: number[] = [0];
  for (let i = 1; i < frames.length; i++) {
    const dt = frames[i].t - frames[i - 1].t || 1e-6;
    const a = wrist(frames[i - 1]), b = wrist(frames[i]);
    handSpeed.push(Math.hypot(b.x - a.x, b.y - a.y) / bodyH / dt);
  }
  let peakI = 0;
  for (let i = 1; i < handSpeed.length; i++) if (handSpeed[i] > handSpeed[peakI]) peakI = i;
  const peakSpeed = handSpeed[peakI];
  if (peakSpeed < T.minHandSpeed) {
    return {
      ok: false,
      rejectReason:
        "No swing detected in this clip — take one full swing with your hands visible.",
    };
  }
  let startI = peakI;
  while (startI > 0 && handSpeed[startI - 1] > peakSpeed * 0.15) startI--;
  const winStart = Math.max(0, startI - 4);

  // Degenerate-clip guards: never issue confident coaching on a swing the
  // camera didn't fully capture (our Side_good3 test failed exactly this way).
  if (frames[peakI].t < 0.35 || peakI < 3) {
    return {
      ok: false,
      rejectReason:
        "The swing happens at the very start of the clip, so there's nothing to measure it against. Start recording at least a second BEFORE you swing.",
    };
  }
  if (peakI >= frames.length - 2) {
    return {
      ok: false,
      rejectReason:
        "The clip ends right at the swing — keep recording for a second after contact so the full motion is captured.",
    };
  }
  if (peakI - startI < 2) {
    return {
      ok: false,
      rejectReason:
        "Couldn't reliably time this swing (too few frames across the motion). Try again with steadier framing and the whole load-to-contact visible.",
    };
  }

  // ---- Swing direction & front leg ----
  const hipMidX = (i: number) => (frames[i].lm[L_HIP].x + frames[i].lm[R_HIP].x) / 2;
  const dir = Math.sign(hipMidX(peakI) - hipMidX(winStart)) || 1;
  const frontIsLeft =
    (frames[peakI].lm[L_ANKLE].x - frames[peakI].lm[R_ANKLE].x) * dir > 0;
  const F_ANKLE = frontIsLeft ? L_ANKLE : R_ANKLE;
  const F_KNEE = frontIsLeft ? L_KNEE : R_KNEE;
  const F_HIP = frontIsLeft ? L_HIP : R_HIP;
  const B_SHOULDER = frontIsLeft ? R_SHOULDER : L_SHOULDER;
  const F_SHOULDER = frontIsLeft ? L_SHOULDER : R_SHOULDER;

  // ---- Front-foot plant: front ankle stops moving before contact ----
  const ankleSpeed: number[] = [0];
  for (let i = 1; i < frames.length; i++) {
    const dt = frames[i].t - frames[i - 1].t || 1e-6;
    const a = frames[i - 1].lm[F_ANKLE], b = frames[i].lm[F_ANKLE];
    ankleSpeed.push(Math.hypot(b.x - a.x, b.y - a.y) / bodyH / dt);
  }
  let plantI = startI;
  {
    let maxI = winStart;
    for (let i = winStart; i <= peakI; i++)
      if (ankleSpeed[i] > ankleSpeed[maxI]) maxI = i;
    const thresh = ankleSpeed[maxI] * 0.25;
    for (let i = maxI; i <= peakI; i++) {
      if (ankleSpeed[i] < thresh) {
        plantI = i;
        break;
      }
    }
    if (plantI <= winStart) plantI = startI;
  }

  // ---- Metric: kinematic sequence (hip peak vs shoulder peak) ----
  const hipRot = rotationSpeed(frames, L_HIP, R_HIP);
  const shoulderRot = rotationSpeed(frames, L_SHOULDER, R_SHOULDER);
  const peakIn = (series: number[]) => {
    let best = winStart;
    for (let i = winStart; i <= Math.min(frames.length - 1, peakI + 2); i++)
      if (series[i] > series[best]) best = i;
    return best;
  };
  const hipPeakI = peakIn(hipRot);
  const shoulderPeakI = peakIn(shoulderRot);
  const sequenceGapMs = Math.round(
    (frames[shoulderPeakI].t - frames[hipPeakI].t) * 1000,
  );

  // ---- Metric: hip–shoulder separation (peak, pre-contact) ----
  let sepPeak = 0;
  for (const f of frames.slice(winStart, peakI + 1)) {
    sepPeak = Math.max(
      sepPeak,
      angleDiff(
        lineAngle(f.lm[L_SHOULDER], f.lm[R_SHOULDER]),
        lineAngle(f.lm[L_HIP], f.lm[R_HIP]),
      ),
    );
  }

  // ---- Metric: tempo ----
  const tempo = frames[peakI].t - frames[startI].t;

  // ---- Metric: head drift AFTER plant (the lunge definition) ----
  const lungeWindow = frames.slice(plantI, Math.min(frames.length, peakI + 2));
  const noseXs = lungeWindow.map((f) => f.lm[NOSE].x);
  const noseYs = lungeWindow.map((f) => f.lm[NOSE].y);
  const drift =
    lungeWindow.length > 1
      ? Math.hypot(
          Math.max(...noseXs) - Math.min(...noseXs),
          Math.max(...noseYs) - Math.min(...noseYs),
        ) / bodyH
      : 0;

  // ---- Metric: stride ----
  let strideMax = 0;
  for (const f of frames.slice(winStart, peakI + 2)) {
    strideMax = Math.max(strideMax, Math.abs(f.lm[L_ANKLE].x - f.lm[R_ANKLE].x) / bodyH);
  }

  // ---- Metric: front-knee brace at contact ----
  const fc = frames[peakI].lm;
  const kneeBrace = jointAngle(fc[F_HIP], fc[F_KNEE], fc[F_ANKLE]);

  // ---- Metric: backside collapse (back-shoulder dip at launch) ----
  const fl = frames[startI].lm;
  const dy = fl[B_SHOULDER].y - fl[F_SHOULDER].y; // + = back shoulder lower
  const dx = Math.abs(fl[B_SHOULDER].x - fl[F_SHOULDER].x) + 1e-6;
  const shoulderTilt = Math.max(0, Math.round(deg(Math.atan2(dy, dx))));

  const metrics: SwingMetrics = {
    sequenceGapMs,
    hipShoulderSepDeg: Math.round(sepPeak),
    tempoSec: Math.round(tempo * 100) / 100,
    headDriftPct: Math.round(drift * 100),
    stridePct: Math.round(strideMax * 100),
    kneeBraceDeg: Math.round(kneeBrace),
    shoulderTiltDeg: shoulderTilt,
    peakHandSpeed: Math.round(peakSpeed * 10) / 10,
    swingStart: frames[startI].t,
    footPlant: frames[plantI].t,
    swingPeak: frames[peakI].t,
    trackingQuality: Math.round(meanVis * 100) / 100,
    viewRatio: Math.round(viewRatio * 100) / 100,
  };

  return { ok: true, metrics, findings: buildFindings(metrics) };
}

function buildFindings(m: SwingMetrics): Finding[] {
  const out: Finding[] = [];
  const add = (
    metric: Finding["metric"],
    severity: Finding["severity"],
    message: string,
    drillIds: string[] = [],
  ) => out.push({ metric, severity, message, drillIds });

  // 1. Kinematic sequence — the flagship
  if (m.sequenceGapMs >= T.seq.good) {
    add(
      "sequenceGapMs",
      "good",
      `Textbook sequence — your hips fire ${m.sequenceGapMs}ms before your shoulders. That's how power travels up the chain.`,
    );
  } else if (m.sequenceGapMs >= T.seq.ok) {
    add(
      "sequenceGapMs",
      "minor",
      `Hips and shoulders are rotating almost together (${m.sequenceGapMs}ms gap). Let the hips START the swing — the shoulders should be reacting, not leading.`,
      ["hip-fire-tee", "separation-stretch"],
    );
  } else {
    add(
      "sequenceGapMs",
      "major",
      `Your shoulders are firing BEFORE your hips (${m.sequenceGapMs}ms) — that's an arm swing. Biggest power unlock available: hips first, always.`,
      ["hip-fire-tee", "separation-stretch"],
    );
  }

  // 2. Separation
  if (m.hipShoulderSepDeg >= T.sep.good) {
    add(
      "hipShoulderSepDeg",
      "good",
      `Great separation (${m.hipShoulderSepDeg}°) — you're loading the rubber band.`,
    );
  } else if (m.hipShoulderSepDeg >= T.sep.minor) {
    add(
      "hipShoulderSepDeg",
      "minor",
      `Some separation (${m.hipShoulderSepDeg}°), but there's more coil available between hips and shoulders.`,
      ["separation-stretch"],
    );
  } else {
    add(
      "hipShoulderSepDeg",
      "major",
      `Low separation (${m.hipShoulderSepDeg}°) — hips and shoulders turning as one block leaks power.`,
      ["hip-fire-tee", "separation-stretch"],
    );
  }

  // 3. Lunge (head drift after plant)
  if (m.headDriftPct <= T.headDrift.good) {
    add(
      "headDriftPct",
      "good",
      `Quiet head after foot plant (${m.headDriftPct}% drift) — consistent contact starts here.`,
    );
  } else if (m.headDriftPct <= T.headDrift.minor) {
    add(
      "headDriftPct",
      "minor",
      `Head keeps moving after your front foot lands (${m.headDriftPct}%) — early lunge warning. Land, THEN turn.`,
      ["balance-beam"],
    );
  } else {
    add(
      "headDriftPct",
      "major",
      `Lunging: your head travels ${m.headDriftPct}% of your height after foot plant. The ball appears to speed up when your head is moving — quiet it down.`,
      ["balance-beam"],
    );
  }

  // 4. Front-knee brace
  if (m.kneeBraceDeg >= T.knee.braced) {
    add(
      "kneeBraceDeg",
      "good",
      `Front leg braces at contact (${m.kneeBraceDeg}°) — you're turning against a firm post.`,
    );
  } else if (m.kneeBraceDeg >= T.knee.soft) {
    add(
      "kneeBraceDeg",
      "minor",
      `Front knee stays a bit bent at contact (${m.kneeBraceDeg}°) — firming it up converts your stride into rotation.`,
      ["stride-ladder"],
    );
  } else {
    add(
      "kneeBraceDeg",
      "major",
      `Soft front leg (${m.kneeBraceDeg}° at contact) — power is leaking into the ground instead of into the ball.`,
      ["stride-ladder"],
    );
  }

  // 5. Backside collapse
  if (m.shoulderTiltDeg <= T.tilt.level) {
    add(
      "shoulderTiltDeg",
      "good",
      `Shoulders stay level at launch (${m.shoulderTiltDeg}° tilt) — no collapse.`,
    );
  } else if (m.shoulderTiltDeg <= T.tilt.dipped) {
    add(
      "shoulderTiltDeg",
      "minor",
      `Back shoulder dips ${m.shoulderTiltDeg}° at launch — watch for the uppercut creeping in.`,
      ["wall-bat-tempo"],
    );
  } else {
    add(
      "shoulderTiltDeg",
      "major",
      `Backside collapse: ${m.shoulderTiltDeg}° shoulder dip at launch. You'll swing uphill from there — stay tall through the load.`,
      ["wall-bat-tempo"],
    );
  }

  // 6. Tempo
  if (m.tempoSec < T.tempo.fastest) {
    add(
      "tempoSec",
      "minor",
      `Very quick trigger (${m.tempoSec}s) — could be rushing the sequence.`,
      ["wall-bat-tempo"],
    );
  } else if (m.tempoSec > T.tempo.slowest) {
    add(
      "tempoSec",
      "minor",
      `Long swing (${m.tempoSec}s launch→contact) — a more compact path gets you to the ball sooner.`,
      ["wall-bat-tempo"],
    );
  } else {
    add("tempoSec", "good", `Swing tempo (${m.tempoSec}s) is in a healthy range.`);
  }

  // 7. Stride
  if (m.stridePct < T.stride.min) {
    add(
      "stridePct",
      "minor",
      `Narrow stride (${m.stridePct}% of height) — get your lower half started.`,
      ["stride-ladder"],
    );
  } else if (m.stridePct > T.stride.max) {
    add(
      "stridePct",
      "minor",
      `Very wide stride (${m.stridePct}%) — can cost balance and rotation.`,
      ["stride-ladder"],
    );
  } else {
    add("stridePct", "good", `Stride width (${m.stridePct}% of height) looks solid.`);
  }

  const rank = { major: 0, minor: 1, good: 2 };
  out.sort((a, b) => rank[a.severity] - rank[b.severity]);
  return out;
}
