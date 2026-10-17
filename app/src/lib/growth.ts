// Athlete growth — turns each analyzed swing into five skill levels (0–100%)
// and compares the player to THEMSELVES: their first 3 swings vs their last 3.
// No leaderboards, no comparing kids to each other.
//
// Why skill levels instead of raw % change: head drift going 10% → 5% is a
// "−50%" change but a big improvement. Every level is "higher is better",
// using the same good / needs-work lines the coaching uses (swingMetrics T).
import type { SwingMetrics } from "./swingMetrics";

export const SKILLS = ["core", "hands", "balance", "lowerHalf", "posture"] as const;
export type Skill = (typeof SKILLS)[number];

export const SKILL_INFO: Record<Skill, { name: string; what: string }> = {
  core: { name: "Core", what: "Hip turn — your lower half driving the swing" },
  hands: { name: "Hands", what: "Quick, compact hands to the ball" },
  balance: { name: "Balance", what: "A quiet head — no lunging" },
  lowerHalf: { name: "Lower Half", what: "Stride and a firm front leg" },
  posture: { name: "Posture", what: "Level shoulders — no back-side collapse" },
};

// Straight-line interpolation through (value, level) points, clamped.
function curve(v: number, pts: [number, number][]): number {
  if (v <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    if (v <= x1) return y0 + ((v - x0) / (x1 - x0)) * (y1 - y0);
  }
  return pts[pts.length - 1][1];
}
const avg = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;

// Anchors line up with the coaching thresholds: "needs work" ≈ 40%,
// "good" ≈ 70%, textbook ≈ 100%.
export function skillLevels(m: SwingMetrics): Partial<Record<Skill, number>> {
  const out: Partial<Record<Skill, number>> = {};

  // Core: hip turn (validated), blended with hips-before-shoulders on 60 fps clips
  if (m.hipTurnDeg != null) {
    const turn = curve(m.hipTurnDeg, [[10, 0], [28, 40], [40, 70], [65, 100]]);
    out.core =
      m.sequenceGapMs != null
        ? turn * 0.7 + curve(m.sequenceGapMs, [[-40, 10], [-15, 40], [15, 70], [45, 100]]) * 0.3
        : turn;
  }
  // Hands: launch-to-contact time. ~0.15 s is quick and compact; longer is a
  // long path. Under 0.1 s usually means the clip only caught part of it.
  if (m.tempoSec != null && m.tempoSec > 0)
    out.hands = curve(m.tempoSec, [[0.05, 50], [0.1, 85], [0.16, 100], [0.25, 70], [0.4, 40], [0.6, 10]]);
  // Balance: head drift after foot plant (% of body height)
  if (m.headDriftPct != null) out.balance = curve(m.headDriftPct, [[2, 100], [6, 70], [12, 40], [25, 0]]);
  // Lower half: stride (front-foot travel) + front-knee brace, whichever measured
  const lower: number[] = [];
  if (m.stridePct != null) lower.push(curve(m.stridePct, [[0, 10], [8, 50], [15, 85], [25, 100], [40, 80], [60, 40]]));
  if (m.kneeBraceDeg != null) lower.push(curve(m.kneeBraceDeg, [[120, 0], [140, 40], [158, 70], [172, 100]]));
  if (lower.length) out.lowerHalf = avg(lower);
  // Posture: back-shoulder dip at launch
  if (m.shoulderTiltDeg != null) out.posture = curve(m.shoulderTiltDeg, [[5, 100], [15, 70], [25, 40], [40, 0]]);
  return out;
}

export const WINDOW = 3; // swings averaged for "start" and "now"
export const STEADY_BAND = 5; // smaller changes than this are swing-to-swing noise

export interface SkillGrowth {
  skill: Skill;
  swings: number; // analyzed swings that measured this skill
  now: number | null; // avg level of the last 3 (null until 3 swings)
  start: number | null; // avg level of the first 3
  delta: number | null; // now − start, once there are more than 3 swings
}

export interface GrowthSession {
  createdAt: number;
  status?: string;
  metrics?: SwingMetrics;
}

export function computeGrowth(sessions: GrowthSession[]): SkillGrowth[] {
  const analyzed = sessions
    .filter((s) => s.status === "analyzed" && s.metrics)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((s) => skillLevels(s.metrics!));
  return SKILLS.map((skill) => {
    const levels = analyzed.map((l) => l[skill]).filter((v): v is number => v != null);
    if (levels.length < WINDOW) return { skill, swings: levels.length, now: null, start: null, delta: null };
    const start = avg(levels.slice(0, WINDOW));
    const now = avg(levels.slice(-WINDOW));
    return {
      skill,
      swings: levels.length,
      now: Math.round(now),
      start: Math.round(start),
      delta: levels.length > WINDOW ? Math.round(now - start) : null,
    };
  });
}

// First analyzed swing vs the newest one, side by side — single swings, not
// averages, so the player can see the two clips the numbers came from.
export interface SwingCompare {
  first: { createdAt: number; levels: Partial<Record<Skill, number>> };
  latest: { createdAt: number; levels: Partial<Record<Skill, number>> };
}
export function firstVsLatest(sessions: GrowthSession[]): SwingCompare | null {
  const analyzed = sessions
    .filter((s) => s.status === "analyzed" && s.metrics)
    .sort((a, b) => a.createdAt - b.createdAt);
  if (analyzed.length < 2) return null;
  const pick = (s: GrowthSession) => ({ createdAt: s.createdAt, levels: skillLevels(s.metrics!) });
  return { first: pick(analyzed[0]), latest: pick(analyzed[analyzed.length - 1]) };
}

// Effort: always in the kid's control, always moves forward.
export const WEEKLY_SWING_GOAL = 3;
export function swingsThisWeek(sessions: GrowthSession[], now = Date.now()): number {
  return sessions.filter((s) => s.createdAt > now - 7 * 24 * 60 * 60 * 1000).length;
}
