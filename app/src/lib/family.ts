// Family linking + coach certification — the client half.
// The REAL enforcement is in firestore.rules; these helpers just make the
// allowed moves. A parent links to a player only with a code generated on
// the player's own account (knowing an email is no longer enough), and a
// coach is certified only when the admin approves their application.
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";

// The admin who approves coaches. UI only — the rules hold the real list.
export const ADMIN_UIDS = ["39qqWC1J7LciK4wUTPd3wzwYJXw2"];

const CODE_LIFETIME_MS = 24 * 60 * 60 * 1000; // a code works for 24 hours
// No 0/O, 1/I/L: easy to read aloud from a phone screen
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export interface FamilyCode {
  code: string;
  expiresAt: number;
}

// Player: make a fresh code (old ones are cancelled — one live code at a time)
export async function newFamilyCode(playerId: string, playerName: string): Promise<FamilyCode> {
  const old = await getDocs(query(collection(db, "linkCodes"), where("playerId", "==", playerId)));
  await Promise.all(old.docs.map((d) => deleteDoc(d.ref)));
  const code = randomCode();
  const expiresAt = Date.now() + CODE_LIFETIME_MS - 60_000; // a minute of slack for clock drift
  await setDoc(doc(db, "linkCodes", code), { playerId, playerName, expiresAt });
  return { code, expiresAt };
}

// Player: the code currently live, if any
export async function currentFamilyCode(playerId: string): Promise<FamilyCode | null> {
  const snap = await getDocs(query(collection(db, "linkCodes"), where("playerId", "==", playerId)));
  const live = snap.docs
    .map((d) => ({ code: d.id, expiresAt: d.data().expiresAt as number }))
    .filter((c) => c.expiresAt > Date.now());
  return live[0] ?? null;
}

export interface Link {
  id: string;
  guardianId: string;
  guardianName?: string;
  playerId: string;
  playerName?: string;
}

// Parent: turn a code into a link. Creating the link and using up the code
// happen in ONE batch, so a code can only ever link one parent.
export async function linkWithCode(
  guardianId: string,
  guardianName: string,
  rawCode: string,
): Promise<"ok" | "bad-code" | "expired"> {
  const code = rawCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const snap = await getDoc(doc(db, "linkCodes", code)).catch(() => null);
  if (!snap?.exists()) return "bad-code";
  const { playerId, playerName, expiresAt } = snap.data() as {
    playerId: string;
    playerName?: string;
    expiresAt: number;
  };
  if (expiresAt <= Date.now()) return "expired";
  const batch = writeBatch(db);
  batch.set(doc(db, "guardianLinks", `${guardianId}_${playerId}`), {
    guardianId,
    guardianName,
    playerId,
    playerName: playerName ?? "Your player",
    code,
    createdAt: Date.now(),
  });
  batch.delete(doc(db, "linkCodes", code));
  await batch.commit();
  return "ok";
}

export async function linksFor(field: "guardianId" | "playerId", uid: string): Promise<Link[]> {
  const snap = await getDocs(query(collection(db, "guardianLinks"), where(field, "==", uid)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Link);
}

export async function unlink(linkId: string) {
  await deleteDoc(doc(db, "guardianLinks", linkId));
}

// ---- Coach certification ----------------------------------------------

export type CoachStatus = "none" | "pending" | "approved" | "rejected";

export interface CoachApplication {
  uid: string;
  displayName: string;
  organization: string; // league, school, club
  credential: string; // what certifies them
  credentialId: string; // certificate / member number the admin can check
  note?: string; // anything else from the coach
  status: Exclude<CoachStatus, "none">;
  submittedAt: number;
  reviewedAt?: number;
  reviewedBy?: string;
  reviewNote?: string; // admin's reason, shown to the coach
}

// Credentials an admin can actually look up
export const CREDENTIALS = [
  "SafeSport Trained (U.S. Center for SafeSport)",
  "USA Baseball ACE / coaching certification",
  "Little League volunteer (background check)",
  "School / district coaching certificate",
  "Other (explain below)",
];

export async function submitCoachApplication(
  app: Pick<CoachApplication, "uid" | "displayName" | "organization" | "credential" | "credentialId" | "note">,
) {
  await setDoc(
    doc(db, "coachApplications", app.uid),
    { ...app, status: "pending", submittedAt: Date.now() },
    { merge: true },
  );
}

export async function getCoachApplication(uid: string): Promise<CoachApplication | null> {
  const snap = await getDoc(doc(db, "coachApplications", uid));
  return snap.exists() ? (snap.data() as CoachApplication) : null;
}
