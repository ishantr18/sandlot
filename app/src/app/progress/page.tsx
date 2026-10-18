"use client";

// Growth (was Progress) — skill bars vs the player's own start, effort,
// coach confirmations; then metric trends and session history.
import { signOut } from "firebase/auth";
import { collection, getDocs, query, where } from "firebase/firestore";
import { Play } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import GrowthPanel from "@/components/GrowthPanel";
import Notice from "@/components/Notice";
import ProgressCharts, { type ChartSession } from "@/components/ProgressCharts";
import { auth, db } from "@/lib/firebase";
import { playbackUrl } from "@/lib/video";
import type { SwingMetrics } from "@/lib/swingMetrics";

// Illustrative trend for the signed-out preview — a player improving over
// six swings. Shown faded and labeled "Sample"; never mixed with real data.
const DAY = 24 * 60 * 60 * 1000;
const SAMPLE_TREND: ChartSession[] = [
  [30, 0.24, 14, 9, 145, 22],
  [34, 0.23, 13, 11, 148, 20],
  [38, 0.21, 11, 12, 151, 18],
  [41, 0.21, 10, 14, 154, 16],
  [47, 0.2, 9, 16, 158, 14],
  [52, 0.19, 7, 18, 162, 12],
].map(([hip, tempo, drift, stride, knee, tilt], i) => ({
  createdAt: Date.UTC(2026, 8, 1) + i * 3 * DAY,
  metrics: {
    sequenceGapMs: null,
    hipTurnDeg: hip,
    hipShoulderSepDeg: 0,
    tempoSec: tempo,
    headDriftPct: drift,
    stridePct: stride,
    kneeBraceDeg: knee,
    shoulderTiltDeg: tilt,
    peakHandSpeed: 0,
    swingStart: 0,
    footPlant: null,
    swingPeak: 0,
    trackingQuality: 1,
    viewRatio: 0.1,
    coverage: "full" as const,
  },
}));

interface SessionRow {
  id: string;
  videoPathname: string;
  createdAt: number;
  status: string;
  metrics?: SwingMetrics;
}

export default function ProgressPage() {
  const { user, profile, loading } = useAuth();
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [playing, setPlaying] = useState<{ id: string; url: string } | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0); // bump to retry the load

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const snap = await getDocs(
          query(collection(db, "sessions"), where("playerId", "==", user.uid)),
        );
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as SessionRow);
        rows.sort((a, b) => b.createdAt - a.createdAt);
        setSessions(rows);
      } catch {
        setLoadError(true);
      }
    })();
  }, [user, reloadKey]);

  async function play(session: SessionRow) {
    const url = await playbackUrl(session.id);
    if (url) setPlaying({ id: session.id, url });
  }

  if (profile?.role === "mentor" || profile?.role === "guardian") {
    return (
      <main className="mx-auto max-w-md p-6 pb-28">
        <h1 className="dd-title mb-6 text-4xl font-bold tracking-tight">Growth</h1>
        <p className="rounded-2xl bg-card p-6 text-sm text-muted-foreground">
          Growth tracks a player&apos;s own swings.{" "}
          <Link href={profile.role === "mentor" ? "/coach" : "/family"} className="text-primary underline">
            {profile.role === "mentor" ? "Head to your review queue →" : "See your player's activity →"}
          </Link>
        </p>
      </main>
    );
  }

  if (!loading && !user) {
    return (
      <main className="mx-auto max-w-md p-6 pb-28">
        <h1 className="dd-title mb-6 text-4xl font-bold tracking-tight">Growth</h1>
        <Notice
          title="Your growth lives here"
          className="mb-4"
          actions={[
            { label: "Sign in", href: "/auth?mode=signin" },
            { label: "Try a sample swing", href: "/sample" },
          ]}
        >
          Every swing you film adds a point — measured only against your own start.
        </Notice>
        {/* A faded preview of what the charts look like with real swings */}
        <div aria-hidden="true">
          <p className="dd-label-flex mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            Trends
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-400">
              Sample
            </span>
          </p>
          <div className="pointer-events-none opacity-40 select-none">
            <ProgressCharts sessions={SAMPLE_TREND} />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md p-6 pb-28 desk:max-w-2xl wide:max-w-5xl wide:px-10 wide:pt-12">
      <div className="mb-6 flex items-end justify-between wide:mb-10">
        <h1 className="dd-title text-4xl font-bold tracking-tight wide:text-6xl">Growth</h1>
        {user && (
          <button
            onClick={() => signOut(auth)}
            className="dd-hide pb-1 text-xs text-muted-foreground underline"
          >
            Sign out
          </button>
        )}
      </div>

      {user && sessions && <GrowthPanel playerId={user.uid} mode="player" sessions={sessions} />}

      <div className="wide:grid wide:grid-cols-2 wide:items-start wide:gap-8">
      <div>
        <h2 className="dd-label mb-2 text-sm font-semibold text-muted-foreground">Trends</h2>
        <ProgressCharts sessions={sessions ?? []} />
      </div>
      <div>

      <h2 className="dd-label mb-2 text-sm font-semibold text-muted-foreground">Session history</h2>

      {sessions === null &&
        (loadError ? (
          <Notice
            tone="error"
            title="Couldn't load your swings"
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
            Check your connection — your swings are safe.
          </Notice>
        ) : (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ))}
      {sessions?.length === 0 && (
        <Notice
          title="No swings yet"
          actions={[
            { label: "Film your first swing", href: "/upload" },
            { label: "See a sample", href: "/sample" },
          ]}
        >
          Your first swing sets the starting point every bar is measured from.
        </Notice>
      )}

      {sessions && sessions.length > 0 && (
        <section className="dd-srows rounded-2xl bg-card">
          {sessions.map((s, i) => (
            <div key={s.id} className={`dd-srow ${i > 0 ? "border-t border-border" : ""}`}>
              <div className="flex items-center gap-3 p-4">
                <Link href={`/analysis/${s.id}`} className="flex-1">
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
                  <div className="text-xs text-muted-foreground">
                    {s.status === "analyzed" ? "analyzed — tap for breakdown" : "video only — tap to watch"}
                  </div>
                </Link>
                <button
                  onClick={() => play(s)}
                  className="dd-playbtn flex h-10 w-10 items-center justify-center rounded-full bg-primary/15"
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
      </div>
      </div>
    </main>
  );
}
