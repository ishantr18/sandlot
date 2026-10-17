"use client";

// Looping animated swing — a stick figure whose bat tip draws a glowing
// bat-path line as it swings. Pure SVG, no video. Five key poses (load →
// stride → slot → contact → finish) are blended with Catmull-Rom curves so
// every joint moves smoothly. Reduced-motion users see the contact pose with
// the full bat path already drawn.
import { useEffect, useState } from "react";

type Pt = [number, number];
interface Pose {
  head: Pt; neck: Pt; hip: Pt;
  elbow: Pt; hands: Pt; tip: Pt;
  bKnee: Pt; bFoot: Pt; fKnee: Pt; fFoot: Pt;
}
const JOINTS = ["head", "neck", "hip", "elbow", "hands", "tip", "bKnee", "bFoot", "fKnee", "fFoot"] as const;

// Side view, facing right (the pitcher is off to the right).
const KEYS: { t: number; pose: Pose }[] = [
  { t: 0.0, pose: { head: [114, 48], neck: [116, 74], hip: [116, 128], elbow: [100, 92], hands: [96, 66], tip: [70, 18], bKnee: [104, 170], bFoot: [96, 212], fKnee: [136, 160], fFoot: [132, 200] } },
  { t: 0.3, pose: { head: [120, 50], neck: [121, 76], hip: [122, 128], elbow: [104, 96], hands: [100, 72], tip: [64, 36], bKnee: [106, 170], bFoot: [96, 212], fKnee: [146, 170], fFoot: [158, 212] } },
  { t: 0.5, pose: { head: [123, 50], neck: [124, 77], hip: [126, 128], elbow: [118, 102], hands: [124, 96], tip: [76, 116], bKnee: [110, 172], bFoot: [97, 212], fKnee: [152, 170], fFoot: [160, 212] } },
  { t: 0.65, pose: { head: [125, 50], neck: [126, 77], hip: [128, 128], elbow: [142, 100], hands: [152, 100], tip: [214, 102], bKnee: [114, 172], bFoot: [99, 212], fKnee: [155, 170], fFoot: [160, 212] } },
  { t: 0.8, pose: { head: [124, 50], neck: [126, 77], hip: [128, 128], elbow: [150, 84], hands: [156, 80], tip: [196, 30], bKnee: [118, 174], bFoot: [104, 208], fKnee: [155, 170], fFoot: [160, 212] } },
  { t: 1.0, pose: { head: [123, 50], neck: [126, 77], hip: [128, 128], elbow: [148, 74], hands: [140, 62], tip: [92, 34], bKnee: [120, 174], bFoot: [108, 206], fKnee: [155, 170], fFoot: [160, 212] } },
];

const LOOP_MS = 3400;
const SWING_START = 0.12; // fraction of the loop: hold the load, then swing
const SWING_END = 0.5;
const FADE_START = 0.78;

function catmull(p0: number, p1: number, p2: number, p3: number, u: number) {
  const u2 = u * u, u3 = u2 * u;
  return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
}

// Pose at swing progress s ∈ [0, 1]
function poseAt(s: number): Pose {
  let i = 0;
  while (i < KEYS.length - 2 && s > KEYS[i + 1].t) i++;
  const k0 = KEYS[Math.max(0, i - 1)], k1 = KEYS[i], k2 = KEYS[i + 1], k3 = KEYS[Math.min(KEYS.length - 1, i + 2)];
  const u = Math.min(1, Math.max(0, (s - k1.t) / (k2.t - k1.t)));
  const out = {} as Pose;
  for (const j of JOINTS) {
    out[j] = [
      catmull(k0.pose[j][0], k1.pose[j][0], k2.pose[j][0], k3.pose[j][0], u),
      catmull(k0.pose[j][1], k1.pose[j][1], k2.pose[j][1], k3.pose[j][1], u),
    ];
  }
  return out;
}

// The bat-tip path through the hitting zone (slot → contact → extension),
// sampled once and drawn progressively as the glowing trail
const TRAIL_FROM = KEYS[2].t;
const TRAIL_TO = KEYS[4].t;
const TRAIL: Pt[] = Array.from({ length: 60 }, (_, n) => poseAt(TRAIL_FROM + ((TRAIL_TO - TRAIL_FROM) * n) / 59).tip);
const TRAIL_D = TRAIL.map((p, n) => `${n ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");

const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

export default function SwingTrace({ className = "" }: { className?: string }) {
  // Loop position 0..1; null = the still frame (contact + full bat path),
  // shown on the server render and to reduced-motion users
  const [phase, setPhase] = useState<number | null>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      setPhase(((now - start) % LOOP_MS) / LOOP_MS);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const s =
    phase == null ? KEYS[3].t : ease(Math.min(1, Math.max(0, (phase - SWING_START) / (SWING_END - SWING_START))));
  const p = poseAt(s);
  const drawn = phase == null ? 1 : Math.min(1, Math.max(0, (s - TRAIL_FROM) / (TRAIL_TO - TRAIL_FROM))); // 0..1 of the trail
  const trailOpacity = phase == null || phase < FADE_START ? 1 : Math.max(0, 1 - (phase - FADE_START) / 0.16);
  const line = (a: Pt, b: Pt) => ({ x1: a[0], y1: a[1], x2: b[0], y2: b[1] });

  return (
    <svg viewBox="40 0 200 230" className={className} role="img" aria-label="Animated swing with the AI-traced bat path">
      <defs>
        <filter id="dd-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {/* ground */}
      <line x1="60" y1="214" x2="220" y2="214" stroke="currentColor" strokeOpacity="0.15" strokeWidth="2" />
      {/* bat path — the AI's trace */}
      <path
        d={TRAIL_D}
        pathLength={1}
        fill="none"
        stroke="var(--primary)"
        strokeWidth="3.5"
        strokeLinecap="round"
        filter="url(#dd-glow)"
        strokeDasharray="1"
        strokeDashoffset={1 - drawn}
        opacity={trailOpacity}
      />
      {/* body */}
      <g stroke="#f5edd8" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <line {...line(p.neck, p.hip)} />
        <polyline points={[p.hip, p.bKnee, p.bFoot].map((q) => q.join(",")).join(" ")} />
        <polyline points={[p.hip, p.fKnee, p.fFoot].map((q) => q.join(",")).join(" ")} />
        <polyline points={[p.neck, p.elbow, p.hands].map((q) => q.join(",")).join(" ")} />
      </g>
      {/* bat */}
      <line {...line(p.hands, p.tip)} stroke="#c98f4e" strokeWidth="6" strokeLinecap="round" />
      {/* head — anonymized, like every uploaded swing */}
      <circle cx={p.head[0]} cy={p.head[1]} r="13" fill="rgba(200,210,230,.18)" stroke="#f5edd8" strokeWidth="2" strokeDasharray="3 3" />
      {/* tracked joints */}
      <g fill="var(--primary)">
        {[p.neck, p.hip, p.hands, p.fKnee, p.bKnee].map((q, n) => (
          <circle key={n} cx={q[0]} cy={q[1]} r="4" />
        ))}
      </g>
    </svg>
  );
}
