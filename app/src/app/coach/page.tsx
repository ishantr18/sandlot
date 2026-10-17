"use client";

// Coach review queue — the certified-coach open pool.
//
// Trust model (user-designed, Aug 22):
// - Only CERTIFIED coaches (application approved by the admin) see anything
// - Players are ANONYMOUS to coaches (number, pixelated video, no name);
//   coaches are fully identified to players and parents
// - EQUITY QUEUE: swings with the fewest coach reviews come first, so
//   attention flows to whoever has received the least
// - One-way: coaches give feedback; there is no reply channel
import { collection, getDocs, query, where } from "firebase/firestore";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import Notice from "@/components/Notice";
import { db } from "@/lib/firebase";
import { anonPlayer } from "@/lib/anon";
import CoachApplicationStatus from "@/components/CoachApplicationStatus";

interface QueueRow {
  id: string;
  playerId: string;
  createdAt: number;
  reviews: number;
}

export default function CoachPage() {
  const { user, profile, loading } = useAuth();
  const [rows, setRows] = useState<QueueRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0); // bump to retry the load

  useEffect(() => {
    if (!user || profile?.role !== "mentor" || !profile.verifiedMentor) return;
    (async () => {
      try {
        const [sessSnap, commentSnap, blockSnap] = await Promise.all([
          getDocs(query(collection(db, "sessions"), where("status", "==", "analyzed"))),
          getDocs(collection(db, "comments")),
          getDocs(query(collection(db, "blocks"), where("coachId", "==", user.uid))),
        ]);

        // Count existing coach reviews per session (the equity signal)
        const reviewCount = new Map<string, number>();
        commentSnap.docs.forEach((d) => {
          const sid = d.data().sessionId as string;
          reviewCount.set(sid, (reviewCount.get(sid) ?? 0) + 1);
        });

        // Blocks in either direction remove the player from this coach's world
        const blockedPlayers = new Set(blockSnap.docs.map((d) => d.data().playerId as string));

        const r = sessSnap.docs
          .map((d) => ({
            id: d.id,
            playerId: d.data().playerId as string,
            createdAt: d.data().createdAt as number,
            reviews: reviewCount.get(d.id) ?? 0,
          }))
          .filter((s) => !blockedPlayers.has(s.playerId));

        // EQUITY SORT: least-reviewed first, then newest
        r.sort((a, b) => a.reviews - b.reviews || b.createdAt - a.createdAt);
        setRows(r);
      } catch {
        setLoadError(true);
      }
    })();
  }, [user, profile, reloadKey]);

  if (!loading && (!user || profile?.role !== "mentor")) {
    return (
      <main className="mx-auto max-w-md p-6 pb-28">
        <h1 className="mb-6 text-4xl font-bold tracking-tight">Coach</h1>
        <p className="rounded-2xl bg-card p-6 text-sm text-muted-foreground">
          This page is for coach accounts.{" "}
          <Link href="/auth" className="text-primary underline">
            Sign in
          </Link>{" "}
          as a coach to review swings.
        </p>
      </main>
    );
  }

  // Certification gate — uncertified coaches see nothing but this
  if (profile?.role === "mentor" && !profile.verifiedMentor) {
    return <CoachApplicationStatus />;
  }

  return (
    <main className="mx-auto max-w-md p-6 pb-28 desk:max-w-2xl wide:max-w-5xl wide:px-10 wide:pt-12">
      <h1 className="mb-2 text-4xl font-bold tracking-tight wide:text-6xl">Review queue</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Sorted so the least-coached players come first. Players are anonymous to
        you; your name and every word you write are visible to them and their
        parents. Videos are face-anonymized before they ever reach the cloud.
      </p>

      {rows === null &&
        (loadError ? (
          <Notice
            tone="error"
            title="Couldn't load the review queue"
            actions={[
              {
                label: "Try again",
                onClick: () => {
                  setLoadError(false);
                  setReloadKey((k) => k + 1);
                },
              },
            ]}
          >
            Check your connection, then try again.
          </Notice>
        ) : (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ))}
      {rows?.length === 0 && (
        <Notice title="No swings waiting">
          You&apos;re all caught up — the queue fills as players upload, least-coached first.
        </Notice>
      )}

      {rows && rows.length > 0 && (
        <section className="rounded-2xl bg-card wide:max-w-2xl">
          {rows.map((r, i) => (
            <Link
              key={r.id}
              href={`/analysis/${r.id}`}
              className={`flex items-center gap-3 p-4 ${i > 0 ? "border-t border-border" : ""}`}
            >
              <div className="flex-1">
                <div className="text-sm font-medium">{anonPlayer(r.playerId)}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(r.createdAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </div>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  r.reviews === 0
                    ? "bg-primary/15 text-primary"
                    : "bg-secondary text-muted-foreground"
                }`}
              >
                {r.reviews === 0 ? "never reviewed" : `${r.reviews} review${r.reviews > 1 ? "s" : ""}`}
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          ))}
        </section>
      )}
    </main>
  );
}
