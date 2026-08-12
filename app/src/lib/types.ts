// Data model — first pass, mirrors docs/BLUEPRINT.md
// Firestore collections: users, sessions, drills, assignments, comments

export type Role = "player" | "mentor" | "guardian";

export interface UserProfile {
  uid: string;
  displayName: string;
  role: Role;
  guardianOf?: string[]; // player uids (guardian accounts)
  linkedGuardian?: string; // guardian uid (player accounts)
  verifiedMentor?: boolean; // granted only through partner orgs
  createdAt: number;
}

// One uploaded + analyzed swing video
export interface Session {
  id: string;
  playerId: string;
  videoPathname: string; // path in the PRIVATE store (never a public URL); always the blurred version
  createdAt: number;
  status: "uploaded" | "analyzed" | "rejected"; // rejected = failed quality gate
  metrics?: SwingMetrics;
  findings?: Finding[];
}

// The 4 metrics — only what's robust from a single 2D side view
export interface SwingMetrics {
  hipShoulderSeparationDeg: number; // peak separation angle
  swingTempoFrames: number; // stride-foot plant → contact
  headDriftPx: number; // nose displacement across swing (normalized)
  strideRatio: number; // stride length relative to height proxy
  landmarkConfidence: number; // avg confidence, used by quality gate
}

export interface Finding {
  metric: keyof SwingMetrics;
  severity: "good" | "minor" | "major";
  message: string; // plain English: "Your hips fire late"
  drillIds: string[]; // auto-matched drills
}

export interface Drill {
  id: string;
  name: string;
  description: string;
  flawTags: string[]; // which findings it fixes
  mediaUrl?: string;
}

export interface Assignment {
  id: string;
  drillId: string;
  playerId: string;
  assignedBy: "system" | string; // mentor uid
  status: "assigned" | "done";
  createdAt: number;
}

// Mentor comments: timestamped on video, guardian-visible by design. NO DMs anywhere.
export interface Comment {
  id: string;
  sessionId: string;
  mentorId: string;
  timestampSec: number; // position in the video
  text: string;
  createdAt: number;
}
