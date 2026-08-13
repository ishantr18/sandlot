"use client";

// Home — the dashboard. Signed in: greeting, streak, stats, quick actions.
// Signed out: the mission, one button.
import { collection, getDocs, query, where } from "firebase/firestore";
import { Dumbbell, Flame, TrendingUp, Video } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { db } from "@/lib/firebase";

interface Stats {
  total: number;
  thisWeek: number;
  streak: number;
  lastAt: number | null;
}

// Day streak: consecutive calendar days with ≥1 swing, counting back from
// today (or yesterday — missing today doesn't break it until tomorrow).
function computeStats(timestamps: number[]): Stats {
  const days = new Set(timestamps.map((t) => new Date(t).toDateString()));
  const day = new Date();
  let streak = 0;
  if (!days.has(day.toDateString())) day.setDate(day.getDate() - 1); // grace for today
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
  const { user, loading } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const snap = await getDocs(
        query(collection(db, "sessions"), where("playerId", "==", user.uid)),
      );
      setStats(computeStats(snap.docs.map((d) => d.data().createdAt as number)));
    })();
  }, [user]);

  // Signed out: mission + one door in
  if (!loading && !user) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center p-6 pb-28 text-center">
        <h1 className="mb-3 text-5xl font-bold tracking-tight">⚾ Diamond Drive</h1>
        <p className="mb-8 text-muted-foreground">
          Pro-level baseball coaching on any phone — for every kid, not just the ones who
          can afford it.
        </p>
        <Link
          href="/auth"
          className="rounded-full bg-primary px-8 py-3 font-semibold text-primary-foreground"
        >
          Get started
        </Link>
      </main>
    );
  }

  const firstName = user?.displayName?.split(" ")[0] ?? "player";

  return (
    <main className="mx-auto max-w-md p-6 pb-28">
      <p className="text-sm text-muted-foreground">Welcome back,</p>
      <h1 className="mb-6 text-4xl font-bold tracking-tight">{firstName}</h1>

      {/* Stat row — mono digits, tiny labels */}
      <div className="mb-6 grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-card p-4">
          <div className="flex items-center gap-1 font-mono text-2xl font-bold text-primary">
            <Flame className="h-5 w-5" />
            {stats?.streak ?? "–"}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">day streak</div>
        </div>
        <div className="rounded-2xl bg-card p-4">
          <div className="font-mono text-2xl font-bold">{stats?.thisWeek ?? "–"}</div>
          <div className="mt-1 text-xs text-muted-foreground">this week</div>
        </div>
        <div className="rounded-2xl bg-card p-4">
          <div className="font-mono text-2xl font-bold">{stats?.total ?? "–"}</div>
          <div className="mt-1 text-xs text-muted-foreground">total swings</div>
        </div>
      </div>

      {/* Quick actions — icon-over-label tiles */}
      <div className="mb-6 grid grid-cols-3 gap-2">
        {ACTIONS.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="flex flex-col items-center gap-2 rounded-2xl bg-card p-4 text-xs font-medium"
          >
            <a.icon className="h-5 w-5 text-primary" />
            {a.label}
          </Link>
        ))}
      </div>

      <section className="rounded-2xl bg-card p-4">
        <h2 className="mb-1 text-sm font-semibold">Today&apos;s focus</h2>
        <p className="text-sm text-muted-foreground">
          {stats?.lastAt
            ? `Last swing ${new Date(stats.lastAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}. Film a new one and keep the streak alive.`
            : "Film your first swing to get your baseline analysis."}
        </p>
      </section>
    </main>
  );
}
