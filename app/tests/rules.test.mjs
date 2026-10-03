// Security-rule tests — run against the local Firestore emulator.
//   npm run test:rules
// Each test acts out a real situation: the honest path must work, and every
// attack the Oct 3 audit found must FAIL.
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, getDocs, collection, query, setDoc, updateDoc, where, writeBatch } from "firebase/firestore";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, test } from "node:test";

const ADMIN = "39qqWC1J7LciK4wUTPd3wzwYJXw2";
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-diamond-drive",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
  });
});
after(() => env.cleanup());

// Fresh world each test: a player with a swing, a parent, a coach, an outsider.
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "users/kid"), { uid: "kid", displayName: "Kid", role: "player", createdAt: 1 });
    await setDoc(doc(db, "users/mom"), { uid: "mom", displayName: "Mom", role: "guardian", createdAt: 1 });
    await setDoc(doc(db, "users/coach"), { uid: "coach", displayName: "Coach", role: "mentor", createdAt: 1 });
    await setDoc(doc(db, "users/stranger"), { uid: "stranger", displayName: "S", role: "guardian", createdAt: 1 });
    await setDoc(doc(db, "users/sneaky"), { uid: "sneaky", displayName: "X", role: "mentor", createdAt: 1 });
    await setDoc(doc(db, "sessions/s1"), { playerId: "kid", status: "analyzed", createdAt: 1 });
  });
});

const as = (uid) => env.authenticatedContext(uid).firestore();
const future = () => Date.now() + 60 * 60 * 1000;

async function kidMakesCode(code = "ABC234") {
  await assertSucceeds(setDoc(doc(as("kid"), "linkCodes", code), { playerId: "kid", playerName: "Kid", expiresAt: future() }));
}
async function linkWith(uid, code, playerId = "kid") {
  const db = as(uid);
  const b = writeBatch(db);
  b.set(doc(db, "guardianLinks", `${uid}_${playerId}`), { guardianId: uid, playerId, code, createdAt: 1 });
  b.delete(doc(db, "linkCodes", code));
  return b.commit();
}

// ---- Family linking -------------------------------------------------------

test("parent links with the player's code, then sees the swing", async () => {
  await kidMakesCode();
  await assertSucceeds(linkWith("mom", "ABC234"));
  await assertSucceeds(getDoc(doc(as("mom"), "sessions/s1")));
});

test("a code works only once", async () => {
  await kidMakesCode();
  await assertSucceeds(linkWith("mom", "ABC234"));
  await assertFails(linkWith("stranger", "ABC234"));
});

test("ATTACK: link without a valid code", async () => {
  await assertFails(linkWith("stranger", "WRONG1"));
  await assertFails(setDoc(doc(as("stranger"), "guardianLinks/stranger_kid"), { guardianId: "stranger", playerId: "kid", code: "x" }));
});

test("ATTACK: expired code", async () => {
  await env.withSecurityRulesDisabled((ctx) =>
    setDoc(doc(ctx.firestore(), "linkCodes/OLD999"), { playerId: "kid", expiresAt: Date.now() - 1000 }),
  );
  await assertFails(linkWith("mom", "OLD999"));
});

test("ATTACK: old trick — put the kid in my own guardianOf list", async () => {
  await assertFails(updateDoc(doc(as("stranger"), "users/stranger"), { guardianOf: ["kid"] }));
  await assertFails(getDoc(doc(as("stranger"), "sessions/s1")));
});

test("ATTACK: a player can't make a code for someone else", async () => {
  await assertFails(setDoc(doc(as("kid"), "linkCodes/ZZZ222"), { playerId: "otherkid", expiresAt: future() }));
});

test("nobody can list other players' codes", async () => {
  await kidMakesCode();
  await assertFails(getDocs(collection(as("stranger"), "linkCodes")));
});

test("player can unlink a parent", async () => {
  await kidMakesCode();
  await linkWith("mom", "ABC234");
  await assertSucceeds(deleteDoc(doc(as("kid"), "guardianLinks/mom_kid")));
  await assertFails(getDoc(doc(as("mom"), "sessions/s1")));
});

// ---- Coach certification -------------------------------------------------

test("coach applies (pending) and sees nothing until approved", async () => {
  await assertSucceeds(setDoc(doc(as("coach"), "coachApplications/coach"), { uid: "coach", status: "pending", submittedAt: 1 }));
  await assertFails(getDocs(query(collection(as("coach"), "sessions"), where("status", "==", "analyzed"))));
});

test("ATTACK: coach approves themselves", async () => {
  await assertFails(setDoc(doc(as("sneaky"), "coachApplications/sneaky"), { uid: "sneaky", status: "approved" }));
  await setDoc(doc(as("sneaky"), "coachApplications/sneaky"), { uid: "sneaky", status: "pending", submittedAt: 1 });
  await assertFails(updateDoc(doc(as("sneaky"), "coachApplications/sneaky"), { status: "approved" }));
});

test("ATTACK: old trick — set verifiedMentor on my own profile", async () => {
  await assertFails(updateDoc(doc(as("sneaky"), "users/sneaky"), { verifiedMentor: true }));
});

test("ATTACK: sign up with role + permissions baked in", async () => {
  await assertFails(setDoc(doc(as("newbie"), "users/newbie"), { uid: "newbie", role: "mentor", verifiedMentor: true, createdAt: 1 }));
  await assertSucceeds(setDoc(doc(as("newbie"), "users/newbie"), { uid: "newbie", displayName: "N", role: "mentor", createdAt: 1 }));
  await assertFails(updateDoc(doc(as("newbie"), "users/newbie"), { role: "guardian" }));
});

test("admin approves → coach sees the queue and can comment", async () => {
  await setDoc(doc(as("coach"), "coachApplications/coach"), { uid: "coach", status: "pending", submittedAt: 1 });
  await assertSucceeds(updateDoc(doc(as(ADMIN), "coachApplications/coach"), { status: "approved", reviewedBy: ADMIN }));
  await assertSucceeds(getDocs(query(collection(as("coach"), "sessions"), where("status", "==", "analyzed"))));
  await assertSucceeds(setDoc(doc(as("coach"), "comments/c1"), { sessionId: "s1", mentorId: "coach", text: "nice" }));
});

test("ATTACK: non-admin approves a coach", async () => {
  await setDoc(doc(as("coach"), "coachApplications/coach"), { uid: "coach", status: "pending", submittedAt: 1 });
  await assertFails(updateDoc(doc(as("stranger"), "coachApplications/coach"), { status: "approved" }));
});

// ---- Privacy ---------------------------------------------------------------

test("ATTACK: certified coach looks up a player's profile (name/email)", async () => {
  await env.withSecurityRulesDisabled((ctx) =>
    setDoc(doc(ctx.firestore(), "coachApplications/coach"), { uid: "coach", status: "approved" }),
  );
  await assertFails(getDoc(doc(as("coach"), "users/kid")));
  await assertFails(getDocs(collection(as("coach"), "users")));
});

test("you can read your own profile; the admin can read all", async () => {
  await assertSucceeds(getDoc(doc(as("kid"), "users/kid")));
  await assertSucceeds(getDocs(collection(as(ADMIN), "users")));
});

test("only the admin reads safety reports", async () => {
  await assertSucceeds(setDoc(doc(as("kid"), "reports/r1"), { byId: "kid", targetRole: "mentor", createdAt: 1 }));
  await assertFails(getDoc(doc(as("coach"), "reports/r1")));
  await assertSucceeds(getDoc(doc(as(ADMIN), "reports/r1")));
});

test("the screens' list queries are allowed", async () => {
  await kidMakesCode();
  await assertSucceeds(getDocs(query(collection(as("kid"), "linkCodes"), where("playerId", "==", "kid"))));
  await assertSucceeds(getDoc(doc(as("mom"), "linkCodes/ABC234"))); // parent fetches the code they typed
  await linkWith("mom", "ABC234");
  await assertSucceeds(getDocs(query(collection(as("mom"), "guardianLinks"), where("guardianId", "==", "mom"))));
  await assertSucceeds(getDocs(query(collection(as("kid"), "guardianLinks"), where("playerId", "==", "kid"))));
  await assertSucceeds(getDocs(query(collection(as("mom"), "sessions"), where("playerId", "==", "kid"))));
  await assertSucceeds(getDocs(query(collection(as("mom"), "blocks"), where("playerId", "==", "kid"))));
  await assertFails(getDocs(query(collection(as("stranger"), "sessions"), where("playerId", "==", "kid"))));
});
