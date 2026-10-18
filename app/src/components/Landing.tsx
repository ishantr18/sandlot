"use client";

// Welcome screen — swing-trace hero, the three role cards, sample swing.
// Lives at /welcome; "/" shows it to signed-out visitors only when
// SIGNED_OUT_START (src/lib/startScreen.ts) is "landing".
import { ClipboardList, Lock, Users, Video } from "lucide-react";
import Link from "next/link";
import BrandMark from "@/components/BrandMark";
import SwingTrace from "@/components/SwingTrace";

export default function Landing() {
    const roles = [
    { role: "player", icon: Video, label: "Player", pitch: "Film your swing, get AI coaching — free" },
    { role: "mentor", icon: ClipboardList, label: "Coach", pitch: "Review swings, leave frame-by-frame tips" },
    { role: "guardian", icon: Users, label: "Parent", pitch: "See everything your player does — always" },
  ];
  return (
    <main className="dd-landing mx-auto flex min-h-screen max-w-md flex-col justify-center p-6 pb-16 lg:max-w-2xl">
      <div className="mb-2 flex items-center justify-center gap-3">
        <BrandMark className="h-9 w-9 lg:h-11 lg:w-11" />
        <span className="text-sm font-semibold uppercase tracking-[0.3em]">Diamond Drive</span>
      </div>
      {/* Hero: the product's magic — a swing, traced by the AI — in motion */}
      <div className="relative mx-auto -mb-2 w-full max-w-xs lg:max-w-sm">
        <SwingTrace className="w-full text-foreground" />
        <span className="absolute bottom-6 left-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
          AI tracking
        </span>
      </div>
      <h1 className="mb-3 text-center text-4xl font-bold tracking-tight lg:text-6xl">
        Pro-level coaching on <span className="text-primary">any phone.</span>
      </h1>
      <p className="mb-8 text-center text-muted-foreground lg:text-lg">
        For every kid — not just the ones who can afford private lessons.
      </p>

      <div className="space-y-3">
        {roles.map((r) => (
          <Link
            key={r.role}
            href={`/auth?mode=signup&role=${r.role}`}
            className="flex items-center gap-5 rounded-2xl bg-card p-5 transition-colors hover:bg-secondary lg:p-7"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/15">
              <r.icon className="h-6 w-6 text-primary" />
            </span>
            <span>
              <span className="block text-2xl font-bold lg:text-3xl">{r.label}</span>
              <span className="block text-sm text-muted-foreground lg:text-base">{r.pitch}</span>
            </span>
          </Link>
        ))}
      </div>

      <Link
        href="/sample"
        className="mt-4 block rounded-full border border-primary/50 py-3 text-center text-sm font-semibold text-primary"
      >
        No account? Try a sample swing →
      </Link>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/auth?mode=signin" className="font-semibold text-primary">
          Sign in
        </Link>
      </p>
      <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
        <Lock className="h-3.5 w-3.5" /> Faces are anonymized on your device before anything uploads.
      </p>
    </main>
  );
}
