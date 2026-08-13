"use client";

// Floating pill dock (Elevate-style): dark pill, active tab lifted in a
// lighter pill with the field-green icon.
import { Dumbbell, House, TrendingUp, Video } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", label: "Home", icon: House },
  { href: "/upload", label: "Upload", icon: Video },
  { href: "/drills", label: "Drills", icon: Dumbbell },
  { href: "/progress", label: "Progress", icon: TrendingUp },
];

export default function Nav() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-card/90 p-1.5 backdrop-blur">
      {tabs.map((t) => {
        const active = t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`flex items-center gap-1.5 rounded-full px-4 py-2.5 text-xs font-medium transition-colors ${
              active ? "bg-secondary text-foreground" : "text-muted-foreground"
            }`}
          >
            <Icon className={`h-4 w-4 ${active ? "text-primary" : ""}`} />
            {active && t.label}
          </Link>
        );
      })}
    </nav>
  );
}
