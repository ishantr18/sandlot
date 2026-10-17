"use client";

// Analysis tab — jumps to your most recent analyzed swing, or explains how
// to get one.
import { collection, getDocs, query, where } from "firebase/firestore";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { db } from "@/lib/firebase";

export default function AnalysisIndex() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [empty, setEmpty] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0); // bump to retry the load

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const snap = await getDocs(
          query(collection(db, "sessions"), where("playerId", "==", user.uid)),
        );
        const analyzed = snap.docs
          .filter((d) => d.data().status === "analyzed")
          .sort((a, b) => b.data().createdAt - a.data().createdAt);
        if (analyzed.length > 0) router.replace(`/analysis/${analyzed[0].id}`);
        else setEmpty(true);
      } catch {
        setLoadError(true);
      }
    })();
  }, [user, router, reloadKey]);

  return (
    <main className="mx-auto max-w-md p-6 pb-28 desk:max-w-2xl wide:max-w-5xl wide:px-10 wide:pt-12">
      <h1 className="mb-6 text-4xl font-bold tracking-tight wide:mb-10 wide:text-6xl">Analysis</h1>
      <section className="rounded-2xl bg-card p-6 text-sm text-muted-foreground">
        {!loading && !user ? (
          <>
            <Link href="/auth" className="text-primary underline">
              Sign in
            </Link>{" "}
            to see your swing analysis.
          </>
        ) : loadError ? (
          <span className="text-destructive">
            Couldn&apos;t load your swings — check your connection and try again.{" "}
            <button
              onClick={() => {
                setLoadError(false);
                setReloadKey((k) => k + 1);
              }}
              className="text-primary underline"
            >
              Retry
            </button>
          </span>
        ) : empty ? (
          <>
            No analyzed swings yet —{" "}
            <Link href="/upload" className="text-primary underline">
              upload one
            </Link>{" "}
            and the AI will break it down here.
          </>
        ) : (
          "Loading your latest analysis…"
        )}
      </section>
    </main>
  );
}
