"use client";

// Athlete growth: five skill bars (level now + growth since the player's first
// swings), an effort bar, and coach confirmations. One component, three views:
//   player — their own growth (Growth tab)
//   parent — their linked athlete's growth (Athlete's Growth tab)
//   coach  — the anonymous player's growth, with "Confirm progress" buttons
import { collection, doc, getDocs, query, setDoc, where } from "firebase/firestore";
import { CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { db } from "@/lib/firebase";
import {
  computeGrowth,
  firstVsLatest,
  SKILL_INFO,
  SKILLS,
  STEADY_BAND,
  swingsThisWeek,
  WEEKLY_SWING_GOAL,
  WINDOW,
  type GrowthSession,
  type Skill,
} from "@/lib/growth";

interface Confirmation {
  skill: Skill;
  level: number;
  coachName?: string;
  createdAt: number;
}

async function saveConfirmation(playerId: string, skill: Skill, level: number, coachId: string, coachName: string) {
  await setDoc(doc(db, "progressConfirmations", `${playerId}_${skill}`), {
    playerId,
    skill,
    level,
    coachId,
    coachName,
    createdAt: Date.now(),
  });
}

function Bar({ value, tone = "bg-primary" }: { value: number; tone?: string }) {
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
      <div className={`h-full rounded-full ${tone} transition-all`} style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
    </div>
  );
}

export default function GrowthPanel({
  playerId,
  mode,
  sessions: given,
}: {
  playerId: string;
  mode: "player" | "parent" | "coach";
  sessions?: GrowthSession[]; // pass if the page already loaded them
}) {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<GrowthSession[] | null>(given ?? null);
  const [confirms, setConfirms] = useState<Partial<Record<Skill, Confirmation>>>({});
  const [drills, setDrills] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState<Skill | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [s, c, a] = await Promise.all([
          given
            ? null
            : getDocs(query(collection(db, "sessions"), where("playerId", "==", playerId))),
          getDocs(query(collection(db, "progressConfirmations"), where("playerId", "==", playerId))),
          getDocs(query(collection(db, "assignments"), where("playerId", "==", playerId))),
        ]);
        if (s) setSessions(s.docs.map((d) => d.data() as GrowthSession));
        const byskill: Partial<Record<Skill, Confirmation>> = {};
        c.docs.forEach((d) => {
          const x = d.data() as Confirmation;
          byskill[x.skill] = x;
        });
        setConfirms(byskill);
        setDrills({ done: a.docs.filter((d) => d.data().status === "done").length, total: a.size });
      } catch {
        setError("Couldn't load growth — check your connection.");
      }
    })();
  }, [playerId, given, reloadKey]);

  if (error)
    return (
      <p className="rounded-2xl bg-card p-4 text-sm text-destructive">
        {error}{" "}
        <button onClick={() => { setError(""); setReloadKey((k) => k + 1); }} className="text-primary underline">
          Retry
        </button>
      </p>
    );
  if (!sessions) return <p className="text-sm text-muted-foreground">Loading growth…</p>;

  const growth = computeGrowth(sessions);
  const week = swingsThisWeek(sessions);
  const compare = firstVsLatest(sessions);
  const shortDate = (t: number) =>
    new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const you = mode === "player" ? "your" : mode === "parent" ? "their" : "this player's";

  async function confirm(skill: Skill, level: number) {
    if (!user) return;
    setBusy(skill);
    try {
      await saveConfirmation(playerId, skill, level, user.uid, user.displayName ?? "Coach");
      setReloadKey((k) => k + 1);
    } catch {
      setError("Couldn't save the confirmation — try again.");
    }
    setBusy(null);
  }

  return (
    <section className="mb-6 space-y-3">
      {/* Effort — always in the kid's control */}
      <div className="rounded-2xl bg-card p-4">
        <div className="mb-1 flex items-baseline justify-between">
          <h3 className="text-sm font-semibold">Effort this week</h3>
          <span className="text-xs text-muted-foreground">
            {week} / {WEEKLY_SWING_GOAL} swings
            {drills && drills.total > 0 && ` · ${drills.done} / ${drills.total} drills done`}
          </span>
        </div>
        <Bar value={(Math.min(week, WEEKLY_SWING_GOAL) / WEEKLY_SWING_GOAL) * 100} tone="bg-amber-500" />
      </div>

      {/* Skills — compared only to the player's own first swings */}
      <div className="rounded-2xl bg-card p-4">
        <h3 className="text-sm font-semibold">Skills</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Compared to {you} own first {WINDOW} swings — never to other players. Each bar is the
          average of the last {WINDOW} swings.
        </p>
        <div className="space-y-4">
          {growth.map((g) => {
            const info = SKILL_INFO[g.skill];
            const c = confirms[g.skill];
            const milestone = g.delta != null && g.delta >= 10 ? Math.floor(g.delta / 10) * 10 : null;
            return (
              <div key={g.skill}>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{info.name}</span>
                  <span className="text-xs">
                    {g.now == null ? (
                      <span className="text-muted-foreground">
                        Film {WINDOW - g.swings} more swing{WINDOW - g.swings === 1 ? "" : "s"} to start this bar
                      </span>
                    ) : (
                      <>
                        <span className="font-mono font-semibold">{g.now}%</span>{" "}
                        {g.delta == null ? (
                          <span className="text-muted-foreground">· starting point set</span>
                        ) : Math.abs(g.delta) < STEADY_BAND ? (
                          <span className="text-muted-foreground">· steady</span>
                        ) : g.delta > 0 ? (
                          <span className="text-primary">▲ +{g.delta} since the start</span>
                        ) : (
                          <span className="text-amber-500">▼ {g.delta} since the start</span>
                        )}
                      </>
                    )}
                  </span>
                </div>
                <Bar value={g.now ?? 0} />
                <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>{info.what}</span>
                  {c && (
                    <span className="flex items-center gap-1 text-primary">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Coach-confirmed at {c.level}% ·{" "}
                      {new Date(c.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </span>
                  )}
                </div>
                {milestone && mode !== "coach" && (
                  <p className="mt-1 text-xs text-primary">+{milestone} in {info.name} since {you === "your" ? "you" : "they"} started</p>
                )}
                {mode === "coach" && g.now != null && (
                  <button
                    disabled={busy === g.skill}
                    onClick={() => confirm(g.skill, g.now!)}
                    className="mt-1 rounded-full border border-border px-3 py-1 text-xs disabled:opacity-40"
                  >
                    {c ? "Re-confirm progress" : "Confirm progress"} at {g.now}%
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* First swing vs newest swing — same five skills, one swing each */}
      {compare && (
        <div className="rounded-2xl bg-card p-4">
          <h3 className="text-sm font-semibold">First swing vs latest</h3>
          <p className="mb-3 text-xs text-muted-foreground">
            {you === "your" ? "Your" : you === "their" ? "Their" : "This player's"} very first
            analyzed swing ({shortDate(compare.first.createdAt)}) next to the newest (
            {shortDate(compare.latest.createdAt)}).
          </p>
          <div className="mb-2 grid grid-cols-[5.5rem_1fr_1fr] gap-x-3 text-xs text-muted-foreground">
            <span />
            <span>First</span>
            <span>Latest</span>
          </div>
          <div className="space-y-3">
            {SKILLS.map((skill) => {
              const a = compare.first.levels[skill];
              const b = compare.latest.levels[skill];
              if (a == null && b == null) return null;
              return (
                <div key={skill} className="grid grid-cols-[5.5rem_1fr_1fr] items-center gap-x-3">
                  <span className="text-sm font-medium">{SKILL_INFO[skill].name}</span>
                  {[a, b].map((v, i) => (
                    <div key={i} className="flex items-center gap-2">
                      {v == null ? (
                        <span className="text-xs text-muted-foreground">not measured</span>
                      ) : (
                        <>
                          <Bar value={v} tone={i === 0 ? "bg-muted-foreground" : "bg-primary"} />
                          <span className="w-9 shrink-0 text-right font-mono text-xs">{Math.round(v)}%</span>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
