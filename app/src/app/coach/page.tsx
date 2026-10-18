"use client";

// Coach review queue — the certified-coach open pool.
//
// Trust model (user-designed, Aug 22):
// - Only CERTIFIED coaches (application approved by the admin) see anything
// - Players are ANONYMOUS to coaches (number, pixelated video, no name);
//   coaches are fully identified to players and parents
// - EQUITY QUEUE: swings with the fewest coach reviews come first, so
//   attention flows to whoever has received the least
// - One-way: coaches give feedback; there is no reply channel
// - Players can favorite a coach; "Prefer you" filters to those players
//   (still anonymous — the coach only sees the player number)
//
// Field skin (FIELD_SKIN_ROLES includes "mentor"): this route shows the
// On Deck screen, the same one coaches get at "/".
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import CoachQueueList, { QueueLoadState, useCoachQueue } from "@/components/CoachQueue";
import CoachApplicationStatus from "@/components/CoachApplicationStatus";
import OnDeck from "@/components/OnDeck";
import { fieldSkinOn } from "@/lib/skin";

export default function CoachPage() {
  const { profile } = useAuth();
  if (profile?.role === "mentor" && fieldSkinOn(profile.role)) return <OnDeck />;
  return <ClassicCoachPage />;
}

function ClassicCoachPage() {
  const { user, profile, loading } = useAuth();
  const { data, loadError, retry } = useCoachQueue();

  if (!loading && (!user || profile?.role !== "mentor")) {
    return (
      <main className="mx-auto max-w-md p-6 pb-28">
        <h1 className="mb-6 text-4xl font-bold tracking-tight">Coach</h1>
        <p className="rounded-2xl bg-card p-6 text-sm text-muted-foreground">
          This page is for coach accounts.{" "}
          <Link href="/auth" className="text-primary underline">
            Sign in
          </Link>{" "}
          as a coach to review swings.
        </p>
      </main>
    );
  }

  // Certification gate — uncertified coaches see nothing but this
  if (profile?.role === "mentor" && !profile.verifiedMentor) {
    return <CoachApplicationStatus />;
  }

  return (
    <main className="mx-auto max-w-md p-6 pb-28 desk:max-w-2xl wide:max-w-5xl wide:px-10 wide:pt-12">
      <h1 className="mb-2 text-4xl font-bold tracking-tight wide:text-6xl">Review queue</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Sorted so the least-coached players come first. Players are anonymous to
        you; your name and every word you write are visible to them and their
        parents. Videos are face-anonymized before they ever reach the cloud.
      </p>

      {data === null && <QueueLoadState loadError={loadError} retry={retry} />}
      {data && <CoachQueueList data={data} />}
    </main>
  );
}
