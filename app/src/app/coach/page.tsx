"use client";

// Coach view — the review queue. Mentors see analyzed swings (already
// face-anonymized by the pipeline), open one, and coach it.
// Deliberately narrow: no DMs, no browsing anything but submitted swings.
import { collection, getDocs, query, where } from "firebase/firestore";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { db } from "@/lib/firebase";

interface QueueRow {
  id: string;
  playerName?: string;
  createdAt: number;
}

export default function CoachPage() {
  const { user, profile, loading } = useAuth();
  const [rows, setRows] = useState<QueueRow[] | null>(null);

  useEffect(() => {
    if (!user || profile?.role !== "mentor") return;
    (async () => {
      const snap = await getDocs(
        query(collection(db, "sessions"), where("status", "==", "analyzed")),
      );
      const r = snap.docs.map((d) => ({
        id: d.id,
        playerName: d.data().playerName as string | undefined,
        createdAt: d.data().createdAt as number,
      }));
      r.sort((a, b) => b.createdAt - a.createdAt);
      setRows(r);
    })();
  }, [user, profile]);

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

  return (
    <main className="mx-auto max-w-md p-6 pb-28 lg:max-w-5xl lg:px-10 lg:pt-12">
      <h1 className="mb-2 text-4xl font-bold tracking-tight lg:text-6xl">Review queue</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Every video is face-anonymized before it reaches you. Comments and drill
        assignments are visible to the player AND their parent.
      </p>

      {rows === null && <p className="text-sm text-muted-foreground">Loading…</p>}
      {rows?.length === 0 && (
        <p className="rounded-2xl bg-card p-6 text-sm text-muted-foreground">
          No swings waiting — the queue fills as players upload.
        </p>
      )}

      {rows && rows.length > 0 && (
        <section className="rounded-2xl bg-card lg:max-w-2xl">
          {rows.map((r, i) => (
            <Link
              key={r.id}
              href={`/analysis/${r.id}`}
              className={`flex items-center gap-3 p-4 ${i > 0 ? "border-t border-border" : ""}`}
            >
              <div className="flex-1">
                <div className="text-sm font-medium">{r.playerName ?? "Player"}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(r.createdAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}{" "}
                  ·{" "}
                  {new Date(r.createdAt).toLocaleTimeString(undefined, {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          ))}
        </section>
      )}
    </main>
  );
}
