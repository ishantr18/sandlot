"use client";

// Family view — a guardian's read-only window onto their player's activity.
// Every session, every coach comment, every assignment: nothing hidden.
// This transparency is what makes the mentor layer safe.
import { collection, getDocs, query, where } from "firebase/firestore";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { db } from "@/lib/firebase";

interface Row {
  id: string;
  createdAt: number;
  status: string;
}

export default function FamilyPage() {
  const { user, profile, loading } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    const child = profile?.guardianOf?.[0];
    if (!user || profile?.role !== "guardian" || !child) return;
    (async () => {
      const snap = await getDocs(
        query(collection(db, "sessions"), where("playerId", "==", child)),
      );
      const r = snap.docs.map((d) => ({
        id: d.id,
        createdAt: d.data().createdAt as number,
        status: d.data().status as string,
      }));
      r.sort((a, b) => b.createdAt - a.createdAt);
      setRows(r);
    })();
  }, [user, profile]);

  if (!loading && (!user || profile?.role !== "guardian")) {
    return (
      <main className="mx-auto max-w-md p-6 pb-28">
        <h1 className="mb-6 text-4xl font-bold tracking-tight">Family</h1>
        <p className="rounded-2xl bg-card p-6 text-sm text-muted-foreground">
          This page is for parent accounts.{" "}
          <Link href="/auth" className="text-primary underline">
            Sign in
          </Link>{" "}
          as a parent (linked to your player&apos;s email) to see their activity.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md p-6 pb-28 lg:max-w-5xl lg:px-10 lg:pt-12">
      <h1 className="mb-2 text-4xl font-bold tracking-tight lg:text-6xl">Family</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Everything your player does here is visible to you — every swing, every
        coach comment, every assigned drill. Videos are face-anonymized on the
        player&apos;s own device before upload.
      </p>

      {rows === null && <p className="text-sm text-muted-foreground">Loading…</p>}
      {rows?.length === 0 && (
        <p className="rounded-2xl bg-card p-6 text-sm text-muted-foreground">
          No activity yet.
        </p>
      )}

      {rows && rows.length > 0 && (
        <section className="rounded-2xl bg-card lg:max-w-2xl">
          {rows.map((r, i) => (
            <Link
              key={r.id}
              href={`/analysis/${r.id}`}
              className={`flex items-center gap-3 p-4 ${i > 0 ? "border-t border-border" : ""}`}
            >
              <div className="flex-1">
                <div className="text-sm font-medium">
                  {new Date(r.createdAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}{" "}
                  ·{" "}
                  {new Date(r.createdAt).toLocaleTimeString(undefined, {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </div>
                <div className="text-xs text-muted-foreground">{r.status}</div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          ))}
        </section>
      )}
    </main>
  );
}
