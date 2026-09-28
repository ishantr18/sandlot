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
  // Nullable metrics: null means "this clip could not support the
  // measurement" — never 0, which would read as a real (and excellent) score.
  headDriftPct: number | null; // nose travel AFTER front-foot plant, % of body height (lunge)
  stridePct: number | null; // ankle spread as % of body height
  kneeBraceDeg: number | null; // front-knee angle at contact (≈180 = braced)
  shoulderTiltDeg: number | null; // back-shoulder dip at launch (collapse/uppercut)
  peakHandSpeed: number; // body-heights per second (relative unit)
  swingStart: number; // s — launch
  footPlant: number | null; // s — front-foot plant (estimated)
  swingPeak: number; // s — peak hand speed (≈ contact)
  trackingQuality: number; // 0..1 mean landmark visibility
  viewRatio: number; // shoulder-width/body-height — camera-angle indicator (side ≈ <0.2)
  coverage: "full" | "upper-body"; // which measurements this clip supported
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
  minCoreVis: 0.5, // mean visibility of the CORE landmarks, not all 33
  minHandSpeed: 0.8, // body-heights/sec — below this, no swing detected
  burstFrac: 0.35, // a "fast stretch" = hand speed above 35% of the clip's max
  launchFrac: 0.15, // launch = hands back under 15% of peak speed
  strideSearch: 1.0, // seconds before contact to look for the front-foot step
  minStepSpeed: 0.6, // body-heights/sec — front ankle slower than this = no stride
  seq: { good: 25, ok: 0 }, // ms hip-peak leads shoulder-peak
  sep: { good: 22, minor: 14 }, // degrees (2D proxy)
  tempo: { fastest: 0.1, slowest: 0.6, maxSearch: 0.8 }, // seconds (0.5s was a real swing — widened)
  headDrift: { good: 6, minor: 12 }, // % of body height AFTER plant
  stride: { min: 8, max: 35 }, // % of body height
  knee: { braced: 158, soft: 140 }, // degrees at contact
  tilt: { level: 15, dipped: 25 }, // degrees at launch
  viewRatioMax: 0.22, // shoulder width / body height — above this it's a front-facing video
};

// Metrics still computed and stored (for /lab and a future redesign) but NOT
// shown to players or turned into coaching. Hip–shoulder separation: from the
// side the two hips overlap, so the hip line's angle is mostly noise — web
// validation (docs/VALIDATION.md) found it raised false "major" alarms on 5 of
// 10 good swings. Wrong coaching is worse than none, so it's off until it's
// redesigned.
export const DISABLED_METRICS = new Set<string>(["hipShoulderSepDeg"]);

// Standing proportions: shoulder→hip is ~38% of shoulder→ankle. Lets an
// upper-body clip keep a body-relative ruler when the feet are out of frame.
export const TORSO_RATIO = 0.38;

// The landmarks that decide whether a clip is trackable at all.
const CORE = [NOSE, L_SHOULDER, R_SHOULDER, L_HIP, R_HIP, L_WRIST, R_WRIST];

// Which side is the front side? Handles left-handed hitters and either camera
// side. Ankles are the clearest signal; knees and hips are fallbacks for clips
// that cut the feet off. Returns null when none of the three can separate the
// sides — guessing would report a collapsed back shoulder as "level".
function frontSide(frames: PoseFrame[], i: number, dir: number): boolean | null {
  const pairs: [number, number][] = [
    [L_ANKLE, R_ANKLE],
    [L_KNEE, R_KNEE],
    [L_HIP, R_HIP],
  ];
  for (const [l, r] of pairs) {
    const a = frames[i].lm[l], b = frames[i].lm[r];
    if (Math.min(a.v, b.v) < 0.4) continue;
    if (Math.abs(a.x - b.x) < 0.02) continue; // too close together to tell apart
    return (a.x - b.x) * dir > 0;
  }
  return null;
}
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
// Rate of change of a per-frame quantity, measured across a ±RATE_HALF
// window (central difference) instead of frame-to-frame. At 60fps the
// frame-to-frame step is 17ms and landmark wobble dominates it; comparing
// frames ~30ms either side keeps the real motion and cancels most wobble.
// Time-based, not index-based, because samples are unevenly spaced (dense
// around the swing, sparse elsewhere).
const RATE_HALF = 0.03;
function rateSeries(
  frames: PoseFrame[],
  delta: (a: PoseFrame, b: PoseFrame) => number, // |change| from a to b
): number[] {
  const n = frames.length;
  return frames.map((f, i) => {
    let j = i, k = i;
    while (j > 0 && f.t - frames[j].t < RATE_HALF) j--;
    while (k < n - 1 && frames[k].t - f.t < RATE_HALF) k++;
    const dt = frames[k].t - frames[j].t;
    return dt > 0 ? delta(frames[j], frames[k]) / dt : 0;
  });
}
// |angular speed| series (deg/sec) of the line between two landmarks
function rotationSpeed(frames: PoseFrame[], ia: number, ib: number) {
  return rateSeries(frames, (a, b) =>
    Math.abs(
      signedAngleDelta(lineAngle(b.lm[ia], b.lm[ib]), lineAngle(a.lm[ia], a.lm[ib])),
    ),
  );
}

// Left/right pairs in MediaPipe's 33-point topology (eyes, ears, mouth,
// arms, hands, legs, feet).
const LR_PAIRS = [
  [1, 4], [2, 5], [3, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16],
  [17, 18], [19, 20], [21, 22], [23, 24], [25, 26], [27, 28], [29, 30], [31, 32],
];

// From the side, one body half hides behind the other, and the pose model
// sometimes labels the far hip as the near hip on one frame and correctly on
// the next. A left/right flip turns the hip line 180° in one frame — a fake
// rotation-speed spike bigger than any real swing. Fix: walk the series and,
// whenever relabeling left↔right fits the previous frame much better, flip it
// back. Identity follows motion continuity, not the model's per-frame guess.
export function fixSideSwaps(frames: PoseFrame[]): PoseFrame[] {
  const out: PoseFrame[] = [];
  for (const f of frames) {
    const prev = out[out.length - 1];
    if (!prev) {
      out.push(f);
      continue;
    }
    const swapped = f.lm.slice();
    for (const [a, b] of LR_PAIRS) {
      swapped[a] = f.lm[b];
      swapped[b] = f.lm[a];
    }
    const drift = (lm: PoseFrame["lm"]) =>
      LR_PAIRS.flat().reduce(
        (s, i) => s + Math.hypot(lm[i].x - prev.lm[i].x, lm[i].y - prev.lm[i].y),
        0,
      );
    out.push(drift(swapped) < drift(f.lm) * 0.6 ? { t: f.t, lm: swapped } : f);
  }
  return out;
}

// Landmark jitter vs. sample rate: the model's position guess wobbles by a few
// pixels every frame no matter the frame rate, but at 60fps the time between
// frames is 3× shorter than at 20fps — so the same wobble reads as 3× the
// SPEED, as big as a real swing. Averaging each point over a ±25ms window
// (a time window, not a frame count, because v3 samples are unevenly spaced)
// cancels the wobble while keeping the swing's timing centered.
const DENOISE_HALF_WINDOW = 0.025;
export function denoise(frames: PoseFrame[], half = DENOISE_HALF_WINDOW): PoseFrame[] {
  return frames.map((f, i) => {
    let lo = i, hi = i;
    while (lo > 0 && f.t - frames[lo - 1].t <= half) lo--;
    while (hi < frames.length - 1 && frames[hi + 1].t - f.t <= half) hi++;
    const n = hi - lo + 1;
    if (n === 1) return f;
    return {
      t: f.t,
      lm: f.lm.map((_, k) => {
        let x = 0, y = 0;
        for (let j = lo; j <= hi; j++) {
          x += frames[j].lm[k].x;
          y += frames[j].lm[k].y;
        }
        return { x: x / n, y: y / n, v: f.lm[k].v };
      }),
    };
  });
}

// The hands, as ONE point: the midpoint of both wrists. v2 used "whichever
// wrist the model sees better", re-chosen every frame — when the arms split
// in the follow-through, that choice flip-flopped between two wrists a
// forearm apart, and at 60fps each flip read as the fastest hand movement in
// the clip. The engine then "found" the swing in the follow-through and
// rejected good clips. Both hands are on the bat, so their midpoint is the
// grip, and it can't teleport.
function hands(f: PoseFrame) {
  const a = f.lm[L_WRIST], b = f.lm[R_WRIST];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

// v4: a swing is a BURST — the hands travel most of a body height in a few
// tenths of a second. v1–v3 took the single fastest frame, and at 60fps
// one frame of landmark wobble could out-score the real swing (it did, on
// three of our own good clips). Now: find every stretch where the hands are
// moving fast, score each by how FAR the hands travelled in it, and keep
// the biggest. Wobble is fast but goes nowhere; a swing goes somewhere.
export interface Burst {
  from: number; // frame index where the fast stretch begins
  to: number; // …and ends
  travel: number; // how far the hands moved in it, in body heights
}
// `scale` = the clip's body-height ruler (hand speed in body heights/sec).
// Returns bursts biggest-travel first; empty when nothing counts as a swing.
export function findBursts(frames: PoseFrame[], scale: number) {
  const handSpeed = rateSeries(frames, (a, b) => {
    const p = hands(a), q = hands(b);
    return Math.hypot(q.x - p.x, q.y - p.y) / scale;
  });
  const maxSpeed = Math.max(0, ...handSpeed);
  const bursts: Burst[] = [];
  if (maxSpeed < T.minHandSpeed) return { handSpeed, bursts };
  const burstMin = maxSpeed * T.burstFrac;
  for (let i = 0; i < frames.length; ) {
    if (handSpeed[i] < burstMin) {
      i++;
      continue;
    }
    let j = i, travel = 0;
    while (j + 1 < frames.length && handSpeed[j + 1] >= burstMin) {
      travel += ((handSpeed[j] + handSpeed[j + 1]) / 2) * (frames[j + 1].t - frames[j].t);
      j++;
    }
    bursts.push({ from: i, to: j, travel });
    i = j + 1;
  }
  bursts.sort((x, y) => y.travel - x.travel);
  return { handSpeed, bursts };
}

export function analyzeSwing(rawFrames: PoseFrame[]): SwingAnalysis {
  const frames = denoise(fixSideSwaps(rawFrames));
  // ---- Quality gate ----
  if (frames.length < T.minFrames) {
    return {
      ok: false,
      rejectReason:
        "Couldn't track a person in this clip. Make sure your whole body is visible and the clip is at least a few seconds long.",
    };
  }
  // Trackability is judged on the CORE landmarks. v1 averaged all 33, so a
  // clip lost points for feet that were merely out of frame and a perfectly
  // readable upper body got rejected with a "bad lighting" message that
  // wasn't true.
  const coreVis = mean(frames.map((f) => mean(CORE.map((i) => f.lm[i].v))));
  if (coreVis < T.minCoreVis) {
    return {
      ok: false,
      rejectReason:
        "Tracking quality is too low — usually bad lighting or a backlit shot. Face the light source and try again.",
    };
  }

  // Feet out of frame is NOT fatal. Four of the seven metrics never touch the
  // lower body, so we drop to upper-body coverage and say exactly which
  // measurements were unavailable instead of throwing the clip away.
  const ankleVis = mean(frames.map((f) => (f.lm[L_ANKLE].v + f.lm[R_ANKLE].v) / 2));
  const lowerBody = ankleVis >= T.minAnkleVis;

  // Body height in-frame — our distance-free ruler. Shoulder→ankle when the
  // feet are visible, otherwise the torso scaled by standing proportions, so
  // an upper-body clip still has a body-relative scale for hand speed.
  const bodyH = lowerBody
    ? mean(
        frames.map((f) =>
          Math.abs(
            (f.lm[L_ANKLE].y + f.lm[R_ANKLE].y) / 2 -
              (f.lm[L_SHOULDER].y + f.lm[R_SHOULDER].y) / 2,
          ),
        ),
      )
    : mean(
        frames.map((f) =>
          Math.abs(
            (f.lm[L_HIP].y + f.lm[R_HIP].y) / 2 -
              (f.lm[L_SHOULDER].y + f.lm[R_SHOULDER].y) / 2,
          ),
        ),
      ) / TORSO_RATIO;
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
  const { handSpeed, bursts } = findBursts(frames, bodyH);
  if (!bursts.length) {
    return {
      ok: false,
      rejectReason:
        "No swing detected in this clip — take one full swing with your hands visible.",
    };
  }
  const best = bursts[0];
  let peakI = best.from;
  for (let i = best.from; i <= best.to; i++) if (handSpeed[i] > handSpeed[peakI]) peakI = i;
  const peakSpeed = handSpeed[peakI];
  // Launch: walk back from the peak until the hands were nearly still.
  let startI = peakI;
  while (
    startI > 0 &&
    handSpeed[startI - 1] > peakSpeed * T.launchFrac &&
    frames[peakI].t - frames[startI - 1].t < T.tempo.maxSearch
  )
    startI--;
  const winStart = Math.max(0, startI - 4);

  // Degenerate-clip guards: never issue confident coaching on a swing the
  // camera didn't fully capture (our Side_good3 test failed exactly this way).
  if (frames[peakI].t - frames[0].t < 0.35 || startI === 0) {
    return {
      ok: false,
      rejectReason:
        "The swing happens at the very start of the clip, so there's nothing to measure it against. Start recording at least a second BEFORE you swing.",
    };
  }
  if (frames[frames.length - 1].t - frames[peakI].t < 0.1) {
    return {
      ok: false,
      rejectReason:
        "The clip ends right at the swing — keep recording for a second after contact so the full motion is captured.",
    };
  }
  // Timed in seconds and in frames: a swing we sampled fewer than 4 times
  // can't be split into launch / plant / contact honestly.
  if (peakI - startI < 3) {
    return {
      ok: false,
      rejectReason:
        "Couldn't reliably time this swing (too few frames across the motion). Try again with steadier framing and the whole load-to-contact visible.",
    };
  }

  // ---- Swing direction & front leg ----
  const hipMidX = (i: number) => (frames[i].lm[L_HIP].x + frames[i].lm[R_HIP].x) / 2;
  const dir = Math.sign(hipMidX(peakI) - hipMidX(winStart)) || 1;
  const frontIsLeft = frontSide(frames, peakI, dir);
  const F_ANKLE = frontIsLeft ? L_ANKLE : R_ANKLE;
  const F_KNEE = frontIsLeft ? L_KNEE : R_KNEE;
  const F_HIP = frontIsLeft ? L_HIP : R_HIP;
  const B_SHOULDER = frontIsLeft ? R_SHOULDER : L_SHOULDER;
  const F_SHOULDER = frontIsLeft ? L_SHOULDER : R_SHOULDER;

  // ---- Front-foot plant: front ankle stops moving before contact ----
  // Needs the feet; without them there is no plant, and every metric defined
  // relative to the plant reports null rather than a number measured from a
  // guessed instant.
  let plantI: number | null = null;
  let liftI: number | null = null; // front foot leaves the ground (stride start)
  if (lowerBody && frontIsLeft !== null) {
    const ankleSpeed = rateSeries(frames, (a, b) => {
      const p = a.lm[F_ANKLE], q = b.lm[F_ANKLE];
      return Math.hypot(q.x - p.x, q.y - p.y) / bodyH;
    });
    // v4: the stride happens during the LOAD, often before the hands launch,
    // so search the full second before contact — not just from launch (v3
    // searched from launch and so usually found no stride at all).
    let from = peakI;
    while (from > 0 && frames[peakI].t - frames[from - 1].t <= T.strideSearch) from--;
    let maxI = from;
    for (let i = from; i <= peakI; i++) if (ankleSpeed[i] > ankleSpeed[maxI]) maxI = i;
    if (ankleSpeed[maxI] < T.minStepSpeed) {
      // The front foot never really moved: a no-stride swing. Plant = launch.
      plantI = liftI = startI;
    } else {
      const thresh = ankleSpeed[maxI] * 0.25;
      let p = maxI;
      while (p < peakI && ankleSpeed[p] >= thresh) p++;
      let l = maxI;
      while (l > from && ankleSpeed[l] >= thresh) l--;
      plantI = p;
      liftI = l;
    }
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
  let drift: number | null = null;
  if (plantI !== null) {
    const lungeWindow = frames.slice(plantI, Math.min(frames.length, peakI + 2));
    const noseXs = lungeWindow.map((f) => f.lm[NOSE].x);
    const noseYs = lungeWindow.map((f) => f.lm[NOSE].y);
    drift =
      lungeWindow.length > 1
        ? Math.hypot(
            Math.max(...noseXs) - Math.min(...noseXs),
            Math.max(...noseYs) - Math.min(...noseYs),
          ) / bodyH
        : 0;
  }

  // ---- Metric: stride ----
  // v4: how far the FRONT FOOT travels from lift to landing. v1–v3 used the
  // widest gap between the two ankles, which is stance width, not stride —
  // a no-stride hitter with a wide stance scored as a "very wide stride"
  // (web validation, Sep 27: all three coach-labelled no-stride swings).
  let strideMax: number | null = null;
  if (plantI !== null && liftI !== null) {
    strideMax = Math.abs(frames[plantI].lm[F_ANKLE].x - frames[liftI].lm[F_ANKLE].x) / bodyH;
  }

  // ---- Metric: front-knee brace at contact ----
  let kneeBrace: number | null = null;
  if (lowerBody && frontIsLeft !== null) {
    const fc = frames[peakI].lm;
    kneeBrace = jointAngle(fc[F_HIP], fc[F_KNEE], fc[F_ANKLE]);
  }

  // ---- Metric: backside collapse (back-shoulder dip at launch) ----
  let shoulderTilt: number | null = null;
  if (frontIsLeft !== null) {
    const fl = frames[startI].lm;
    const dy = fl[B_SHOULDER].y - fl[F_SHOULDER].y; // + = back shoulder lower
    const dx = Math.abs(fl[B_SHOULDER].x - fl[F_SHOULDER].x) + 1e-6;
    shoulderTilt = Math.max(0, Math.round(deg(Math.atan2(dy, dx))));
  }

  const metrics: SwingMetrics = {
    sequenceGapMs,
    hipShoulderSepDeg: Math.round(sepPeak),
    tempoSec: Math.round(tempo * 100) / 100,
    headDriftPct: drift === null ? null : Math.round(drift * 100),
    stridePct: strideMax === null ? null : Math.round(strideMax * 100),
    kneeBraceDeg: kneeBrace === null ? null : Math.round(kneeBrace),
    shoulderTiltDeg: shoulderTilt,
    peakHandSpeed: Math.round(peakSpeed * 10) / 10,
    swingStart: frames[startI].t,
    footPlant: plantI === null ? null : frames[plantI].t,
    swingPeak: frames[peakI].t,
    trackingQuality: Math.round(coreVis * 100) / 100,
    viewRatio: Math.round(viewRatio * 100) / 100,
    coverage: lowerBody ? "full" : "upper-body",
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
      ["hip-fire-tee", "step-back"],
    );
  } else {
    add(
      "sequenceGapMs",
      "major",
      `Your shoulders are firing BEFORE your hips (${m.sequenceGapMs}ms) — that's an arm swing. Biggest power unlock available: hips first, always.`,
      ["hip-fire-tee", "step-back"],
    );
  }

  // 2. Separation — disabled (see DISABLED_METRICS)
  if (!DISABLED_METRICS.has("hipShoulderSepDeg")) {
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
  }

  // 3. Lunge (head drift after plant) — needs the front-foot plant
  if (m.headDriftPct === null) {
    // nothing: unmeasured metrics are reported once, at the end
  } else if (m.headDriftPct <= T.headDrift.good) {
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
      ["no-stride", "balance-beam"],
    );
  } else {
    add(
      "headDriftPct",
      "major",
      `Lunging: your head travels ${m.headDriftPct}% of your height after foot plant. The ball appears to speed up when your head is moving — quiet it down.`,
      ["no-stride", "balance-beam"],
    );
  }

  // 4. Front-knee brace — needs the front leg in frame
  if (m.kneeBraceDeg === null) {
    // reported at the end
  } else if (m.kneeBraceDeg >= T.knee.braced) {
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
      ["firm-front-side"],
    );
  } else {
    add(
      "kneeBraceDeg",
      "major",
      `Soft front leg (${m.kneeBraceDeg}° at contact) — power is leaking into the ground instead of into the ball.`,
      ["firm-front-side"],
    );
  }

  // 5. Backside collapse — needs the front/back side to be identifiable
  if (m.shoulderTiltDeg === null) {
    // reported at the end
  } else if (m.shoulderTiltDeg <= T.tilt.level) {
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
      ["high-tee", "wall-behind-back-foot"],
    );
  } else {
    add(
      "shoulderTiltDeg",
      "major",
      `Backside collapse: ${m.shoulderTiltDeg}° shoulder dip at launch. You'll swing uphill from there — stay tall through the load.`,
      ["high-tee", "wall-behind-back-foot"],
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

  // 7. Stride — needs both feet in frame
  if (m.stridePct === null) {
    // reported at the end
  } else if (m.stridePct < T.stride.min) {
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

  // What this clip could NOT support. One honest note beats silently missing
  // tiles — and it tells the player exactly how to film a clip that gets the
  // full read next time.
  if (m.coverage === "upper-body" || m.shoulderTiltDeg === null) {
    const missing = [
      m.headDriftPct === null && "head drift after foot plant",
      m.stridePct === null && "stride",
      m.kneeBraceDeg === null && "front-knee brace",
      m.shoulderTiltDeg === null && "shoulder tilt",
    ].filter(Boolean) as string[];
    if (missing.length) {
      add(
        "quality",
        "minor",
        `Measured what this framing supports. Couldn't measure ${missing.join(", ")} — your feet need to be in frame for those. Everything above is still a real read on your swing.`,
      );
    }
  }

  const rank = { major: 0, minor: 1, good: 2 };
  out.sort((a, b) => rank[a.severity] - rank[b.severity]);
  return out;
}
