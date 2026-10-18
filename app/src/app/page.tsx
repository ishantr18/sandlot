"use client";

// Home dashboard. Phone: single column. Desktop: two-column spread —
// stats/actions left, focus + recent swings right.
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import {
  BadgeCheck,
  ChevronDown,
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
import { FieldCamIcon } from "@/components/Nav";
import Notice from "@/components/Notice";
import OnDeck from "@/components/OnDeck";
import { db } from "@/lib/firebase";
import { DRILLS } from "@/lib/drills";
import { linksFor } from "@/lib/family";
import { fieldSkinOn } from "@/lib/skin";
import { PLAYER_HOME, SIGNED_OUT_START } from "@/lib/switches";

interface SessionRow {
  id: string;
  createdAt: number;
  status: string;
  feedbackSeenAt?: number; // set when the player opens the swing
}

interface CommentLite {
  sessionId: string;
  mentorId?: string;
  mentorName?: string;
  text?: string; // already in the doc — only the Field Home's "Up next" card shows it
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

// Shortcut tiles on the classic player Home
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
  const [unreadCoach, setUnreadCoach] = useState<string | null>(null); // who left the newest unread note
  const [unreadNote, setUnreadNote] = useState<CommentLite | null>(null); // that note itself (Field Home)
  const [nextDrill, setNextDrill] = useState<{ drillId: string; mentorName?: string } | null>(null);
  const [familyOpen, setFamilyOpen] = useState(false);
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
        setRecent(rows.slice(0, PLAYER_HOME === "classic" ? 4 : 3));

        // New feedback = a comment newer than the last time this swing was opened.
        // Comments from coaches the player blocked don't count.
        const [comments, blockSnap, assignSnap] = await Promise.all([
          commentsOn(rows.map((r) => r.id)),
          getDocs(query(collection(db, "blocks"), where("playerId", "==", user.uid))),
          getDocs(query(collection(db, "assignments"), where("playerId", "==", user.uid))),
        ]);
        // Oldest drill not marked done yet — the next one to work on
        const pending = assignSnap.docs
          .map((d) => d.data() as { drillId: string; mentorName?: string; status?: string; createdAt: number })
          .filter((a) => a.status !== "done")
          .sort((a, b) => a.createdAt - b.createdAt);
        setNextDrill(pending[0] ?? null);
        const blocked = new Set(blockSnap.docs.map((d) => d.data().coachId as string));
        const latest = new Map<string, number>();
        comments
          .filter((c) => !c.mentorId || !blocked.has(c.mentorId))
          .forEach((c) => latest.set(c.sessionId, Math.max(latest.get(c.sessionId) ?? 0, c.createdAt)));
        const unreadRows = rows.filter((r) => (latest.get(r.id) ?? 0) > (r.feedbackSeenAt ?? 0));
        setUnread(unreadRows);
        const newest = comments
          .filter((c) => c.sessionId === unreadRows[0]?.id && (!c.mentorId || !blocked.has(c.mentorId)))
          .sort((a, b) => b.createdAt - a.createdAt)[0];
        setUnreadCoach(newest?.mentorName ?? null);
        setUnreadNote(newest ?? null); // same comment, for the Field Home's "Up next" card
      } catch {
        setLoadError(true);
      }
    })();
  }, [user, profile, reloadKey]);

  useEffect(() => {
    if (!user || !profile) return;
    const load =
      // (Field-skin coaches get On Deck, which counts its own impact)
      profile.role === "mentor" && profile.verifiedMentor && !fieldSkinOn(profile.role)
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
        <span className="dd-loadmark contents"><BrandMark className="h-12 w-12 animate-pulse" /></span>
      </main>
    );
  }

  if (!user) {
    // Signed-out start screen: sign-in (redirect above) or the welcome landing
    return SIGNED_OUT_START === "landing" ? (
      <Landing />
    ) : (
      <main className="flex min-h-screen items-center justify-center">
        <span className="dd-loadmark contents"><BrandMark className="h-12 w-12 animate-pulse" /></span>
      </main>
    );
  }

  const firstName = user?.displayName?.split(" ")[0] ?? "player";

  // Parent Home, Field skin (switch: FIELD_SKIN_ROLES) — same data and link
  // as the classic hub below, laid out like the approved prototype
  if (profile?.role === "guardian" && fieldSkinOn(profile.role)) {
    return (
      <main className="mx-auto max-w-md p-6 pb-28 desk:max-w-2xl">
        <p className="dd-hello">Welcome back,</p>
        <h1 className="dd-name mt-1">{firstName}</h1>
        {profile.isAdmin && (
          <Link href="/admin" className="mt-4 block rounded-2xl bg-primary/15 p-4 text-sm font-semibold text-primary ring-1 ring-primary">
            <ShieldCheck className="mr-1 inline h-4 w-4" /> Admin: approve coaches →
          </Link>
        )}
        <section className="dd-impact">
          <div className="dd-big">{impact == null ? "–" : <CountUp value={impact.swings} />}</div>
          <div className="dd-cap">swings reviewed</div>
          <div className="dd-quiet">
            {impact == null
              ? "Counting…"
              : `${impact.people} coaches helping · $${impact.value} est. coaching received free`}
          </div>
          <div className="dd-quiet !mt-1">Valued at what a private lesson would charge (≈ ${VALUE_PER_REVIEW} per review).</div>
        </section>
        <p className="dd-label">Activity</p>
        <Link href="/family" className="dd-linkcard mt-3.5 block rounded-2xl bg-card p-5 transition-colors">
          <div className="dd-card-title flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Your player&apos;s activity →
          </div>
        </Link>
        <p className="dd-promise">
          Every swing, coach comment, and assigned drill —<br />
          nothing on this app is hidden from you.
        </p>
      </main>
    );
  }

  // Coach Home, Field skin: On Deck — Home and the review queue in one screen
  if (profile?.role === "mentor" && fieldSkinOn(profile.role)) return <OnDeck />;

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

  // Player Home, Field skin (switch: FIELD_SKIN_ROLES) — the prototype's Home
  // layout over the same data loaded above. Classic / nextUp stay below for
  // when the skin is off.
  if (fieldSkinOn(profile?.role)) {
    const shortDay = (t: number) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const when = (t: number) =>
      `${shortDay(t)} · ${new Date(t).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
    const nextDrillName = nextDrill ? (DRILLS.find((d) => d.id === nextDrill.drillId)?.name ?? "Your assigned drill") : null;
    const retry = () => {
      setLoadError(false);
      setReloadKey((k) => k + 1);
    };
    return (
      <main className="mx-auto max-w-md p-6 pb-28 desk:max-w-2xl">
        <p className="dd-eyebrow mt-4">
          {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        </p>
        <h1 className="dd-display mt-3">Step up.</h1>
        <p className="dd-sub mt-3 max-w-[290px]">Film one swing tonight — your coach replies by morning.</p>
        {profile?.isAdmin && (
          <Link href="/admin" className="mt-4 block rounded-2xl bg-primary/15 p-4 text-sm font-semibold text-primary ring-1 ring-primary">
            <ShieldCheck className="mr-1 inline h-4 w-4" /> Admin: approve coaches →
          </Link>
        )}

        <div className="dd-filmwrap">
          <Link href="/upload" className="dd-recordbig" aria-label="Film a swing">
            <FieldCamIcon className="h-8 w-8" />
            <span>Film</span>
          </Link>
          <Link href="/progress" className="dd-quietlink">
            or pick from your past swings
          </Link>
        </div>

        <div className="dd-statband">
          <div className="dd-stat-b">
            <b>{stats ? <CountUp value={stats.total} /> : "–"}</b>
            <span>swings filmed</span>
          </div>
          <div className="dd-stat-b">
            <b>{stats ? <CountUp value={stats.thisWeek} /> : "–"}</b>
            <span>this week</span>
          </div>
          <div className="dd-stat-b">
            <b>{stats ? <CountUp value={stats.streak} /> : "–"}</b>
            <span>day streak</span>
          </div>
        </div>

        <div className="dd-divider" />

        <p className="dd-label">Up next</p>
        {loadError ? (
          <Notice tone="error" title="Couldn't load your swings" className="mt-3.5" actions={[{ label: "Try again", onClick: retry }]}>
            Check your connection — your swings are safe.
          </Notice>
        ) : !stats ? (
          <div className="dd-card">
            <p className="dd-sub">Loading…</p>
          </div>
        ) : unread.length > 0 ? (
          <div className="dd-card">
            <div className="dd-coachline">
              <b>{unreadNote?.mentorName ?? unreadCoach ?? "Your coach"}</b>
              <BadgeCheck className="h-3.5 w-3.5 text-primary" aria-label="Verified coach" />
              <span>· {unreadNote ? when(unreadNote.createdAt) : `on your ${shortDay(unread[0].createdAt)} swing`}</span>
            </div>
            <p className="dd-quote">
              {unreadNote?.text
                ? `“${unreadNote.text}”`
                : unread.length === 1
                  ? `New feedback on your ${shortDay(unread[0].createdAt)} swing.`
                  : `New feedback on ${unread.length} of your swings.`}
            </p>
            <Link href={`/analysis/${unread[0].id}`} className="dd-drillchip-link">
              {unread.length === 1 ? "Watch it" : "Start with the newest"} <span aria-hidden="true">→</span>
            </Link>
          </div>
        ) : nextDrill ? (
          <div className="dd-card">
            <div className="dd-coachline">
              <b>{nextDrill.mentorName ?? "Your coach"}</b>
              <BadgeCheck className="h-3.5 w-3.5 text-primary" aria-label="Verified coach" />
              <span>· assigned you a drill</span>
            </div>
            <p className="dd-quote">Do it, then film it again.</p>
            <Link href="/drills" className="dd-drillchip-link">
              Assigned: {nextDrillName} <span aria-hidden="true">→</span>
            </Link>
          </div>
        ) : (
          <div className="dd-card">
            <p className="dd-sub">
              {stats.total
                ? "Nothing waiting on you. Film a swing and your coach will set what's next."
                : "Film your first swing to get your baseline analysis."}
            </p>
          </div>
        )}

        <p className="dd-label">Swings</p>
        {!loadError && stats && recent.length === 0 && (
          <Notice
            title="No swings yet"
            className="mt-3.5"
            actions={[
              { label: "Film your first swing", href: "/upload" },
              { label: "See a sample", href: "/sample" },
            ]}
          >
            Your first one sets the starting point everything is measured from.
          </Notice>
        )}
        <div className="mt-1">
          {recent.slice(0, 2).map((s) => (
            <Link key={s.id} href={`/analysis/${s.id}`} className="dd-rowitem">
              <div>
                {when(s.createdAt)}
                <div className="dd-meta">{unread.some((u) => u.id === s.id) ? "new feedback" : s.status}</div>
              </div>
              {unread.some((u) => u.id === s.id) ? (
                <span className="dd-chipstat">new</span>
              ) : (
                <span className="dd-chev" aria-hidden="true">›</span>
              )}
            </Link>
          ))}
          {stats && stats.total > 0 && (
            <Link href="/progress" className="dd-rowitem dd-rowitem-acc">
              <div>See all {stats.total} swings</div>
              <span className="dd-chev" aria-hidden="true">›</span>
            </Link>
          )}
        </div>

        <p className="dd-label">Family</p>
        <button onClick={() => setFamilyOpen((o) => !o)} aria-expanded={familyOpen} className="dd-rowitem">
          <div>
            Family code
            <div className="dd-meta">Let a parent follow along</div>
          </div>
          <span className={`dd-chev transition-transform ${familyOpen ? "rotate-90" : ""}`} aria-hidden="true">›</span>
        </button>
        {familyOpen && user && (
          <div className="dd-enter">
            <FamilyCard playerId={user.uid} playerName={user.displayName ?? "Player"} />
          </div>
        )}
      </main>
    );
  }

  // Classic player Home (switch: PLAYER_HOME in src/lib/switches.ts)
  if (PLAYER_HOME === "classic") {
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

  // The one thing to do next: new feedback → an assigned drill → film a swing
  const shortDate = (t: number) =>
    new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const filmedToday = stats?.lastAt != null && new Date(stats.lastAt).toDateString() === new Date().toDateString();
  const next = unread.length
    ? {
        icon: MessageCircle,
        title: `${unreadCoach ? `Coach ${unreadCoach.split(" ")[0]}` : "Your coach"} left feedback`,
        detail:
          unread.length === 1
            ? `On your ${shortDate(unread[0].createdAt)} swing.`
            : `On ${unread.length} of your swings — start with the newest.`,
        cta: "Watch it",
        href: `/analysis/${unread[0].id}`,
      }
    : nextDrill
      ? {
          icon: Dumbbell,
          title: DRILLS.find((d) => d.id === nextDrill.drillId)?.name ?? "Your assigned drill",
          detail: `Assigned by ${nextDrill.mentorName ?? "your coach"}. Do it, then film it again.`,
          cta: "Open drills",
          href: "/drills",
        }
      : {
          icon: Video,
          title: !stats?.total ? "Film your first swing" : filmedToday ? "Nice work today" : "Film today's swing",
          detail: !stats?.total
            ? "It sets the starting point everything is measured from."
            : filmedToday
              ? "Film another to give your coach more to see."
              : stats.streak > 0
                ? `Keep your ${stats.streak}-day streak alive.`
                : `Last swing ${shortDate(stats.lastAt!)}. Start a new streak.`,
          cta: "Film a swing",
          href: "/upload",
        };

  return (
    <main className="mx-auto max-w-md p-6 pb-28 desk:max-w-2xl">
      <p className="text-sm text-muted-foreground">Welcome back,</p>
      <h1 className="mb-6 text-4xl font-bold tracking-tight">{firstName}</h1>
      {profile?.isAdmin && (
        <Link href="/admin" className="mb-4 block rounded-2xl bg-primary/15 p-4 text-sm font-semibold text-primary ring-1 ring-primary">
          <ShieldCheck className="mr-1 inline h-4 w-4" /> Admin: approve coaches →
        </Link>
      )}

      {/* Next up — always exactly one thing to do */}
      {stats && !loadError && (
        <Link href={next.href} className="mb-4 block rounded-2xl bg-primary/10 p-5 ring-1 ring-primary/50">
          <p className="text-xs font-extrabold uppercase tracking-wider text-primary">Next up</p>
          <div className="mt-2 flex items-start gap-3">
            <next.icon className="mt-1 h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="text-lg font-semibold">{next.title}</p>
              <p className="text-sm text-muted-foreground">{next.detail}</p>
            </div>
          </div>
          <span className="mt-4 inline-block rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
            {next.cta} →
          </span>
        </Link>
      )}

      {/* Stats — one line */}
      <div className="mb-6 flex items-center gap-2 rounded-2xl bg-card px-4 py-3 text-sm">
        <Flame className="h-4 w-4 text-primary" />
        <span>
          <span className="font-mono font-bold text-primary">{stats ? <CountUp value={stats.streak} /> : "–"}</span>-day streak
        </span>
        <span className="text-muted-foreground">·</span>
        <span>
          <span className="font-mono font-bold">{stats ? <CountUp value={stats.thisWeek} /> : "–"}</span> this week
        </span>
        <span className="text-muted-foreground">·</span>
        <span>
          <span className="font-mono font-bold">{stats ? <CountUp value={stats.total} /> : "–"}</span> total
        </span>
      </div>

      <section className="mb-4 rounded-2xl bg-card">
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
            <p className="px-4 pb-4 text-sm text-muted-foreground">
              Your swings show up here.{" "}
              <Link href="/sample" className="text-primary underline">
                See a sample
              </Link>
            </p>
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
              {shortDate(s.createdAt)} ·{" "}
              {new Date(s.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
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

      {/* Family code — rarely needed, so one row that opens */}
      <button
        onClick={() => setFamilyOpen((o) => !o)}
        className="flex w-full items-center gap-3 rounded-2xl bg-card p-4 text-left text-sm font-semibold"
      >
        <Users className="h-4 w-4 text-primary" />
        <span className="flex-1">Family &amp; parents</span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${familyOpen ? "rotate-180" : ""}`} />
      </button>
      {familyOpen && user && (
        <div className="dd-enter -mt-2">
          <FamilyCard playerId={user.uid} playerName={user.displayName ?? "Player"} />
        </div>
      )}
    </main>
  );
}
