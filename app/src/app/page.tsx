"use client";

// Home dashboard. Phone: single column. Desktop: two-column spread —
// stats/actions left, focus + recent swings right.
import { collection, getDocs, query, where } from "firebase/firestore";
import { Dumbbell, Flame, Play, TrendingUp, Video } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import FamilyCard from "@/components/FamilyCard";
import { db } from "@/lib/firebase";

interface SessionRow {
  id: string;
  createdAt: number;
  status: string;
}

interface Stats {
  total: number;
  thisWeek: number;
  streak: number;
  lastAt: number | null;
}

function computeStats(timestamps: number[]): Stats {
  const days = new Set(timestamps.map((t) => new Date(t).toDateString()));
  const day = new Date();
  let streak = 0;
  if (!days.has(day.toDateString())) day.setDate(day.getDate() - 1);
  while (days.has(day.toDateString())) {
    streak++;
    day.setDate(day.getDate() - 1);
  }
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return {
    total: timestamps.length,
    thisWeek: timestamps.filter((t) => t > weekAgo).length,
    streak,
    lastAt: timestamps.length ? Math.max(...timestamps) : null,
  };
}

const ACTIONS = [
  { href: "/upload", label: "Record swing", icon: Video },
  { href: "/drills", label: "Drills", icon: Dumbbell },
  { href: "/progress", label: "Progress", icon: TrendingUp },
];

export default function Home() {
  const { user, profile, loading } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<SessionRow[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0); // bump to retry the load

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const snap = await getDocs(
          query(collection(db, "sessions"), where("playerId", "==", user.uid)),
        );
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as SessionRow & {
          createdAt: number;
        });
        rows.sort((a, b) => b.createdAt - a.createdAt);
        setStats(computeStats(rows.map((r) => r.createdAt)));
        setRecent(rows.slice(0, 4));
      } catch {
        setLoadError(true);
      }
    })();
  }, [user, reloadKey]);

  if (!loading && !user) {
    const roles = [
      {
        role: "player",
        icon: "⚾",
        label: "Player",
        pitch: "Film your swing, get AI coaching — free",
      },
      {
        role: "mentor",
        icon: "🧢",
        label: "Coach",
        pitch: "Review swings, leave frame-by-frame tips",
      },
      {
        role: "guardian",
        icon: "👨‍👩‍👧",
        label: "Parent",
        pitch: "See everything your player does — always",
      },
    ];
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6 pb-16 lg:max-w-2xl">
        <h1 className="mb-3 text-center text-5xl font-bold tracking-tight lg:text-7xl">
          ⚾ Diamond Drive
        </h1>
        <p className="mb-10 text-center text-muted-foreground lg:text-lg">
          Pro-level baseball coaching on any phone — for every kid, not just the
          ones who can afford it.
        </p>

        <div className="space-y-3">
          {roles.map((r) => (
            <Link
              key={r.role}
              href={`/auth?mode=signup&role=${r.role}`}
              className="flex items-center gap-5 rounded-2xl bg-card p-6 transition-colors hover:bg-secondary lg:p-8"
            >
              <span className="text-4xl lg:text-5xl">{r.icon}</span>
              <span>
                <span className="block text-2xl font-bold lg:text-3xl">{r.label}</span>
                <span className="block text-sm text-muted-foreground lg:text-base">
                  {r.pitch}
                </span>
              </span>
            </Link>
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/auth?mode=signin" className="font-semibold text-primary">
            Sign in
          </Link>
        </p>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          🔒 Videos are face-anonymized on your device before anything uploads.
        </p>
      </main>
    );
  }

  const firstName = user?.displayName?.split(" ")[0] ?? "player";

  // Coaches and parents get their own hub — player stats don't apply to them
  if (profile?.role === "mentor" || profile?.role === "guardian") {
    const isCoach = profile.role === "mentor";
    return (
      <main className="mx-auto max-w-md p-6 pb-28 lg:max-w-5xl lg:px-10 lg:pt-12">
        <p className="text-sm text-muted-foreground">Welcome back,</p>
        <h1 className="mb-6 text-4xl font-bold tracking-tight lg:mb-10 lg:text-6xl">
          {firstName}
        </h1>
        {profile?.isAdmin && (
          <Link href="/admin" className="mb-4 block rounded-2xl bg-primary/15 p-4 text-sm font-semibold text-primary ring-1 ring-primary lg:max-w-md">
            🛡️ Admin: approve coaches →
          </Link>
        )}
        <Link
          href={isCoach ? "/coach" : "/family"}
          className="block rounded-2xl bg-card p-6 transition-colors hover:bg-secondary lg:max-w-md"
        >
          <div className="mb-1 text-lg font-semibold">
            {isCoach ? "🧢 Review queue →" : "👨‍👩‍👧 Your player's activity →"}
          </div>
          <p className="text-sm text-muted-foreground">
            {isCoach
              ? "Anonymized swings waiting for your eye. Comments and drills you leave are visible to players and their parents."
              : "Every swing, coach comment, and assigned drill — nothing on this app is hidden from you."}
          </p>
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md p-6 pb-28 lg:max-w-5xl lg:px-10 lg:pt-12">
      <p className="text-sm text-muted-foreground">Welcome back,</p>
      <h1 className="mb-6 text-4xl font-bold tracking-tight lg:mb-10 lg:text-6xl">
        {firstName}
      </h1>
      {profile?.isAdmin && (
          <Link href="/admin" className="mb-4 block rounded-2xl bg-primary/15 p-4 text-sm font-semibold text-primary ring-1 ring-primary lg:max-w-md">
            🛡️ Admin: approve coaches →
          </Link>
        )}

      <div className="lg:grid lg:grid-cols-5 lg:gap-8">
        {/* Left: stats + actions */}
        <div className="lg:col-span-3">
          <div className="mb-6 grid grid-cols-3 gap-2 lg:gap-4">
            <div className="rounded-2xl bg-card p-4 lg:p-6">
              <div className="flex items-center gap-1 font-mono text-2xl font-bold text-primary lg:text-4xl">
                <Flame className="h-5 w-5 lg:h-7 lg:w-7" />
                {stats?.streak ?? "–"}
              </div>
              <div className="mt-1 text-xs text-muted-foreground lg:text-sm">day streak</div>
            </div>
            <div className="rounded-2xl bg-card p-4 lg:p-6">
              <div className="font-mono text-2xl font-bold lg:text-4xl">
                {stats?.thisWeek ?? "–"}
              </div>
              <div className="mt-1 text-xs text-muted-foreground lg:text-sm">this week</div>
            </div>
            <div className="rounded-2xl bg-card p-4 lg:p-6">
              <div className="font-mono text-2xl font-bold lg:text-4xl">
                {stats?.total ?? "–"}
              </div>
              <div className="mt-1 text-xs text-muted-foreground lg:text-sm">
                total swings
              </div>
            </div>
          </div>

          <div className="mb-6 grid grid-cols-3 gap-2 lg:gap-4">
            {ACTIONS.map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className="flex flex-col items-center gap-2 rounded-2xl bg-card p-4 text-xs font-medium transition-colors hover:bg-secondary lg:p-8 lg:text-sm"
              >
                <a.icon className="h-5 w-5 text-primary lg:h-7 lg:w-7" />
                {a.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Right: focus + recent activity */}
        <div className="lg:col-span-2">
          <section className="mb-6 rounded-2xl bg-card p-4 lg:p-6">
            <h2 className="mb-1 text-sm font-semibold">Today&apos;s focus</h2>
            <p className="text-sm text-muted-foreground">
              {stats?.lastAt
                ? `Last swing ${new Date(stats.lastAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}. Film a new one and keep the streak alive.`
                : "Film your first swing to get your baseline analysis."}
            </p>
          </section>

          <section className="rounded-2xl bg-card lg:min-h-48">
            <div className="flex items-center justify-between p-4 pb-2">
              <h2 className="text-sm font-semibold">Recent swings</h2>
              <Link href="/progress" className="text-xs text-primary">
                See all →
              </Link>
            </div>
            {loadError ? (
              <p className="p-4 pt-0 text-sm text-destructive">
                Couldn&apos;t load your swings — check your connection and try again.{" "}
                <button
                  onClick={() => {
                    setLoadError(false);
                    setReloadKey((k) => k + 1);
                  }}
                  className="text-primary underline"
                >
                  Retry
                </button>
              </p>
            ) : (
              recent.length === 0 && (
                <p className="p-4 pt-0 text-sm text-muted-foreground">Nothing yet.</p>
              )
            )}
            {recent.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-3 border-t border-border p-4 py-3"
              >
                <Play className="h-4 w-4 text-primary" />
                <div className="flex-1 text-sm">
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
                <span className="text-xs text-muted-foreground">{s.status}</span>
              </div>
            ))}
          </section>
          {user && <FamilyCard playerId={user.uid} playerName={user.displayName ?? "Player"} />}
        </div>
      </div>
    </main>
  );
}
