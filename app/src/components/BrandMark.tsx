import { FIELD_LOGO } from "@/lib/switches";

// Diamond Drive mark — a baseball with its two red stitch seams.
// With the Field skin on and FIELD_LOGO = "homeplate", the home-plate mark
// shows instead (CSS swaps them).
export default function BrandMark({ className = "h-8 w-8" }: { className?: string }) {
  if (FIELD_LOGO === "baseball") return <BaseballMark className={className} />;
  return (
    <>
      <BaseballMark className={`dd-hide ${className}`} />
      <HomePlateMark className={`dd-only ${className}`} />
    </>
  );
}

// Field skin mark — home plate in field green (from the approved prototype).
// Follows FIELD_LOGO: shows the baseball unless it's set to "homeplate".
export function HomePlateMark({ className = "h-3 w-3" }: { className?: string }) {
  if (FIELD_LOGO === "baseball") return <BaseballMark className={className} />;
  return (
    <svg viewBox="0 0 13 13" className={className} aria-hidden="true">
      <path d="M3.2 2.6 H9.8 V6.9 L6.5 10.6 L3.2 6.9 Z" fill="#5CE38B" />
    </svg>
  );
}

function BaseballMark({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <circle cx="20" cy="20" r="17" fill="#f5edd8" />
      <circle cx="20" cy="20" r="17" fill="none" stroke="#d6cbb0" strokeWidth="1" />
      <g fill="none" stroke="#e2554d" strokeWidth="1.8" strokeLinecap="round">
        <path d="M10 7.5 Q17.5 20 10 32.5" />
        <path d="M30 7.5 Q22.5 20 30 32.5" />
        {/* stitches */}
        <path d="M11.2 11 l2.6 -1.2 M13 15 l2.8 -0.6 M13.6 19.5 h2.9 M13 24 l2.8 0.6 M11.2 28 l2.6 1.2" strokeWidth="1.3" />
        <path d="M28.8 11 l-2.6 -1.2 M27 15 l-2.8 -0.6 M26.4 19.5 h-2.9 M27 24 l-2.8 0.6 M28.8 28 l-2.6 1.2" strokeWidth="1.3" />
      </g>
    </svg>
  );
}
