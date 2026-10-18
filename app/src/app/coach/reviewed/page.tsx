"use client";

// Reviewed (Field skin, coach) — every swing this coach has put words on,
// newest first. Players stay anonymous (player number only). Each card
// opens the swing. Linked only from the Field tab bar.
import Link from "next/link";
import { CoachGate, HistoryLoadState, shortDate, useReviewHistory } from "@/components/CoachHistory";
import Notice from "@/components/Notice";
import { anonPlayer } from "@/lib/anon";
import { DRILLS } from "@/lib/drills";

function ReviewedList() {
  const { reviews, loadError, retry } = useReviewHistory();
  const swings = reviews ? new Set(reviews.map((r) => r.sessionId)).size : 0;
  return (
    <main className="mx-auto max-w-md p-6 pb-28 desk:max-w-2xl">
      <h1 className="dd-title mb-2 text-4xl font-bold tracking-tight">Reviewed</h1>
      <p className="dd-sub mb-6 text-sm text-muted-foreground">
        {reviews && reviews.length > 0
          ? `Every swing you've put words on — ${swings} swing${swings === 1 ? "" : "s"} and counting.`
          : "Every swing you've put words on, newest first."}
      </p>

      {reviews === null && <HistoryLoadState loadError={loadError} retry={retry} what="reviews" />}
      {reviews?.length === 0 && (
        <Notice title="No reviews yet" actions={[{ label: "Go to On Deck", href: "/" }]}>
          Swings you comment on show up here, newest first.
        </Notice>
      )}
      {reviews && reviews.length > 0 && (
        <section className="dd-enter space-y-3">
          {reviews.map((r) => (
            <Link key={r.id} href={`/analysis/${r.sessionId}`} className="dd-comment dd-linkcard block rounded-2xl bg-card p-4">
              <span className="dd-coachline block text-xs text-muted-foreground">
                <b className="dd-coachname font-semibold text-foreground">{anonPlayer(r.playerId)}</b> · {shortDate(r.createdAt)}
              </span>
              <span className="dd-review-text mt-1 block whitespace-pre-line break-words text-sm">{r.text}</span>
              {r.drillIds.length > 0 && (
                <span className="dd-assigned mt-2 block text-xs text-primary">
                  {r.drillIds.map((id) => DRILLS.find((d) => d.id === id)?.name ?? id).join(" · ")} assigned
                </span>
              )}
            </Link>
          ))}
        </section>
      )}
      {reviews && reviews.length > 0 && (
        <p className="dd-promise">
          Open a swing to add a follow-up — players see every comment you&apos;ve left them.
        </p>
      )}
    </main>
  );
}

export default function ReviewedPage() {
  return (
    <CoachGate title="Reviewed">
      <ReviewedList />
    </CoachGate>
  );
}
