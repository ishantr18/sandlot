"use client";

// Filming guide — teaches users (kids!) to film clips the pose engine can
// actually analyze. Bad input = bad analysis, so this is quality control
// disguised as help. Expanded on first visit, collapsed after.
import { useEffect, useState } from "react";

const RULES = [
  {
    icon: "↔️",
    title: "Film from the SIDE",
    detail: "Stand where the pitcher would see your side, not your face or back.",
  },
  {
    icon: "🧍",
    title: "Whole body in the shot",
    detail: "Head to feet, with a little space around you. Cut-off feet = bad analysis.",
  },
  {
    icon: "📱",
    title: "Prop the phone, don't hold it",
    detail: "Lean it on a bag or bottle, sideways (landscape). A shaky camera confuses the AI.",
  },
  {
    icon: "☀️",
    title: "Light in front, not behind",
    detail: "If you look like a shadow on screen, the AI sees a shadow too.",
  },
  {
    icon: "⏱️",
    title: "One swing per clip",
    detail: "5–10 seconds is plenty. Short clips upload fast on any connection.",
  },
];

export default function FilmingGuide() {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    // Auto-collapse for returning users; stays one tap away
    if (localStorage.getItem("dd-seen-guide") === "1") setOpen(false);
    else localStorage.setItem("dd-seen-guide", "1");
  }, []);

  return (
    <section className="mb-4 rounded-lg border">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between p-3 text-sm font-semibold"
      >
        <span>🎬 How to film your swing</span>
        <span className="text-zinc-400">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <ul className="space-y-3 border-t p-3">
          {RULES.map((r) => (
            <li key={r.title} className="flex gap-3">
              <span className="text-xl">{r.icon}</span>
              <div>
                <div className="text-sm font-medium">{r.title}</div>
                <div className="text-xs text-zinc-500">{r.detail}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
