"use client";

// On Deck — the coach's Home and review queue in one screen (Field skin only;
// switch: FIELD_SKIN_ROLES in src/lib/switches.ts). Merges what the classic
// coach Home ("/") and Review queue ("/coach") show: approval status, admin
// link, impact numbers (as the prototype stat band) and the queue with its
// All swings / Prefer you tabs. Uncertified coaches still see only their
// application status — never a swing.
import { BadgeCheck, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import CoachApplicationStatus from "@/components/CoachApplicationStatus";
import CoachQueueList, { QueueLoadState, useCoachQueue } from "@/components/CoachQueue";
import CountUp from "@/components/CountUp";
import { coachImpactFrom, setWaitingCount, VALUE_PER_REVIEW } from "@/lib/coachQueue";
import { IMPACT_STAT } from "@/lib/switches";

function AdminLink() {
  return (
    <Link href="/admin" className="mt-4 block rounded-2xl bg-primary/15 p-4 text-sm font-semibold text-primary ring-1 ring-primary">
      <ShieldCheck className="mr-1 inline h-4 w-4" /> Admin: approve coaches →
    </Link>
  );
}

export default function OnDeck() {
  const { user, profile } = useAuth();
  const { data, loadError, retry } = useCoachQueue();
  const [impact, setImpact] = useState<{ swings: number; people: number; value: number; comments: number } | null>(null);

  useEffect(() => {
    if (!data || !user) return;
    // Waiting = swings I haven't put words on yet (also the tab bar badge)
    setWaitingCount(user.uid, data.rows.filter((r) => r.mine === 0).length);
    coachImpactFrom(data).then(setImpact).catch(() => {});
  }, [data, user]);

  // Certification gate — uncertified coaches see nothing but this
  if (profile?.role === "mentor" && !profile.verifiedMentor) {
    return <CoachApplicationStatus top={profile.isAdmin ? <AdminLink /> : null} />;
  }

  const firstName = user?.displayName?.split(" ")[0] ?? "Coach";
  const waiting = data ? data.rows.filter((r) => r.mine === 0).length : null;
  const stats = [
    { value: impact?.swings, label: "swings reviewed" },
    { value: impact?.people, label: "players coached" },
    IMPACT_STAT === "comments"
      ? { value: impact?.comments, prefix: undefined, label: "comments written" }
      : { value: impact?.value, prefix: "$", label: "coaching given free" },
  ];

  return (
    <main className="mx-auto max-w-md p-6 pb-28 desk:max-w-2xl">
      <p className="dd-eyebrow">
        Welcome back, {firstName}
      </p>
      <h1 className="dd-title mt-2.5">
        {waiting == null ? "On Deck" : waiting === 0 ? "All caught up" : `${waiting} swing${waiting === 1 ? "" : "s"} waiting`}
      </h1>
      <p className="dd-sub mt-2.5">
        {waiting === 0
          ? "Every swing on deck has your words on it."
          : "Newest swings first — tags flag who's been coached least. Players are anonymous to you; your name and every word you write are visible to them and their parents."}
      </p>
      <span className="dd-approved mt-3">
        <BadgeCheck className="h-4 w-4" /> Approved coach
        {profile?.coachOrg && <span className="font-normal">· {profile.coachOrg}</span>}
      </span>
      {profile?.isAdmin && <AdminLink />}

      <section className="dd-statband">
        {stats.map((s) => (
          <div key={s.label} className="dd-statcell">
            <b>{s.value == null ? "–" : <CountUp value={s.value} prefix={s.prefix} />}</b>
            <span>{s.label}</span>
          </div>
        ))}
      </section>
      {IMPACT_STAT === "dollars" && (
        <p className="dd-quiet-note">
          Every review you leave is a lesson a family didn&apos;t have to pay for (≈ ${VALUE_PER_REVIEW} each).
        </p>
      )}

      <p className="dd-label mb-3">On Deck</p>
      {data === null && <QueueLoadState loadError={loadError} retry={retry} />}
      {data && <CoachQueueList data={data} field />}

      <p className="dd-promise">
        Players only ever see their own swing as &ldquo;with coach&rdquo; — never a ranking.
        <br />
        Videos are face-anonymized before they ever reach the cloud.
      </p>
    </main>
  );
}
