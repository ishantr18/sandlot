"use client";

// Facebook-style reaction: one "Like" button. Tap = 👍 (tap again to undo).
// Long-press (or right-click) opens a small picker: 👍 ❤️ 🔥.
import { ThumbsUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export const REACTIONS = [
  { emoji: "👍", label: "Like" },
  { emoji: "❤️", label: "Love" },
  { emoji: "🔥", label: "Fire" },
];
export const reactionLabel = (emoji: string) => REACTIONS.find((r) => r.emoji === emoji)?.label ?? "";

const HOLD_MS = 450;

export default function ReactionButton({
  value,
  onChange,
}: {
  value?: string;
  onChange: (emoji: string | null) => void;
}) {
  const [picker, setPicker] = useState(false);
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const wrap = useRef<HTMLDivElement>(null);

  // Close the picker on any tap outside it
  useEffect(() => {
    if (!picker) return;
    const close = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setPicker(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [picker]);

  function startHold() {
    longPressed.current = false;
    hold.current = setTimeout(() => {
      longPressed.current = true;
      setPicker(true);
    }, HOLD_MS);
  }
  function cancelHold() {
    if (hold.current) clearTimeout(hold.current);
  }

  const label = value ? reactionLabel(value) || "Reacted" : "Like";

  return (
    <div ref={wrap} className="relative inline-block">
      {picker && (
        <div className="dd-reactpicker dd-enter absolute bottom-full left-0 z-10 mb-2 flex gap-1 rounded-full border border-border bg-card p-1.5 shadow-lg">
          {REACTIONS.map((r) => (
            <button
              key={r.emoji}
              onClick={() => {
                onChange(value === r.emoji ? null : r.emoji);
                setPicker(false);
              }}
              aria-label={r.label}
              title={r.label}
              className={`flex h-10 w-10 items-center justify-center rounded-full text-2xl transition-transform hover:scale-125 ${
                value === r.emoji ? "bg-primary/20" : ""
              }`}
            >
              {r.emoji}
            </button>
          ))}
        </div>
      )}
      <button
        onPointerDown={startHold}
        onPointerUp={cancelHold}
        onPointerLeave={cancelHold}
        onContextMenu={(e) => {
          e.preventDefault(); // right-click / long-press opens the picker, not the menu
          setPicker(true);
        }}
        onClick={() => {
          if (longPressed.current) return; // the long-press already opened the picker
          onChange(value ? null : "👍");
        }}
        aria-label={value ? `${label} — tap to remove, hold for more` : "Like — hold for more reactions"}
        style={{ WebkitTouchCallout: "none" }}
        data-on={!!value}
        className={`dd-react flex select-none items-center gap-1.5 rounded-full px-2 py-1 text-sm font-semibold transition-colors ${
          value ? "text-primary" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        {value ? <span className="text-base leading-none">{value}</span> : <ThumbsUp className="h-4 w-4" />}
        {label}
      </button>
    </div>
  );
}
