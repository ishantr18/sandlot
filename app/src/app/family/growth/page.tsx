"use client";

// Athlete's Growth — a parent's view of their linked athlete's skill bars,
// effort and coach confirmations. Same panel the player sees.
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import Notice from "@/components/Notice";
import GrowthPanel from "@/components/GrowthPanel";
import { linksFor, type Link as FamilyLink } from "@/lib/family";

export default function AthleteGrowthPage() {
  const { user, profile, loading } = useAuth();
  const [links, setLinks] = useState<FamilyLink[] | null>(null);
  const [pick, setPick] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!user || profile?.role !== "guardian") return;
    linksFor("guardianId", user.uid).then(setLinks).catch(() => setError(true));
  }, [user, profile]);

  if (!loading && (!user || profile?.role !== "guardian")) {
    return (
      <main className="mx-auto max-w-md p-6 pb-28">
        <h1 className="mb-6 text-4xl font-bold tracking-tight">Athlete&apos;s Growth</h1>
        <p className="rounded-2xl bg-card p-6 text-sm text-muted-foreground">
          This page is for parent accounts.{" "}
          <Link href="/auth" className="text-primary underline">Sign in</Link> as a parent.
        </p>
      </main>
    );
  }

  const link = links?.[pick];
  return (
    <main className="mx-auto max-w-md p-6 pb-28 lg:max-w-3xl lg:px-10 lg:pt-12">
      <h1 className="mb-2 text-4xl font-bold tracking-tight lg:text-6xl">Athlete&apos;s Growth</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        How your athlete is improving — compared only to their own first swings.
      </p>
      {error && (
        <Notice tone="error" title="Couldn't load your athlete's growth">
          Check your connection, then reload the page.
        </Notice>
      )}
      {links === null && !error && <p className="text-sm text-muted-foreground">Loading…</p>}
      {links?.length === 0 && (
        <p className="rounded-2xl bg-card p-6 text-sm text-muted-foreground">
          No athlete linked yet.{" "}
          <Link href="/family" className="text-primary underline">Link one with a family code</Link>.
        </p>
      )}
      {links && links.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {links.map((l, i) => (
            <button
              key={l.id}
              onClick={() => setPick(i)}
              className={`rounded-full px-4 py-1.5 text-sm ${i === pick ? "bg-primary text-primary-foreground" : "bg-card"}`}
            >
              {l.playerName ?? "Athlete"}
            </button>
          ))}
        </div>
      )}
      {link && <GrowthPanel key={link.playerId} playerId={link.playerId} mode="parent" />}
    </main>
  );
}
