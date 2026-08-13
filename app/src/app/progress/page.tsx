"use client";

// Progress — session history as an Elevate-style list; charts land with metrics.
import { signOut } from "firebase/auth";
import { collection, getDocs, query, where } from "firebase/firestore";
import { Play } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { auth, db } from "@/lib/firebase";

interface SessionRow {
  id: string;
  videoPathname: string;
  createdAt: number;
  status: string;
}

export default function ProgressPage() {
  const { user, loading } = useAuth();
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [playing, setPlaying] = useState<{ id: string; url: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const snap = await getDocs(
        query(collection(db, "sessions"), where("playerId", "==", user.uid)),
      );
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as SessionRow);
      rows.sort((a, b) => b.createdAt - a.createdAt);
      setSessions(rows);
    })();
  }, [user]);

  async function play(session: SessionRow) {
    const res = await fetch(
      `/api/video?pathname=${encodeURIComponent(session.videoPathname)}`,
    );
    if (!res.ok) return;
    const { url } = (await res.json()) as { url: string };
    setPlaying({ id: session.id, url });
  }

  if (!loading && !user) {
    return (
      <main className="mx-auto max-w-md p-6 pb-28">
        <h1 className="mb-6 text-4xl font-bold tracking-tight">Progress</h1>
        <Link
          href="/auth"
          className="block rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground"
        >
          <span className="text-primary underline">Sign in</span> to see your swing
          history.
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md p-6 pb-28">
      <div className="mb-6 flex items-end justify-between">
        <h1 className="text-4xl font-bold tracking-tight">Progress</h1>
        {user && (
          <button
            onClick={() => signOut(auth)}
            className="pb-1 text-xs text-muted-foreground underline"
          >
            Sign out
          </button>
        )}
      </div>

      <section className="mb-6 flex h-40 items-center justify-center rounded-2xl bg-card text-sm text-muted-foreground">
        Improvement charts arrive with swing metrics (Phase 4)
      </section>

      <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Session history</h2>

      {sessions === null && <p className="text-sm text-muted-foreground">Loading…</p>}
      {sessions?.length === 0 && (
        <section className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground">
          No swings yet — upload one and it&apos;ll appear here.
        </section>
      )}

      {sessions && sessions.length > 0 && (
        <section className="rounded-2xl bg-card">
          {sessions.map((s, i) => (
            <div key={s.id} className={i > 0 ? "border-t border-border" : ""}>
              <div className="flex items-center gap-3 p-4">
                <div className="flex-1">
                  <div className="text-sm font-medium">
                    {new Date(s.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}{" "}
                    ·{" "}
                    {new Date(s.createdAt).toLocaleTimeString(undefined, {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </div>
                  <div className="text-xs text-muted-foreground">{s.status}</div>
                </div>
                <button
                  onClick={() => play(s)}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15"
                >
                  <Play className="h-4 w-4 text-primary" />
                </button>
              </div>
              {playing?.id === s.id && (
                <video
                  src={playing.url}
                  controls
                  autoPlay
                  playsInline
                  className="w-full"
                />
              )}
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
