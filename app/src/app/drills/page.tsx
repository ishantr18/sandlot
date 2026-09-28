"use client";

// Drills — coach-assigned drills up top (real, from Firestore), library below.
import { collection, getDocs, query, where } from "firebase/firestore";
import { ChevronRight, Dumbbell } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { DRILLS } from "@/lib/drills";
import { db } from "@/lib/firebase";

interface AssignmentRow {
  id: string;
  drillId: string;
  mentorName?: string;
  createdAt: number;
}

export default function DrillsPage() {
  const { user, profile } = useAuth();
  const [fetched, setFetched] = useState<AssignmentRow[] | null>(null);
  // Signed out → nothing assigned (derived, no extra state update needed)
  const assigned = user ? fetched : [];
  const [open, setOpen] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0); // bump to retry the load

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const snap = await getDocs(
          query(collection(db, "assignments"), where("playerId", "==", user.uid)),
        );
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AssignmentRow);
        rows.sort((a, b) => b.createdAt - a.createdAt);
        setFetched(rows);
      } catch {
        setLoadError(true);
      }
    })();
  }, [user, reloadKey]);

  return (
    <main className="mx-auto max-w-md p-6 pb-28 lg:max-w-5xl lg:px-10 lg:pt-12">
      <h1 className="mb-6 text-4xl font-bold tracking-tight lg:mb-10 lg:text-6xl">Drills</h1>
      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-8">
        {profile?.role !== "mentor" && profile?.role !== "guardian" && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
            Assigned to you
          </h2>
          {user && !fetched && loadError ? (
            <section className="mb-6 rounded-2xl bg-card p-6 text-center text-sm text-destructive">
              Couldn&apos;t load your drills — check your connection and try again.{" "}
              <button
                onClick={() => {
                  setLoadError(false);
                  setReloadKey((k) => k + 1);
                }}
                className="text-primary underline"
              >
                Retry
              </button>
            </section>
          ) : (
            (!assigned || assigned.length === 0) && (
              <section className="mb-6 rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground">
                Nothing assigned yet — your AI findings and your coach both assign
                drills here.
              </section>
            )
          )}
          {assigned && assigned.length > 0 && (
            <section className="mb-6 rounded-2xl bg-card">
              {assigned.map((a, i) => {
                const drill = DRILLS.find((d) => d.id === a.drillId);
                return (
                  <div key={a.id} className={i > 0 ? "border-t border-border" : ""}>
                    <div className="flex items-center gap-3 p-4">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15">
                        <Dumbbell className="h-4 w-4 text-primary" />
                      </span>
                      <div className="flex-1">
                        <div className="text-sm font-medium">
                          {drill?.name ?? a.drillId}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          from {a.mentorName ?? "your coach"} ·{" "}
                          {new Date(a.createdAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })}
                        </div>
                      </div>
                    </div>
                    {drill && (
                      <p className="px-4 pb-4 text-xs text-muted-foreground">
                        {drill.description}
                      </p>
                    )}
                  </div>
                );
              })}
            </section>
          )}
        </div>
        )}
        <div>
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Library</h2>
          <section className="rounded-2xl bg-card">
            {DRILLS.map((d, i) => (
              <button
                key={d.id}
                onClick={() => setOpen(open === d.id ? null : d.id)}
                className={`block w-full text-left ${i > 0 ? "border-t border-border" : ""}`}
              >
                <div className="flex items-center gap-3 p-4">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15">
                    <Dumbbell className="h-4 w-4 text-primary" />
                  </span>
                  <div className="flex-1">
                    <div className="text-sm font-medium">{d.name}</div>
                    <div className="text-xs text-muted-foreground">{d.target}</div>
                  </div>
                  <ChevronRight
                    className={`h-4 w-4 text-muted-foreground transition-transform ${open === d.id ? "rotate-90" : ""}`}
                  />
                </div>
                {open === d.id && (
                  <p className="px-4 pb-4 text-xs text-muted-foreground">{d.description}</p>
                )}
              </button>
            ))}
          </section>
        </div>
      </div>
    </main>
  );
}
