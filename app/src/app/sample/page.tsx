"use client";

// Sample swing — the whole product with no account: an AI-traced swing,
// the five skill bars, findings with matched drills, and a coach tip.
// For judges and curious families who can't (or won't yet) sign up.
// The measurements are made up, but the skill bars come from the REAL
// scoring code (skillLevels), so the page shows exactly what the app does.
import { BadgeCheck, ChevronLeft, ChevronRight, Lock, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import SwingTrace from "@/components/SwingTrace";
import { DRILLS } from "@/lib/drills";
import { SKILL_INFO, SKILLS, skillLevels, type Skill } from "@/lib/growth";
import type { Finding, SwingMetrics } from "@/lib/swingMetrics";

const SAMPLE_METRICS: SwingMetrics = {
  sequenceGapMs: 30,
  hipTurnDeg: 52,
  hipShoulderSepDeg: 24,
  tempoSec: 0.19,
  headDriftPct: 9,
  stridePct: 18,
  kneeBraceDeg: 162,
  shoulderTiltDeg: 12,
  peakHandSpeed: 3.1,
  swingStart: 0.8,
  footPlant: 1.05,
  swingPeak: 0.99,
  trackingQuality: 0.91,
  viewRatio: 0.14,
  coverage: "full",
};

const SAMPLE_FINDINGS: Finding[] = [
  {
    metric: "hipTurnDeg",
    severity: "good",
    message: "Your hips lead the swing — they open before your shoulders. That's where bat speed comes from.",
    drillIds: [],
  },
  {
    metric: "headDriftPct",
    severity: "minor",
    message:
      "Your head slides forward after your front foot lands (about 9% of your height). A quieter head means you see the ball longer.",
    drillIds: ["balance-beam", "no-stride"],
  },
  {
    metric: "kneeBraceDeg",
    severity: "minor",
    message: "Your front knee is still a little soft at contact. Firm it up so your hips have a wall to turn against.",
    drillIds: ["firm-front-side"],
  },
];

const SEVERITY = {
  good: "border-l-4 border-primary",
  minor: "border-l-4 border-amber-500",
  major: "border-l-4 border-destructive",
};

export default function SamplePage() {
  const { user } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  // Bars start empty and grow in once the page is on screen
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const levels = skillLevels(SAMPLE_METRICS);
  const measured = SKILLS.filter((k) => levels[k] != null) as Skill[];
  const focus = measured.reduce((lo, k) => (levels[k]! < levels[lo]! ? k : lo), measured[0]);
  const focusDrill = DRILLS.find((d) => d.id === "balance-beam")!;

  return (
    <main className="mx-auto max-w-md p-6 pb-16 desk:max-w-2xl wide:max-w-5xl wide:px-10 wide:pt-12">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/" className="rounded-full bg-card p-2" aria-label="Back">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="flex-1 text-4xl font-bold tracking-tight wide:text-6xl">Sample swing</h1>
        <span className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-400">
          Sample
        </span>
      </div>
      <p className="mb-6 text-sm text-muted-foreground">
        This is what a player sees after filming one swing. No account, no real player — the numbers
        are illustrative, but the scoring is the app&apos;s real code.
      </p>

      <div className="wide:grid wide:grid-cols-2 wide:items-start wide:gap-8">
        <div>
          {/* The swing, traced */}
          <section className="relative mb-4 overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-[#131c36] via-[#1b2a4a] to-[#0a1f0e]">
            <SwingTrace className="mx-auto w-full max-w-sm text-foreground" />
            <span className="absolute top-3 right-3 flex items-center gap-1 rounded-full border border-primary/50 bg-black/40 px-2 py-1 text-[10px] font-bold uppercase text-primary">
              <Lock className="h-3 w-3" /> Face anonymized
            </span>
            <span className="absolute bottom-3 left-3 rounded-full bg-primary px-2 py-1 text-[10px] font-bold uppercase text-primary-foreground">
              AI tracking
            </span>
            <span className="absolute right-3 bottom-3 rounded-full bg-black/50 px-2 py-1 text-[10px] text-foreground">
              33 body points per frame
            </span>
          </section>

          {/* Five plain-English skills */}
          <section className="mb-4 rounded-2xl bg-card p-4">
            <h2 className="text-sm font-semibold">Skills from this swing</h2>
            <p className="mb-3 text-xs text-muted-foreground">
              Real players are only ever compared to their own first swings.
            </p>
            <div className="space-y-3">
              {measured.map((k) => {
                const v = Math.round(levels[k]!);
                return (
                  <div key={k} className="flex items-center gap-3">
                    <span className="w-20 text-sm font-medium">{SKILL_INFO[k].name}</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-secondary">
                      <div
                        className={`dd-fill h-full rounded-full ${k === focus ? "bg-amber-500" : "bg-primary"}`}
                        style={{ width: mounted ? `${v}%` : "2%" }}
                      />
                    </div>
                    <span className="w-9 text-right font-mono text-sm font-semibold">{v}%</span>
                    {k === focus && (
                      <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[9px] font-extrabold text-black">
                        FOCUS
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <div>
          {/* The one thing to do next */}
          <section className="mb-4 rounded-2xl bg-primary/10 p-4 ring-1 ring-primary/50">
            <p className="flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-wider text-primary">
              <Sparkles className="h-3.5 w-3.5" /> Work on this next
            </p>
            <p className="mt-1 text-lg font-semibold">
              Your {SKILL_INFO[focus].name.toLowerCase()} drifts after your foot lands. One drill fixes it.
            </p>
            <button
              onClick={() => setOpen(open === "focus" ? null : "focus")}
              className="mt-3 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
            >
              {focusDrill.name} — {open === "focus" ? "hide" : "view drill"}
            </button>
            {open === "focus" && <p className="dd-enter mt-3 text-sm text-muted-foreground">{focusDrill.description}</p>}
          </section>

          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">AI coaching</h2>
          <div className="mb-4 space-y-2">
            {SAMPLE_FINDINGS.map((f) => (
              <section key={f.metric} className={`rounded-2xl bg-card p-4 ${SEVERITY[f.severity]}`}>
                <p className="text-sm">{f.message}</p>
                {f.drillIds.map((id) => {
                  const d = DRILLS.find((x) => x.id === id)!;
                  const key = `${f.metric}-${id}`;
                  return (
                    <div key={id}>
                      <button
                        onClick={() => setOpen(open === key ? null : key)}
                        className="mt-2 flex items-center gap-1 text-xs font-semibold text-primary"
                      >
                        → Drill: {d.name}
                        <ChevronRight className={`h-3.5 w-3.5 transition-transform ${open === key ? "rotate-90" : ""}`} />
                      </button>
                      {open === key && <p className="dd-enter mt-1 text-xs text-muted-foreground">{d.description}</p>}
                    </div>
                  );
                })}
              </section>
            ))}
          </div>

          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Coach comments</h2>
          <section className="mb-6 rounded-2xl bg-card p-4">
            <span className="font-mono text-xs text-primary">1.0s</span>{" "}
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              Sample coach <BadgeCheck className="h-3.5 w-3.5 text-primary" aria-label="Verified coach" /> · High school varsity
            </span>
            <p className="mt-1 text-sm">
              &quot;See how your head keeps moving after your front foot lands? Finish tall and freeze for
              two seconds on the balance-beam drill, then film another one.&quot;
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Real coaches are verified volunteers. Players stay anonymous to them; parents see every word.
            </p>
          </section>

          <Link
            href={user ? "/upload" : "/auth?mode=signup&role=player"}
            className="block rounded-full bg-primary py-3 text-center font-semibold text-primary-foreground"
          >
            {user ? "Film your own swing →" : "Film your own — it's free →"}
          </Link>
        </div>
      </div>
    </main>
  );
}
