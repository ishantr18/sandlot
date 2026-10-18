"use client";

// Home dashboard. Phone: single column. Desktop: two-column spread —
// stats/actions left, focus + recent swings right.
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import {
  BadgeCheck,
  ClipboardList,
  Clock,
  Dumbbell,
  Flame,
  MessageCircle,
  Play,
  ShieldCheck,
  TrendingUp,
  Users,
  Video,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import BrandMark from "@/components/BrandMark";
import CountUp from "@/components/CountUp";
import FamilyCard from "@/components/FamilyCard";
import Landing from "@/components/Landing";
import Notice from "@/components/Notice";
import { db } from "@/lib/firebase";
import { linksFor } from "@/lib/family";
import { SIGNED_OUT_START } from "@/lib/startScreen";

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
      value: impact?.value,
      prefix: "$",
      label: isCoach ? "est. coaching given free" : "est. coaching received free",
    },
  ];
  return (
    <section className="mb-4 wide:max-w-md">
      <div className="grid grid-cols-3 gap-2">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl bg-card p-4">
            <div className="font-mono text-2xl font-bold text-primary">
              {t.value == null ? "–" : <CountUp value={t.value} prefix={t.prefix} />}
            </div>
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
  const router = useRouter();

  // Signed-out visitors start on sign-in (signed-in users stay signed in on
  // their device and go straight to their dashboard)
  useEffect(() => {
    if (!loading && !user && SIGNED_OUT_START === "signin") router.replace("/auth?mode=signin");
  }, [loading, user, router]);
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

  // Until we know who's here, show nothing app-shaped — otherwise a signed-out
  // visitor sees the dashboard flash before the landing settles.
  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <BrandMark className="h-12 w-12 animate-pulse" />
      </main>
    );
  }

  if (!user) {
    // Signed-out start screen: sign-in (redirect above) or the welcome landing
    return SIGNED_OUT_START === "landing" ? (
      <Landing />
    ) : (
      <main className="flex min-h-screen items-center justify-center">
        <BrandMark className="h-12 w-12 animate-pulse" />
      </main>
    );
  }

  const firstName = user?.displayName?.split(" ")[0] ?? "player";

  // Coaches and parents get their own hub — player stats don't apply to them
  if (profile?.role === "mentor" || profile?.role === "guardian") {
    const isCoach = profile.role === "mentor";
    return (
      <main className="mx-auto max-w-md p-6 pb-28 desk:max-w-2xl wide:max-w-5xl wide:px-10 wide:pt-12">
        <p className="text-sm text-muted-foreground">Welcome back,</p>
        <h1 className={`text-4xl font-bold tracking-tight wide:text-6xl ${isCoach ? "mb-3" : "mb-6 wide:mb-10"}`}>
          {firstName}
        </h1>
        {isCoach && (
          <div className="mb-6 wide:mb-10">
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
          <Link href="/admin" className="mb-4 block rounded-2xl bg-primary/15 p-4 text-sm font-semibold text-primary ring-1 ring-primary wide:max-w-md">
            <ShieldCheck className="mr-1 inline h-4 w-4" /> Admin: approve coaches →
          </Link>
        )}
        {(!isCoach || profile.verifiedMentor) && <ImpactStrip impact={impact} isCoach={isCoach} />}
        <Link
          href={isCoach ? "/coach" : "/family"}
          className="block rounded-2xl bg-card p-6 transition-colors hover:bg-secondary wide:max-w-md"
        >
          <div className="mb-1 flex items-center gap-2 text-lg font-semibold">
            {isCoach ? <ClipboardList className="h-5 w-5 text-primary" /> : <Users className="h-5 w-5 text-primary" />}
            {isCoach
              ? profile.verifiedMentor
                ? "Review queue →"
                : "Finish coach setup →"
              : "Your player's activity →"}
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
    <main className="mx-auto max-w-md p-6 pb-28 desk:max-w-2xl wide:max-w-5xl wide:px-10 wide:pt-12">
      <p className="text-sm text-muted-foreground">Welcome back,</p>
      <h1 className="mb-6 text-4xl font-bold tracking-tight wide:mb-10 wide:text-6xl">
        {firstName}
      </h1>
      {profile?.isAdmin && (
          <Link href="/admin" className="mb-4 block rounded-2xl bg-primary/15 p-4 text-sm font-semibold text-primary ring-1 ring-primary wide:max-w-md">
            <ShieldCheck className="mr-1 inline h-4 w-4" /> Admin: approve coaches →
          </Link>
        )}

      {unread.length > 0 && (
        <Link
          href={`/analysis/${unread[0].id}`}
          className="mb-6 flex items-center gap-3 rounded-2xl bg-primary/15 p-4 ring-1 ring-primary wide:max-w-md"
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

      <div className="wide:grid wide:grid-cols-5 wide:gap-8">
        {/* Left: stats + actions */}
        <div className="wide:col-span-3">
          <div className="mb-6 grid grid-cols-3 gap-2 wide:gap-4">
            <div className="rounded-2xl bg-card p-4 wide:p-6">
              <div className="flex items-center gap-1 font-mono text-2xl font-bold text-primary wide:text-4xl">
                <Flame className="h-5 w-5 wide:h-7 wide:w-7" />
                {stats ? <CountUp value={stats.streak} /> : "–"}
              </div>
              <div className="mt-1 text-xs text-muted-foreground wide:text-sm">day streak</div>
            </div>
            <div className="rounded-2xl bg-card p-4 wide:p-6">
              <div className="font-mono text-2xl font-bold wide:text-4xl">
                {stats ? <CountUp value={stats.thisWeek} /> : "–"}
              </div>
              <div className="mt-1 text-xs text-muted-foreground wide:text-sm">this week</div>
            </div>
            <div className="rounded-2xl bg-card p-4 wide:p-6">
              <div className="font-mono text-2xl font-bold wide:text-4xl">
                {stats ? <CountUp value={stats.total} /> : "–"}
              </div>
              <div className="mt-1 text-xs text-muted-foreground wide:text-sm">
                total swings
              </div>
            </div>
          </div>

          <div className="mb-6 grid grid-cols-3 gap-2 wide:gap-4">
            {ACTIONS.map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className="flex flex-col items-center gap-2 rounded-2xl bg-card p-4 text-xs font-medium transition-colors hover:bg-secondary wide:p-8 wide:text-sm"
              >
                <a.icon className="h-5 w-5 text-primary wide:h-7 wide:w-7" />
                {a.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Right: focus + recent activity */}
        <div className="wide:col-span-2">
          <section className="mb-6 rounded-2xl bg-card p-4 wide:p-6">
            <h2 className="mb-1 text-sm font-semibold">Today&apos;s focus</h2>
            <p className="text-sm text-muted-foreground">
              {stats?.lastAt
                ? `Last swing ${new Date(stats.lastAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}. Film a new one and keep the streak alive.`
                : "Film your first swing to get your baseline analysis."}
            </p>
          </section>

          <section className="rounded-2xl bg-card wide:min-h-48">
            <div className="flex items-center justify-between p-4 pb-2">
              <h2 className="text-sm font-semibold">Recent swings</h2>
              <Link href="/progress" className="text-xs text-primary">
                See all →
              </Link>
            </div>
            {loadError ? (
              <div className="p-2 pt-0">
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
              </div>
            ) : (
              stats &&
              recent.length === 0 && (
                <div className="p-2 pt-0">
                  <Notice
                    title="No swings yet"
                    actions={[
                      { label: "Film your first swing", href: "/upload" },
                      { label: "See a sample", href: "/sample" },
                    ]}
                  >
                    Your first one sets the starting point everything is measured from.
                  </Notice>
                </div>
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
