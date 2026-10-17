"use client";

// Floating pill dock — tabs depend on WHO you are.
// Player: full training loop. Coach: review work. Parent: the window.
import { signOut } from "firebase/auth";
import { ClipboardList, Dumbbell, House, LogOut, TrendingUp, Users, Video } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { auth } from "@/lib/firebase";

const TABS = {
  player: [
    { href: "/", label: "Home", icon: House },
    { href: "/upload", label: "Upload", icon: Video },
    { href: "/drills", label: "Drills", icon: Dumbbell },
    { href: "/progress", label: "Growth", icon: TrendingUp },
  ],
  mentor: [
    { href: "/", label: "Home", icon: House },
    { href: "/coach", label: "Review", icon: ClipboardList },
    { href: "/drills", label: "Drills", icon: Dumbbell },
  ],
  guardian: [
    { href: "/", label: "Home", icon: House },
    { href: "/family", label: "Family", icon: Users },
    { href: "/family/growth", label: "Athlete's Growth", icon: TrendingUp },
  ],
};

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile, loading } = useAuth();
  const tabs = TABS[profile?.role ?? "player"] ?? TABS.player;
  const navRef = useRef<HTMLElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);

  // The most specific matching tab wins (/family/growth isn't also "Family")
  const matches = (h: string) => (h === "/" ? pathname === "/" : pathname.startsWith(h));
  const activeHref = tabs.find(
    (t) => matches(t.href) && !tabs.some((o) => o.href.length > t.href.length && matches(o.href)),
  )?.href;

  // Slide the highlight under whichever tab is active (re-measured on resize,
  // since the active tab's label shows and hides by screen width)
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const measure = () => {
      const el = nav.querySelector<HTMLElement>('[data-active="true"]');
      setPill(el ? { left: el.offsetLeft, width: el.offsetWidth } : null);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(nav);
    return () => ro.disconnect();
  }, [activeHref, profile?.role, user, loading, pathname]);

  // No app chrome until we know who's here, nor on the signed-out landing / sample
  if (loading || (!user && (pathname === "/" || pathname.startsWith("/sample")))) return null;
  return (
    <nav
      ref={navRef}
      className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-card/90 p-2 backdrop-blur"
    >
      {pill && (
        <span
          aria-hidden="true"
          className="absolute top-2 bottom-2 rounded-full bg-secondary transition-all duration-200 ease-out"
          style={{ left: pill.left, width: pill.width }}
        />
      )}
      {tabs.map((t) => {
        const active = t.href === activeHref;
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            data-active={active}
            className={`relative flex items-center gap-2 rounded-full px-4 py-3 text-sm sm:px-6 font-medium transition-colors ${
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className={`h-5 w-5 ${active ? "text-primary" : ""}`} />
            <span className={active ? "" : "hidden sm:inline"}>{t.label}</span>
          </Link>
        );
      })}
      {/* Every role can sign out from anywhere — matters on shared family phones */}
      {user && (
        <button
          onClick={async () => {
            await signOut(auth);
            router.push("/");
          }}
          aria-label="Sign out"
          className="relative flex items-center gap-2 rounded-full px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:px-6"
        >
          <LogOut className="h-5 w-5" />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      )}
    </nav>
  );
}
