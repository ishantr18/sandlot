"use client";

// Drills — coach-assigned drills up top (real, from Firestore), library below.
import { collection, doc, getDocs, query, updateDoc, where } from "firebase/firestore";
import { Check, ChevronRight, Play, Video } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import DrillIcon from "@/components/DrillIcon";
import Notice from "@/components/Notice";
import { CATEGORY_LABEL, DRILLS, type DrillCategory, type DrillVideo } from "@/lib/drills";
import { db } from "@/lib/firebase";

// "Watch how" — demo videos from established hitting coaches (open YouTube)
function DrillVideos({ videos }: { videos?: DrillVideo[] }) {
  if (!videos?.length) return null;
  return (
    <div className="mt-3">
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Watch how</p>
      <ul className="space-y-1.5">
        {videos.map((v) => (
          <li key={v.url}>
            <a
              href={v.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-xl bg-secondary p-2.5 transition-colors hover:bg-secondary/70"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15">
                <Play className="h-3.5 w-3.5 text-primary" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{v.title}</span>
                <span className="block text-xs text-muted-foreground">{v.channel} · YouTube</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface AssignmentRow {
  id: string;
  drillId: string;
  mentorName?: string;
  createdAt: number;
  status?: string;
}

export default function DrillsPage() {
  const { user, profile } = useAuth();
  const [fetched, setFetched] = useState<AssignmentRow[] | null>(null);
  // Signed out → nothing assigned (derived, no extra state update needed)
  const assigned = user ? fetched : [];
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<DrillCategory | "all">("all");
  const categories = Object.keys(CATEGORY_LABEL) as DrillCategory[];
  const library = filter === "all" ? DRILLS : DRILLS.filter((d) => d.category === filter);
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
    <main className="mx-auto max-w-md p-6 pb-28 desk:max-w-2xl wide:max-w-5xl wide:px-10 wide:pt-12">
      <h1 className="mb-6 text-4xl font-bold tracking-tight wide:mb-10 wide:text-6xl">Drills</h1>
      <div className="wide:grid wide:grid-cols-2 wide:items-start wide:gap-8">
        {profile?.role !== "mentor" && profile?.role !== "guardian" && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
            Assigned to you
          </h2>
          {user && !fetched && loadError ? (
            <Notice
              tone="error"
              title="Couldn't load your drills"
              className="mb-6"
              actions={[
                {
                  label: "Try again",
                  onClick: () => {
                    setLoadError(false);
                    setReloadKey((k) => k + 1);
                  },
                },
              ]}
            >
              Check your connection — the library below still works offline.
            </Notice>
          ) : (
            (!assigned || assigned.length === 0) && (
              <Notice
                title="Nothing assigned yet"
                className="mb-6"
                actions={user ? [{ label: "Film a swing", href: "/upload" }] : [{ label: "See a sample swing", href: "/sample" }]}
              >
                Your AI findings and your coach both assign drills here.
              </Notice>
            )
          )}
          {assigned && assigned.length > 0 && (
            <section className="mb-6 rounded-2xl bg-card">
              {assigned.map((a, i) => {
                const drill = DRILLS.find((d) => d.id === a.drillId);
                return (
                  <div key={a.id} className={i > 0 ? "border-t border-border" : ""}>
                    <div className="flex items-center gap-3 p-4">
                      <DrillIcon category={drill?.category} />
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
                      {/* Effort counts toward the Growth tab */}
                      {a.status === "done" ? (
                        <span className="flex items-center gap-1 text-xs font-semibold text-primary">
                          <Check className="h-3.5 w-3.5" /> Done
                        </span>
                      ) : (
                        <button
                          onClick={async () => {
                            await updateDoc(doc(db, "assignments", a.id), { status: "done", doneAt: Date.now() }).catch(() => {});
                            setFetched((rows) => rows?.map((r) => (r.id === a.id ? { ...r, status: "done" } : r)) ?? rows);
                          }}
                          className="rounded-full border border-border px-3 py-1 text-xs"
                        >
                          Mark done
                        </button>
                      )}
                    </div>
                    {drill && (
                      <div className="px-4 pb-3">
                        <p className="text-xs text-muted-foreground">{drill.description}</p>
                        <DrillVideos videos={drill.videos} />
                      </div>
                    )}
                    {/* Close the loop: drill → new swing → the coach sees the change */}
                    <div className="px-4 pb-4">
                      <Link
                        href={`/upload?drill=${encodeURIComponent(a.drillId)}`}
                        className="inline-flex items-center gap-2 rounded-full bg-primary/15 px-3 py-1.5 text-xs font-semibold text-primary"
                      >
                        <Video className="h-3.5 w-3.5" /> Film it again
                      </Link>
                    </div>
                  </div>
                );
              })}
            </section>
          )}
        </div>
        )}
        <div>
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Library</h2>
          {/* Filter chips — narrow the library to one body part */}
          <div className="mb-3 flex flex-wrap gap-2">
            {(["all", ...categories] as const).map((c) => (
              <button
                key={c}
                onClick={() => setFilter(c)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  filter === c ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {c === "all" ? "All" : CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
          <section key={filter} className="dd-enter rounded-2xl bg-card">
            {library.map((d, i) => (
              <div key={d.id} className={i > 0 ? "border-t border-border" : ""}>
              <button
                onClick={() => setOpen(open === d.id ? null : d.id)}
                aria-expanded={open === d.id}
                className="block w-full text-left"
              >
                <div className="flex items-center gap-3 p-4">
                  <DrillIcon category={d.category} />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{d.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {CATEGORY_LABEL[d.category]} · {d.target}
                    </div>
                  </div>
                  <ChevronRight
                    className={`h-4 w-4 text-muted-foreground transition-transform ${open === d.id ? "rotate-90" : ""}`}
                  />
                </div>
              </button>
                {/* grid-rows 0fr → 1fr animates the open/close height */}
                <div
                  className={`grid transition-[grid-template-rows] duration-200 ease-out ${
                    open === d.id ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  }`}
                >
                  <div className="overflow-hidden px-4">
                    <p className="text-xs text-muted-foreground">{d.description}</p>
                    <DrillVideos videos={d.videos} />
                    <div className="pb-4" />
                  </div>
                </div>
              </div>
            ))}
          </section>
        </div>
      </div>
    </main>
  );
}
