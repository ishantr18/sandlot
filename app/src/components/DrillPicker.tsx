"use client";

// Type-to-search drill picker for coaches (ARIA combobox). Matches name,
// body part and target anywhere, best matches first; picking assigns right
// away, clears the box and keeps focus so a coach can add another.
import { Check, Search } from "lucide-react";
import { useId, useRef, useState } from "react";
import DrillIcon from "@/components/DrillIcon";
import { CATEGORY_LABEL, DRILLS, type DrillDef } from "@/lib/drills";

// Lower score = better: name starts with it < name contains it < body part / target
function score(d: DrillDef, q: string): number | null {
  const name = d.name.toLowerCase();
  if (name.startsWith(q)) return 0;
  if (name.split(/[\s\-–/']+/).some((w) => w.startsWith(q))) return 1;
  if (name.includes(q)) return 2;
  const meta = `${CATEGORY_LABEL[d.category]} ${d.target}`.toLowerCase();
  if (meta.includes(q)) return 3;
  return null;
}

function search(text: string): DrillDef[] {
  const q = text.trim().toLowerCase();
  if (!q) return DRILLS;
  return DRILLS.map((d) => ({ d, s: score(d, q) }))
    .filter((x): x is { d: DrillDef; s: number } => x.s != null)
    .sort((a, b) => a.s - b.s || a.d.name.localeCompare(b.d.name))
    .map((x) => x.d);
}

export default function DrillPicker({
  onPick,
  assigned,
}: {
  onPick: (drillId: string) => void;
  assigned: Set<string>;
}) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const results = search(text);
  const optionId = (i: number) => `${listId}-opt-${i}`;

  function pick(d: DrillDef) {
    if (assigned.has(d.id)) return;
    onPick(d.id);
    setText("");
    setActive(0);
    inputRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && results[active]) pick(results[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-xl border border-input bg-secondary px-3 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/40">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && results[active] ? optionId(active) : undefined}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={(e) => {
            setOpen(true);
            // Lift the box near the top so the list (and a phone keyboard) has room
            const el = e.currentTarget;
            setTimeout(() => el.scrollIntoView({ block: "start", behavior: "smooth" }), 250);
          }}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          placeholder="Assign a drill — start typing (e.g. stride, hips, tee)"
          className="min-w-0 flex-1 bg-transparent py-3 text-sm focus:outline-none"
        />
      </div>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Drills"
          className="mt-1 max-h-80 overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-xl"
        >
          {results.length === 0 && (
            <li className="p-3 text-sm text-muted-foreground">No drills match “{text}”.</li>
          )}
          {results.map((d, i) => {
            const done = assigned.has(d.id);
            return (
              <li
                key={d.id}
                id={optionId(i)}
                role="option"
                aria-selected={i === active}
                aria-disabled={done}
                // mousedown (not click) so the input's blur doesn't close the list first
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(d);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-lg p-2 ${
                  i === active ? "bg-secondary" : ""
                } ${done ? "cursor-default opacity-50" : ""}`}
              >
                <DrillIcon category={d.category} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{d.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {CATEGORY_LABEL[d.category]} · {d.target}
                  </span>
                </span>
                {done && (
                  <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-primary">
                    <Check className="h-3.5 w-3.5" /> Assigned
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
