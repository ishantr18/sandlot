"use client";

// Home dashboard. Phone: single column. Desktop: two-column spread —
// stats/actions left, focus + recent swings right.
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { BadgeCheck, Clock, Dumbbell, Flame, MessageCircle, Play, TrendingUp, Video } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import FamilyCard from "@/components/FamilyCard";
import { db } from "@/lib/firebase";
import { linksFor } from "@/lib/family";

interface SessionRow {
  id: string;
  createdAt: number;
  status: string;
  feedbackSeenAt?: number; // set when the player opens the swing
}

interface CommentLite {
  sessionId: string;
  mentorId?: string;
  createdAt: number;
}

// Firestore "in" takes at most 30 values per query
async function commentsOn(sessionIds: string[]): Promise<CommentLite[]> {
  const chunks: string[][] = [];
  for (let i = 0; i < sessionIds.length; i += 30) chunks.push(sessionIds.slice(i, i + 30));
  const snaps = await Promise.all(
    chunks.map((c) => getDocs(query(collection(db, "comments"), where("sessionId", "in", c)))),
  );
  return snaps.flatMap((snap) => snap.docs.map((d) => d.data() as CommentLite));
}

// What one swing breakdown would cost from a private hitting coach
// (lessons run ~$50–100/hr; a written frame-by-frame review ≈ a quarter hour+).
const VALUE_PER_REVIEW = 25;

interface Impact {
  swings: number;
  people: number; // players coached (coach) · coaches helping (parent)
  value: number;
}

async function coachImpact(uid: string): Promise<Impact> {
  const snap = await getDocs(query(collection(db, "comments"), where("mentorId", "==", uid)));
  const sessionIds = [...new Set(snap.docs.map((d) => d.data().sessionId as string))];
  const players = await Promise.all(
    sessionIds.map((sid) =>
      getDoc(doc(db, "sessions", sid))
        .then((d) => (d.data()?.playerId as string | undefined) ?? null)
        .catch(() => null),
    ),
  );
  return {
    swings: sessionIds.length,
    people: new Set(players.filter(Boolean)).size,
    value: sessionIds.length * VALUE_PER_REVIEW,
  };
}

async function familyImpact(uid: string): Promise<Impact> {
  const links = await linksFor("guardianId", uid);
  const snaps = await Promise.all(
    links.map((l) => getDocs(query(collection(db, "sessions"), where("playerId", "==", l.playerId)))),
  );
  const comments = await commentsOn(snaps.flatMap((s) => s.docs.map((d) => d.id)));
  const swings = new Set(comments.map((c) => c.sessionId)).size;
  return {
    swings,
    people: new Set(comments.map((c) => c.mentorId).filter(Boolean)).size,
    value: swings * VALUE_PER_REVIEW,
  };
}

function ImpactStrip({ impact, isCoach }: { impact: Impact | null; isCoach: boolean }) {
  const tiles = [
    { value: impact?.swings, label: "swings reviewed" },
    { value: impact?.people, label: isCoach ? "players coached" : "coaches helping" },
    {
      value: impact ? `$${impact.value.toLocaleString()}` : undefined,
      label: isCoach ? "est. coaching given free" : "est. coaching received free",
    },
  ];
  return (
    <section className="mb-4 lg:max-w-md">
      <div className="grid grid-cols-3 gap-2">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl bg-card p-4">
            <div className="font-mono text-2xl font-bold text-primary">{t.value ?? "–"}</div>
            <div className="mt-1 text-xs text-muted-foreground">{t.label}</div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {isCoach
          ? `Every review you leave is a lesson a family didn't have to pay for (≈ $${VALUE_PER_REVIEW} each).`
          : `Valued at what a private lesson would charge (≈ $${VALUE_PER_REVIEW} per review).`}
      </p>
    </section>
  );
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
  { href: "/progress", label: "Growth", icon: TrendingUp },
];

export default function Home() {
  const { user, profile, loading } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<SessionRow[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0); // bump to retry the load
  // Swings with coach feedback the player hasn't opened yet
  const [unread, setUnread] = useState<SessionRow[]>([]);
  const [impact, setImpact] = useState<Impact | null>(null);

  useEffect(() => {
    if (!user || !profile || profile.role !== "player") return;
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

        // New feedback = a comment newer than the last time this swing was opened.
        // Comments from coaches the player blocked don't count.
        const [comments, blockSnap] = await Promise.all([
          commentsOn(rows.map((r) => r.id)),
          getDocs(query(collection(db, "blocks"), where("playerId", "==", user.uid))),
        ]);
        const blocked = new Set(blockSnap.docs.map((d) => d.data().coachId as string));
        const latest = new Map<string, number>();
        comments
          .filter((c) => !c.mentorId || !blocked.has(c.mentorId))
          .forEach((c) => latest.set(c.sessionId, Math.max(latest.get(c.sessionId) ?? 0, c.createdAt)));
        setUnread(rows.filter((r) => (latest.get(r.id) ?? 0) > (r.feedbackSeenAt ?? 0)));
      } catch {
        setLoadError(true);
      }
    })();
  }, [user, profile, reloadKey]);

  useEffect(() => {
    if (!user || !profile) return;
    const load =
      profile.role === "mentor" && profile.verifiedMentor
        ? coachImpact(user.uid)
        : profile.role === "guardian"
          ? familyImpact(user.uid)
          : null;
    load?.then(setImpact).catch(() => {});
  }, [user, profile]);

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
        <h1 className={`text-4xl font-bold tracking-tight lg:text-6xl ${isCoach ? "mb-3" : "mb-6 lg:mb-10"}`}>
          {firstName}
        </h1>
        {isCoach && (
          <div className="mb-6 lg:mb-10">
            {profile.verifiedMentor ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-sm font-semibold text-primary">
                <BadgeCheck className="h-4 w-4" /> Approved coach
                {profile.coachOrg && <span className="font-normal">· {profile.coachOrg}</span>}
              </span>
            ) : profile.coachStatus === "rejected" ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/15 px-3 py-1 text-sm font-semibold text-destructive">
                Needs changes · see your application
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-sm font-semibold text-amber-400">
                <Clock className="h-4 w-4" /> Being verified
                {profile.coachOrg && <span className="font-normal">· {profile.coachOrg}</span>}
              </span>
            )}
          </div>
        )}
        {profile?.isAdmin && (
          <Link href="/admin" className="mb-4 block rounded-2xl bg-primary/15 p-4 text-sm font-semibold text-primary ring-1 ring-primary lg:max-w-md">
            🛡️ Admin: approve coaches →
          </Link>
        )}
        {(!isCoach || profile.verifiedMentor) && <ImpactStrip impact={impact} isCoach={isCoach} />}
        <Link
          href={isCoach ? "/coach" : "/family"}
          className="block rounded-2xl bg-card p-6 transition-colors hover:bg-secondary lg:max-w-md"
        >
          <div className="mb-1 text-lg font-semibold">
            {isCoach
              ? profile.verifiedMentor
                ? "🧢 Review queue →"
                : "🧢 Finish coach setup →"
              : "👨‍👩‍👧 Your player's activity →"}
          </div>
          <p className="text-sm text-muted-foreground">
            {isCoach
              ? profile.verifiedMentor
                ? "Anonymized swings waiting for your eye. Comments and drills you leave are visible to players and their parents."
                : "A real person checks every coach before they see any player videos. Track your application here."
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

      {unread.length > 0 && (
        <Link
          href={`/analysis/${unread[0].id}`}
          className="mb-6 flex items-center gap-3 rounded-2xl bg-primary/15 p-4 ring-1 ring-primary lg:max-w-md"
        >
          <MessageCircle className="h-5 w-5 text-primary" />
          <span className="flex-1 text-sm">
            <span className="block font-semibold text-primary">New coach feedback</span>
            <span className="text-muted-foreground">
              {unread.length === 1
                ? `On your ${new Date(unread[0].createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })} swing — tap to watch.`
                : `On ${unread.length} of your swings — tap to start with the newest.`}
            </span>
          </span>
          <span className="text-primary">→</span>
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
              <Link
                key={s.id}
                href={`/analysis/${s.id}`}
                className="flex items-center gap-3 border-t border-border p-4 py-3 transition-colors hover:bg-secondary"
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
                {unread.some((u) => u.id === s.id) ? (
                  <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                    new feedback
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">{s.status}</span>
                )}
              </Link>
            ))}
          </section>
          {user && <FamilyCard playerId={user.uid} playerName={user.displayName ?? "Player"} />}
        </div>
      </div>
    </main>
  );
}
