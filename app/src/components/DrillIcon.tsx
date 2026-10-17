// One icon per body part, so the drill list scans at a glance
import { Anchor, Eye, Footprints, RotateCw, Scale, Timer, type LucideIcon } from "lucide-react";
import type { DrillCategory } from "@/lib/drills";

export const CATEGORY_ICON: Record<DrillCategory, LucideIcon> = {
  hips: RotateCw,
  head: Eye,
  frontLeg: Anchor,
  shoulders: Scale,
  tempo: Timer,
  stride: Footprints,
};

export default function DrillIcon({ category }: { category?: DrillCategory }) {
  const Icon = category ? CATEGORY_ICON[category] : RotateCw;
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15">
      <Icon className="h-4 w-4 text-primary" />
    </span>
  );
}
