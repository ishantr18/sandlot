"use client";

// Shared bits for the Field-skin coach screens Reviewed and Players:
// the certified-coach gate and the review-history loader.
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import Notice from "@/components/Notice";
import { loadReviewHistory, type ReviewItem } from "@/lib/coachQueue";

// Only certified coaches get past this (same rule as the queue).
export function CoachGate({ title, children }: { title: string; children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();
  if (loading) return null;
  if (!user || profile?.role !== "mentor") {
    return (
      <main className="mx-auto max-w-md p-6 pb-28">
        <h1 className="dd-title mb-6 text-4xl font-bold tracking-tight">{title}</h1>
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
  if (!profile.verifiedMentor) {
    return (
      <main className="mx-auto max-w-md p-6 pb-28">
        <h1 className="dd-title mb-6 text-4xl font-bold tracking-tight">{title}</h1>
        <Notice title="Opens once you're approved" actions={[{ label: "See my application", href: "/" }]}>
          A real person checks every coach before they see any player videos.
        </Notice>
      </main>
    );
  }
  return <>{children}</>;
}

export function useReviewHistory() {
  const { user, profile } = useAuth();
  const [reviews, setReviews] = useState<ReviewItem[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0); // bump to retry the load

  useEffect(() => {
    if (!user || profile?.role !== "mentor" || !profile.verifiedMentor) return;
    (async () => {
      try {
        setReviews(await loadReviewHistory(user.uid));
      } catch {
        setLoadError(true);
      }
    })();
  }, [user, profile, reloadKey]);

  return {
    reviews,
    loadError,
    retry: () => {
      setLoadError(false);
      setReloadKey((k) => k + 1);
    },
  };
}

export function HistoryLoadState({ loadError, retry, what }: { loadError: boolean; retry: () => void; what: string }) {
  return loadError ? (
    <Notice tone="error" title={`Couldn't load your ${what}`} actions={[{ label: "Try again", onClick: retry }]}>
      Check your connection, then try again.
    </Notice>
  ) : (
    <p className="text-sm text-muted-foreground">Loading…</p>
  );
}

export const shortDate = (t: number) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
