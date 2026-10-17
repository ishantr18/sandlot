"use client";

// A number that counts up from 0 when it first appears (≈700ms, ease-out).
// Reduced-motion users just see the number.
import { useEffect, useState } from "react";

export default function CountUp({
  value,
  prefix = "",
  duration = 700,
}: {
  value: number;
  prefix?: string;
  duration?: number;
}) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || value === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShown(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      setShown(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return (
    <>
      {prefix}
      {shown.toLocaleString()}
    </>
  );
}
