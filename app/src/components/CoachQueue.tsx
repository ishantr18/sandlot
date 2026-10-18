"use client";

// The coach review queue — loading hook + the list with its "All swings /
// ★ Prefer you" tabs. Used by the classic /coach page and the Field-skin
// On Deck screen. `field` switches the row look (prototype .queuerow with
// pill tags); the classic look is unchanged.
import PlayerName from "@/components/PlayerName";
import { ChevronRight, Play, Star } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import Notice from "@/components/Notice";
import { loadCoachQueue, sortQueue, type CoachQueueData, type QueueRow, type QueueTag } from "@/lib/coachQueue";

// Loads the queue for a certified coach. Retry bumps the key.
export function useCoachQueue() {
  const { user, profile } = useAuth();
  const [data, setData] = useState<CoachQueueData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0); // bump to retry the load

  useEffect(() => {
    if (!user || profile?.role !== "mentor" || !profile.verifiedMentor) return;
    (async () => {
      try {
        setData(await loadCoachQueue(user.uid));
      } catch {
        setLoadError(true);
      }
    })();
  }, [user, profile, reloadKey]);

  return {
    data,
    loadError,
    retry: () => {
      setLoadError(false);
      setReloadKey((k) => k + 1);
    },
  };
}

export function QueueLoadState({ loadError, retry }: { loadError: boolean; retry: () => void }) {
  return loadError ? (
    <Notice tone="error" title="Couldn't load the review queue" actions={[{ label: "Try again", onClick: retry }]}>
      Check your connection, then try again.
    </Notice>
  ) : (
    <p className="text-sm text-muted-foreground">Loading…</p>
  );
}

const TAG_LABEL: Record<QueueTag, string> = { "least-coached": "least-coached", new: "new", repeat: "repeat" };

function FieldRow({ r, fan }: { r: QueueRow; fan: boolean }) {
  const d = new Date(r.createdAt);
  return (
    <Link href={`/analysis/${r.id}`} className="dd-queuerow">
      <span className="dd-thumb" aria-hidden="true">
        <Play className="h-5 w-5 fill-current" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="dd-who">
          <PlayerName uid={r.playerId} />
          {fan && (
            <span className="dd-fan">
              <Star className="h-3.5 w-3.5 fill-current" /> prefers you
            </span>
          )}
        </span>
        <span className="dd-meta">
          {d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} swing · filmed{" "}
          {d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
          <br />
          {r.reviews === 0 ? "never reviewed" : `${r.reviews} review${r.reviews > 1 ? "s" : ""}`}
          {r.mine > 0 && " · you reviewed this"}
        </span>
      </span>
      {r.tags.length > 0 && (
        <span className="dd-tags">
          {r.tags.map((t) => (
            <span key={t} className={`dd-pilltag ${t === "new" ? "dd-pilltag-new" : t === "repeat" ? "dd-pilltag-repeat" : ""}`}>
              {TAG_LABEL[t]}
            </span>
          ))}
        </span>
      )}
      <ChevronRight className="dd-chev h-5 w-5 shrink-0" />
    </Link>
  );
}

export default function CoachQueueList({ data, field = false }: { data: CoachQueueData; field?: boolean }) {
  const [tab, setTab] = useState<"all" | "fans">("all");
  const { fans } = data;
  // Classic: equity order (least-reviewed first). Field skin: newest first.
  const rows = sortQueue(data.rows, field ? "recent" : "equity");
  // Same order in both tabs; "Prefer you" just narrows it
  const fanRows = rows.filter((r) => fans.has(r.playerId));
  const shown = tab === "fans" ? fanRows : rows;

  return (
    <>
      {/* Two views of the same queue */}
      <div className={`mb-3 flex flex-wrap gap-2 ${field ? "dd-filters" : ""}`}>
        {(
          [
            ["all", `All swings (${rows.length})`],
            ["fans", `Prefer you (${fanRows.length})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            aria-pressed={tab === key}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              tab === key ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {key === "fans" && <Star className={`h-3.5 w-3.5 ${tab === key ? "fill-current" : "fill-amber-400 text-amber-400"}`} />}
            {label}
          </button>
        ))}
      </div>

      {tab === "all" && rows.length === 0 && (
        <Notice title="No swings waiting">
          {field
            ? "You're all caught up — the queue fills as players upload, newest first."
            : <>You&apos;re all caught up — the queue fills as players upload, least-coached first.</>}
        </Notice>
      )}
      {tab === "fans" && fanRows.length === 0 && (
        <Notice title="No players have favorited you yet">
          They can tap ☆ on any of your comments.
        </Notice>
      )}

      {shown.length > 0 &&
        (field ? (
          <section key={tab} className="dd-enter">
            {shown.map((r) => (
              <FieldRow key={r.id} r={r} fan={fans.has(r.playerId)} />
            ))}
          </section>
        ) : (
          <section key={tab} className="dd-enter rounded-2xl bg-card wide:max-w-2xl">
            {shown.map((r, i) => (
              <Link
                key={r.id}
                href={`/analysis/${r.id}`}
                className={`flex items-center gap-3 p-4 ${i > 0 ? "border-t border-border" : ""}`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <PlayerName uid={r.playerId} />
                    {fans.has(r.playerId) && (
                      <span className="flex items-center gap-1 text-xs font-semibold text-amber-400">
                        <Star className="h-3.5 w-3.5 fill-amber-400" /> prefers you
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(r.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </div>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    r.reviews === 0 ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {r.reviews === 0 ? "never reviewed" : `${r.reviews} review${r.reviews > 1 ? "s" : ""}`}
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
          </section>
        ))}
    </>
  );
}
