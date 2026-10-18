// Coach data — the review queue plus the coach's own review history.
// Shared by the classic queue (/coach) and the Field-skin coach screens
// (On Deck, Reviewed, Players). Reads only what the rules already allow a
// certified coach: analyzed sessions, comments, their own blocks/favorites,
// and assignments.
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { useSyncExternalStore } from "react";
import { db } from "@/lib/firebase";

export type QueueTag = "least-coached" | "new" | "repeat";

export interface QueueRow {
  id: string;
  playerId: string;
  createdAt: number;
  reviews: number; // coach comments on this swing, from every coach
  mine: number; // ...of which are mine
  tags: QueueTag[]; // Field skin pill tags (computed, never shown in the classic queue)
}

export interface CoachComment {
  id: string;
  sessionId: string;
  mentorId?: string;
  text: string;
  createdAt: number;
}

export interface CoachQueueData {
  rows: QueueRow[]; // blocked players already removed; unsorted (see sortQueue)
  fans: Set<string>; // players who favorited me
  myComments: CoachComment[];
  playerOf: Map<string, string>; // sessionId → playerId (every analyzed swing)
}

export async function loadCoachQueue(uid: string): Promise<CoachQueueData> {
  const [sessSnap, commentSnap, blockSnap, favSnap] = await Promise.all([
    getDocs(query(collection(db, "sessions"), where("status", "==", "analyzed"))),
    getDocs(collection(db, "comments")),
    getDocs(query(collection(db, "blocks"), where("coachId", "==", uid))),
    getDocs(query(collection(db, "favorites"), where("coachId", "==", uid))),
  ]);
  const fans = new Set(favSnap.docs.map((d) => d.data().playerId as string));

  // Count existing coach reviews per session (the equity signal)
  const reviewCount = new Map<string, number>();
  const mineCount = new Map<string, number>();
  const myComments: CoachComment[] = [];
  commentSnap.docs.forEach((d) => {
    const c = d.data();
    const sid = c.sessionId as string;
    reviewCount.set(sid, (reviewCount.get(sid) ?? 0) + 1);
    if (c.mentorId === uid) {
      mineCount.set(sid, (mineCount.get(sid) ?? 0) + 1);
      myComments.push({ id: d.id, sessionId: sid, mentorId: uid, text: c.text as string, createdAt: c.createdAt as number });
    }
  });

  // Blocks in either direction remove the player from this coach's world
  const blockedPlayers = new Set(blockSnap.docs.map((d) => d.data().playerId as string));

  const all = sessSnap.docs.map((d) => ({
    id: d.id,
    playerId: d.data().playerId as string,
    createdAt: d.data().createdAt as number,
  }));
  const playerOf = new Map(all.map((s) => [s.id, s.playerId]));

  // Per player: first swing ever, coach reviews received overall, and
  // whether I've reviewed them before — the inputs to the pill tags
  const firstSwing = new Map<string, { id: string; at: number }>();
  const playerReviews = new Map<string, number>();
  const mineByPlayer = new Set<string>();
  all.forEach((s) => {
    const f = firstSwing.get(s.playerId);
    if (!f || s.createdAt < f.at) firstSwing.set(s.playerId, { id: s.id, at: s.createdAt });
    playerReviews.set(s.playerId, (playerReviews.get(s.playerId) ?? 0) + (reviewCount.get(s.id) ?? 0));
    if (mineCount.has(s.id)) mineByPlayer.add(s.playerId);
  });

  const rows: QueueRow[] = all
    .filter((s) => !blockedPlayers.has(s.playerId))
    .map((s) => ({ ...s, reviews: reviewCount.get(s.id) ?? 0, mine: mineCount.get(s.id) ?? 0, tags: [] }));

  // Least coached = the queue's players with the fewest coach reviews overall.
  // Only meaningful when players differ (if everyone is tied, no one is "least").
  const queuePlayers = [...new Set(rows.map((r) => r.playerId))];
  const counts = queuePlayers.map((p) => playerReviews.get(p) ?? 0);
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  rows.forEach((r) => {
    if (queuePlayers.length > 1 && min < max && (playerReviews.get(r.playerId) ?? 0) === min) r.tags.push("least-coached");
    if (firstSwing.get(r.playerId)?.id === r.id) r.tags.push("new");
    if (mineByPlayer.has(r.playerId)) r.tags.push("repeat");
  });

  return { rows, fans, myComments, playerOf };
}

// "equity" = classic queue: least-reviewed first, then newest.
// "recent" = Field skin: newest first (tags carry the equity signal).
export function sortQueue(rows: QueueRow[], order: "equity" | "recent"): QueueRow[] {
  const r = [...rows];
  if (order === "equity") r.sort((a, b) => a.reviews - b.reviews || b.createdAt - a.createdAt);
  else r.sort((a, b) => b.createdAt - a.createdAt);
  return r;
}

// What one swing breakdown would cost from a private hitting coach
// (same figure as the Home impact strip).
export const VALUE_PER_REVIEW = 25;

// Coach impact from the already-loaded queue data (same numbers as the
// classic Home strip; swings outside the analyzed set are looked up).
export async function coachImpactFrom(data: CoachQueueData) {
  const sessionIds = [...new Set(data.myComments.map((c) => c.sessionId))];
  const players = await Promise.all(
    sessionIds.map((sid) =>
      data.playerOf.has(sid)
        ? data.playerOf.get(sid)!
        : getDoc(doc(db, "sessions", sid))
            .then((d) => (d.data()?.playerId as string | undefined) ?? null)
            .catch(() => null),
    ),
  );
  return {
    swings: sessionIds.length,
    people: new Set(players.filter(Boolean)).size,
    value: sessionIds.length * VALUE_PER_REVIEW,
    comments: data.myComments.length,
  };
}

// ── My review history (Reviewed + Players screens) ──────────────────────
export interface ReviewItem {
  id: string;
  sessionId: string;
  playerId: string;
  text: string;
  createdAt: number;
  drillIds: string[]; // drills I assigned this player around the time of this comment
}

// An assignment has no session id, so it's matched to my nearest comment on
// that player's swings made within this window (they're made in one visit).
const ASSIGN_WINDOW_MS = 30 * 60 * 1000;

// Every comment I've left, newest first, blocked players removed.
export async function loadReviewHistory(uid: string): Promise<ReviewItem[]> {
  const [commentSnap, blockSnap, assignSnap] = await Promise.all([
    getDocs(query(collection(db, "comments"), where("mentorId", "==", uid))),
    getDocs(query(collection(db, "blocks"), where("coachId", "==", uid))),
    getDocs(query(collection(db, "assignments"), where("assignedBy", "==", uid))),
  ]);
  const blocked = new Set(blockSnap.docs.map((d) => d.data().playerId as string));
  const sessionIds = [...new Set(commentSnap.docs.map((d) => d.data().sessionId as string))];
  const sessions = new Map(
    (
      await Promise.all(
        sessionIds.map((sid) =>
          getDoc(doc(db, "sessions", sid))
            .then((d) => (d.exists() ? ([sid, d.data()] as const) : null))
            .catch(() => null),
        ),
      )
    ).filter((x) => x !== null),
  );

  const reviews: ReviewItem[] = commentSnap.docs
    .map((d) => {
      const c = d.data();
      const s = sessions.get(c.sessionId as string);
      return {
        id: d.id,
        sessionId: c.sessionId as string,
        playerId: (s?.playerId as string | undefined) ?? "",
        text: c.text as string,
        createdAt: c.createdAt as number,
        drillIds: [] as string[],
      };
    })
    .filter((r) => r.playerId && !blocked.has(r.playerId))
    .sort((a, b) => b.createdAt - a.createdAt);

  assignSnap.docs.forEach((d) => {
    const a = d.data() as { playerId: string; drillId: string; createdAt: number };
    let best: ReviewItem | null = null;
    for (const r of reviews) {
      if (r.playerId !== a.playerId) continue;
      const gap = Math.abs(r.createdAt - a.createdAt);
      if (gap <= ASSIGN_WINDOW_MS && (!best || gap < Math.abs(best.createdAt - a.createdAt))) best = r;
    }
    if (best && !best.drillIds.includes(a.drillId)) best.drillIds.push(a.drillId);
  });

  return reviews;
}

// ── On Deck count for the Field tab bar badge ───────────────────────────
// Set by the On Deck screen when its queue loads (no extra reads); the tab
// bar shows it for the same coach only.
let waiting: { uid: string; n: number } | null = null;
const listeners = new Set<() => void>();
export function setWaitingCount(uid: string, n: number) {
  waiting = { uid, n };
  listeners.forEach((l) => l());
}
export function useWaitingCount(uid: string | undefined): number | null {
  const v = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => waiting,
    () => null,
  );
  return v && v.uid === uid ? v.n : null;
}
