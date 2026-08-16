// Drills — Elevate-style list: circular green icon, label, chevron, hairlines.
// Real drill library (mapped to swing flaws) lands Aug 24.
import { ChevronRight, Dumbbell } from "lucide-react";

const LIBRARY = [
  { name: "Hip fire tee drill", target: "Hip–shoulder separation" },
  { name: "Balance-beam swings", target: "Head movement" },
  { name: "Stride ladder", target: "Stride length" },
  { name: "Wall-bat tempo reps", target: "Swing tempo" },
];

export default function DrillsPage() {
  return (
    <main className="mx-auto max-w-md p-6 pb-28 lg:max-w-5xl lg:px-10 lg:pt-12">
      <h1 className="mb-6 text-4xl font-bold tracking-tight lg:mb-10 lg:text-6xl">Drills</h1>
      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-8">
      <div>

      <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Assigned to you</h2>
      <section className="mb-6 rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground">
        Nothing assigned yet — upload a swing and your drills appear here.
      </section>

      </div>
      <div>
      <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Library</h2>
      <section className="rounded-2xl bg-card">
        {LIBRARY.map((d, i) => (
          <div
            key={d.name}
            className={`flex items-center gap-3 p-4 ${i > 0 ? "border-t border-border" : ""}`}
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15">
              <Dumbbell className="h-4 w-4 text-primary" />
            </span>
            <div className="flex-1">
              <div className="text-sm font-medium">{d.name}</div>
              <div className="text-xs text-muted-foreground">{d.target}</div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        ))}
      </section>
      </div>
      </div>
    </main>
  );
}
