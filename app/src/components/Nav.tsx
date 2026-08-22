"use client";

// Floating pill dock — tabs depend on WHO you are.
// Player: full training loop. Coach: review work. Parent: the window.
import { Dumbbell, House, TrendingUp, Users, Video, ClipboardList } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

const TABS = {
  player: [
    { href: "/", label: "Home", icon: House },
    { href: "/upload", label: "Upload", icon: Video },
    { href: "/drills", label: "Drills", icon: Dumbbell },
    { href: "/progress", label: "Progress", icon: TrendingUp },
  ],
  mentor: [
    { href: "/", label: "Home", icon: House },
    { href: "/coach", label: "Review", icon: ClipboardList },
    { href: "/drills", label: "Drills", icon: Dumbbell },
  ],
  guardian: [
    { href: "/", label: "Home", icon: House },
    { href: "/family", label: "Family", icon: Users },
  ],
};

export default function Nav() {
  const pathname = usePathname();
  const { profile } = useAuth();
  const tabs = TABS[profile?.role ?? "player"] ?? TABS.player;
  return (
    <nav className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-card/90 p-2 backdrop-blur">
      {tabs.map((t) => {
        const active = t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium transition-colors ${
              active ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className={`h-5 w-5 ${active ? "text-primary" : ""}`} />
            <span className={active ? "" : "hidden sm:inline"}>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
