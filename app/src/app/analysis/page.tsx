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

  useEffect(() => {
    if (!user) return;
    (async () => {
      const snap = await getDocs(
        query(collection(db, "sessions"), where("playerId", "==", user.uid)),
      );
      const analyzed = snap.docs
        .filter((d) => d.data().status === "analyzed")
        .sort((a, b) => b.data().createdAt - a.data().createdAt);
      if (analyzed.length > 0) router.replace(`/analysis/${analyzed[0].id}`);
      else setEmpty(true);
    })();
  }, [user, router]);

  return (
    <main className="mx-auto max-w-md p-6 pb-28 lg:max-w-5xl lg:px-10 lg:pt-12">
      <h1 className="mb-6 text-4xl font-bold tracking-tight lg:mb-10 lg:text-6xl">Analysis</h1>
      <section className="rounded-2xl bg-card p-6 text-sm text-muted-foreground">
        {!loading && !user ? (
          <>
            <Link href="/auth" className="text-primary underline">
              Sign in
            </Link>{" "}
            to see your swing analysis.
          </>
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
