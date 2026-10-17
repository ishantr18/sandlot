"use client";

// Admin — the human check behind "certified coaches only".
// Only the admin uid in firestore.rules can read or change anything here;
// this page is just the buttons. Approve / reject coach applications,
// revoke a coach, read safety reports, and migrate pre-Oct-3 data.
import { collection, doc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import type { CoachApplication } from "@/lib/family";
import { db } from "@/lib/firebase";

interface Report {
  id: string;
  targetRole?: string;
  sessionId?: string;
  createdAt: number;
}

async function setDecision(uid: string, status: "approved" | "rejected", adminUid: string, note: string) {
  await updateDoc(doc(db, "coachApplications", uid), {
    status,
    reviewedAt: Date.now(),
    reviewedBy: adminUid,
    reviewNote: note.trim(),
  });
}

export default function AdminPage() {
  const { user, profile, loading } = useAuth();
  const [apps, setApps] = useState<CoachApplication[] | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!user || !profile?.isAdmin) return;
    (async () => {
      try {
        const [a, r] = await Promise.all([
          getDocs(collection(db, "coachApplications")),
          getDocs(collection(db, "reports")),
        ]);
        setApps(a.docs.map((d) => d.data() as CoachApplication).sort((x, y) => y.submittedAt - x.submittedAt));
        setReports(
          r.docs.map((d) => ({ id: d.id, ...d.data() }) as Report).sort((x, y) => y.createdAt - x.createdAt),
        );
      } catch {
        setMsg("Couldn't load — are you signed in as the admin?");
      }
    })();
  }, [user, profile, reloadKey]);

  async function decide(uid: string, status: "approved" | "rejected") {
    if (!user) return;
    await setDecision(uid, status, user.uid, notes[uid] ?? "");
    setReloadKey((k) => k + 1);
  }

  // One-time move of pre-Oct-3 data into the new model: old parent links
  // (guardianOf on the parent's profile) become guardianLinks, and coaches
  // approved under the old flag (verifiedMentor) get an approved application.
  async function migrate() {
    setMsg("Migrating…");
    const users = await getDocs(collection(db, "users"));
    const byId = new Map(users.docs.map((d) => [d.id, d.data()]));
    let links = 0, coaches = 0;
    for (const [uid, u] of byId) {
      for (const pid of (u.guardianOf as string[] | undefined) ?? []) {
        await setDoc(doc(db, "guardianLinks", `${uid}_${pid}`), {
          guardianId: uid,
          guardianName: u.displayName ?? "Parent",
          playerId: pid,
          playerName: byId.get(pid)?.displayName ?? "Your player",
          code: "legacy",
          createdAt: Date.now(),
        });
        links++;
      }
      if (u.role === "mentor" && u.verifiedMentor === true) {
        const existing = await getDocs(query(collection(db, "coachApplications"), where("uid", "==", uid)));
        if (existing.empty) {
          await setDoc(doc(db, "coachApplications", uid), {
            uid,
            displayName: u.displayName ?? "Coach",
            organization: "—",
            credential: "Approved before Oct 3 (legacy)",
            credentialId: "—",
            status: "approved",
            submittedAt: (u.createdAt as number) ?? Date.now(),
            reviewedAt: Date.now(),
            reviewedBy: user?.uid,
          });
          coaches++;
        }
      }
    }
    setMsg(`Done: ${links} parent link(s), ${coaches} coach approval(s) migrated.`);
    setReloadKey((k) => k + 1);
  }

  if (!loading && !profile?.isAdmin) {
    return (
      <main className="mx-auto max-w-md p-6 pb-28">
        <h1 className="mb-6 text-4xl font-bold tracking-tight">Admin</h1>
        <p className="rounded-2xl bg-card p-6 text-sm text-muted-foreground">
          This page is for the Diamond Drive admin.{" "}
          <Link href="/" className="text-primary underline">Home</Link>
        </p>
      </main>
    );
  }

  const pending = apps?.filter((a) => a.status === "pending") ?? [];
  const approved = apps?.filter((a) => a.status === "approved") ?? [];

  return (
    <main className="mx-auto max-w-md p-6 pb-28 desk:max-w-2xl wide:max-w-3xl wide:px-10 wide:pt-12">
      <h1 className="mb-2 text-4xl font-bold tracking-tight">Admin</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Check each coach&apos;s credential before approving (e.g. look up the
        SafeSport certificate or call the league). Approval gives them access to
        anonymized swings; revoking takes it away immediately.
      </p>
      {msg && <p className="mb-4 text-sm text-primary">{msg}</p>}

      <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Waiting for review ({pending.length})</h2>
      {apps === null && <p className="mb-6 text-sm text-muted-foreground">Loading…</p>}
      {apps && pending.length === 0 && (
        <p className="mb-6 rounded-2xl bg-card p-4 text-sm text-muted-foreground">No pending applications.</p>
      )}
      {pending.map((a) => (
        <section key={a.uid} className="mb-3 rounded-2xl bg-card p-4">
          <p className="font-semibold">{a.displayName}</p>
          <p className="text-sm">{a.organization}</p>
          <p className="text-sm text-muted-foreground">
            {a.credential} · <span className="font-mono">{a.credentialId}</span>
          </p>
          {a.note && <p className="mt-1 text-xs text-muted-foreground">“{a.note}”</p>}
          <p className="mt-1 text-xs text-muted-foreground">Submitted {new Date(a.submittedAt).toLocaleString()}</p>
          <input
            value={notes[a.uid] ?? ""}
            onChange={(e) => setNotes((n) => ({ ...n, [a.uid]: e.target.value }))}
            placeholder="Note to the coach (shown if rejected)"
            className="mt-3 w-full rounded-xl border-0 bg-secondary p-2 text-sm"
          />
          <div className="mt-2 flex gap-2">
            <button onClick={() => decide(a.uid, "approved")} className="flex-1 rounded-full bg-primary py-2 text-sm font-semibold text-primary-foreground">
              ✓ Approve
            </button>
            <button onClick={() => decide(a.uid, "rejected")} className="flex-1 rounded-full border border-border py-2 text-sm">
              Reject
            </button>
          </div>
        </section>
      ))}

      <h2 className="mb-2 mt-8 text-sm font-semibold text-muted-foreground">Certified coaches ({approved.length})</h2>
      {approved.map((a) => (
        <div key={a.uid} className="mb-2 flex items-center justify-between rounded-2xl bg-card p-3 text-sm">
          <span>
            {a.displayName} <span className="text-muted-foreground">· {a.organization}</span>
          </span>
          <button onClick={() => decide(a.uid, "rejected")} className="text-xs text-destructive underline">
            Revoke
          </button>
        </div>
      ))}

      <h2 className="mb-2 mt-8 text-sm font-semibold text-muted-foreground">Safety reports ({reports.length})</h2>
      {reports.length === 0 && <p className="rounded-2xl bg-card p-4 text-sm text-muted-foreground">None.</p>}
      {reports.map((r) => (
        <div key={r.id} className="mb-2 rounded-2xl bg-card p-3 text-sm">
          {new Date(r.createdAt).toLocaleString()} · reported {r.targetRole ?? "user"}
          {r.sessionId && (
            <Link href={`/analysis/${r.sessionId}`} className="ml-2 text-primary underline">
              view swing
            </Link>
          )}
        </div>
      ))}

      <details className="mt-10">
        <summary className="cursor-pointer text-xs text-muted-foreground">One-time: migrate pre-Oct-3 accounts</summary>
        <button onClick={migrate} className="mt-2 rounded-full border border-border px-4 py-2 text-xs">
          Move old parent links + coach approvals to the new system
        </button>
      </details>
    </main>
  );
}
