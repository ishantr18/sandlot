"use client";

// Players (Field skin, coach) — everyone this coach has reviewed, most
// recently reviewed first, each trending only against their OWN start.
// Never a ranking: the order is just "who you reviewed last".
// Players stay anonymous (player number only). Linked only from the Field tab bar.
import PlayerName from "@/components/PlayerName";
import { collection, getDocs, query, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import { CoachGate, HistoryLoadState, shortDate, useReviewHistory } from "@/components/CoachHistory";
import Notice from "@/components/Notice";
import { db } from "@/lib/firebase";
import { computeGrowth, SKILL_INFO, STEADY_BAND, type GrowthSession } from "@/lib/growth";

// "Hands +6 vs their start" — the player's strongest skill gain vs their
// own first swings (same math as the Growth screens). null = too few swings.
function trendLine(sessions: GrowthSession[]): string | null {
  const g = computeGrowth(sessions).filter((x) => x.delta != null);
  if (g.length === 0) return null;
  const best = g.reduce((a, b) => (b.delta! > a.delta! ? b : a));
  return best.delta! >= STEADY_BAND ? `${SKILL_INFO[best.skill].name} +${best.delta} vs their start` : "Steady vs their start";
}

function PlayersList() {
  const { reviews, loadError, retry } = useReviewHistory();
  const [trends, setTrends] = useState<Record<string, string | null>>({});

  const players = reviews
    ? [
        ...reviews
          .reduce((m, r) => {
            const p = m.get(r.playerId) ?? { playerId: r.playerId, comments: 0, swings: new Set<string>(), last: 0 };
            p.comments += 1;
            p.swings.add(r.sessionId);
            p.last = Math.max(p.last, r.createdAt);
            return m.set(r.playerId, p);
          }, new Map<string, { playerId: string; comments: number; swings: Set<string>; last: number }>())
          .values(),
      ].sort((a, b) => b.last - a.last)
    : null;
  const ids = players?.map((p) => p.playerId).join(",") ?? "";

  // Trend lines load after the list (one read per player); a failure just
  // leaves that line off.
  useEffect(() => {
    if (!ids) return;
    ids.split(",").forEach((pid) => {
      getDocs(query(collection(db, "sessions"), where("playerId", "==", pid)))
        .then((snap) => {
          const line = trendLine(snap.docs.map((d) => d.data() as GrowthSession));
          setTrends((t) => ({ ...t, [pid]: line }));
        })
        .catch(() => {});
    });
  }, [ids]);

  return (
    <main className="mx-auto max-w-md p-6 pb-28 desk:max-w-2xl">
      <h1 className="dd-title mb-2 text-4xl font-bold tracking-tight">Players</h1>
      <p className="dd-sub mb-6 text-sm text-muted-foreground">
        Everyone you coach — and how each one is trending against their own start.
      </p>

      {players === null && <HistoryLoadState loadError={loadError} retry={retry} what="players" />}
      {players?.length === 0 && (
        <Notice title="No players yet" actions={[{ label: "Go to On Deck", href: "/" }]}>
          Players you review show up here, most recent first.
        </Notice>
      )}
      {players && players.length > 0 && (
        <section className="dd-rows dd-enter rounded-2xl bg-card">
          {players.map((p, i) => (
            <div key={p.playerId} className={`dd-row flex items-center gap-3 p-4 ${i > 0 ? "border-t border-border" : ""}`}>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium"><PlayerName uid={p.playerId} /></div>
                <div className="text-xs text-muted-foreground">
                  {p.swings.size} swing{p.swings.size === 1 ? "" : "s"} reviewed
                  {p.comments > p.swings.size && ` (${p.comments} comments)`} · last {shortDate(p.last)}
                </div>
              </div>
              {trends[p.playerId] && <span className="dd-trend shrink-0 text-xs font-semibold text-primary">{trends[p.playerId]}</span>}
            </div>
          ))}
        </section>
      )}
      {players && players.length > 0 && (
        <p className="dd-promise">Players are never ranked against each other — only against themselves.</p>
      )}
    </main>
  );
}

export default function PlayersPage() {
  return (
    <CoachGate title="Players">
      <PlayersList />
    </CoachGate>
  );
}
