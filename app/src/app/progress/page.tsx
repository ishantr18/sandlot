"use client";

// Progress — the player's session history. Each upload becomes a session
// record in Firestore; charts land here in Phase 4 once metrics exist.
import { signOut } from "firebase/auth";
import { collection, getDocs, query, where } from "firebase/firestore";
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
      // Only THIS player's sessions; newest first (sorted here, not in the
      // query, to avoid needing a Firestore composite index)
      const snap = await getDocs(
        query(collection(db, "sessions"), where("playerId", "==", user.uid)),
      );
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as SessionRow);
      rows.sort((a, b) => b.createdAt - a.createdAt);
      setSessions(rows);
    })();
  }, [user]);

  async function play(session: SessionRow) {
    // Same expiring-link flow as everywhere else — private store, signed URL
    const res = await fetch(
      `/api/video?pathname=${encodeURIComponent(session.videoPathname)}`,
    );
    if (!res.ok) return;
    const { url } = (await res.json()) as { url: string };
    setPlaying({ id: session.id, url });
  }

  if (!loading && !user) {
    return (
      <main className="mx-auto max-w-md p-6 pb-24">
        <h1 className="mb-4 text-2xl font-bold">Progress</h1>
        <Link
          href="/auth"
          className="block rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm text-amber-800"
        >
          👤 <span className="underline">Sign in</span> to see your swing history.
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md p-6 pb-24">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Progress</h1>
        {user && (
          <button onClick={() => signOut(auth)} className="text-xs text-zinc-400 underline">
            Sign out {user.displayName ?? ""}
          </button>
        )}
      </div>

      <section className="mb-4 flex h-40 items-center justify-center rounded-lg border text-zinc-400">
        Improvement charts arrive with swing metrics (Phase 4)
      </section>

      <h2 className="mb-2 font-semibold text-zinc-700">Session history</h2>

      {sessions === null && <p className="text-sm text-zinc-400">Loading…</p>}
      {sessions?.length === 0 && (
        <section className="rounded-lg border p-4 text-sm text-zinc-400">
          No swings yet — upload one and it'll appear here.
        </section>
      )}

      <ul className="space-y-2">
        {sessions?.map((s) => (
          <li key={s.id} className="rounded-lg border p-3 text-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">
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
                <div className="text-xs text-zinc-400">{s.status}</div>
              </div>
              <button
                onClick={() => play(s)}
                className="rounded-lg border px-3 py-1 text-green-700"
              >
                ▶ Play
              </button>
            </div>
            {playing?.id === s.id && (
              <video src={playing.url} controls autoPlay playsInline className="mt-2 w-full rounded" />
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
