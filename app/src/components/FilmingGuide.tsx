"use client";

// Filming guide — teaches users (kids!) to film clips the pose engine can
// actually analyze. Bad input = bad analysis, so this is quality control
// disguised as help. Expanded on first visit, collapsed after.
import {
  ChevronDown,
  Clapperboard,
  MoveHorizontal,
  PersonStanding,
  Smartphone,
  Sun,
  Timer,
} from "lucide-react";
import { useEffect, useState } from "react";
import { FILM_TIPS } from "@/lib/switches";

const RULES = [
  {
    icon: MoveHorizontal,
    title: "Film from the SIDE",
    detail: "Stand where the pitcher would see your side, not your face or back.",
  },
  {
    icon: PersonStanding,
    title: "Whole body in the shot",
    detail: "Head to feet, with a little space around you. Cut-off feet = bad analysis.",
  },
  {
    icon: Smartphone,
    title: "Prop the phone, don't hold it",
    detail: "Lean it on a bag or bottle, sideways (landscape). A shaky camera confuses the AI.",
  },
  {
    icon: Sun,
    title: "Light in front, not behind",
    detail: "If you look like a shadow on screen, the AI sees a shadow too.",
  },
  {
    icon: Timer,
    title: "One swing per clip",
    detail: "5–10 seconds is plenty. Short clips upload fast on any connection.",
  },
];

// Short version (switch: FILM_TIPS) — three tips, a few words each
const SHORT_RULES = [
  { icon: MoveHorizontal, title: "Side on", detail: "camera sees your profile" },
  { icon: PersonStanding, title: "Head to toe", detail: "feet stay in the shot" },
  { icon: Timer, title: "One swing", detail: "5–10 second clip" },
];

export default function FilmingGuide() {
  const rules = FILM_TIPS === "short" ? SHORT_RULES : RULES;
  const [open, setOpen] = useState(true);

  useEffect(() => {
    // Auto-collapse for returning users; stays one tap away.
    // localStorage only exists after hydration, so this setState is intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (localStorage.getItem("dd-seen-guide") === "1") setOpen(false);
    else localStorage.setItem("dd-seen-guide", "1");
  }, []);

  return (
    <section className="dd-guide mb-4 rounded-2xl bg-card">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between p-3 text-sm font-semibold"
      >
        <span className="flex items-center gap-2">
          <Clapperboard className="h-4 w-4 text-primary" /> How to film your swing
        </span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul className={`dd-tips space-y-3 border-t border-border p-3 ${rules.length === 3 ? "dd-tips-3" : ""}`}>
          {rules.map((r) => (
            <li key={r.title} className="dd-tip flex gap-3">
              <span className="dd-tipdot flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15">
                <r.icon className="h-4 w-4 text-primary" />
              </span>
              <div>
                <div className="text-sm font-medium">{r.title}</div>
                <div className="text-xs text-muted-foreground">{r.detail}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
