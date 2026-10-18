"use client";

// Floating pill dock — tabs depend on WHO you are.
// Player: full training loop. Coach: review work. Parent: the window.
import { signOut } from "firebase/auth";
import { ClipboardList, Dumbbell, House, LogOut, TrendingUp, Users, Video } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { HomePlateMark } from "@/components/BrandMark";
import { auth } from "@/lib/firebase";
import { fieldSkinOn } from "@/lib/skin";

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

// Field skin tab bars (from the approved prototype) — same pages, new labels/order.
// Roles without an entry keep the classic dock.
type FieldTab = { href: string; label: string; icon?: React.ComponentType<{ className?: string }>; rec?: boolean };
const FIELD_TABS: Partial<Record<keyof typeof TABS, FieldTab[]>> = {
  // player: prototype order — Record is the camera tab (gradient pill when on)
  player: [
    { href: "/", label: "Home", icon: FieldHomeIcon },
    { href: "/drills", label: "Drills", icon: FieldDrillsIcon },
    { href: "/upload", label: "Record", icon: FieldCamIcon, rec: true },
    { href: "/progress", label: "Growth", icon: FieldGrowthIcon },
  ],
  guardian: [
    { href: "/", label: "Home" },
    { href: "/family", label: "My Kids" },
    { href: "/family/growth", label: "Progress" },
  ],
};

// Field skin top bar: home-plate mark + DIAMOND DRIVE, and Sign out
// (sign-out moves here from the dock so it's still on every screen)
export function FieldTopBar() {
  const router = useRouter();
  const { user, profile, loading } = useAuth();
  if (loading || !user || !fieldSkinOn(profile?.role)) return null;
  return (
    <header className="dd-topbar">
      <span className="dd-brand">
        <HomePlateMark className="h-3 w-3" />
        DIAMOND DRIVE
      </span>
      <button
        className="dd-signout"
        onClick={async () => {
          await signOut(auth);
          router.push("/");
        }}
      >
        Sign out
      </button>
    </header>
  );
}

// Field tab icons — drawn like the prototype's tab bar
function FieldHomeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M3 10.5L12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
    </svg>
  );
}
function FieldDrillsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className} aria-hidden="true">
      <circle cx="7" cy="7" r="3" />
      <circle cx="17" cy="17" r="3" />
      <path d="M9.5 9.5l5 5" />
    </svg>
  );
}
export function FieldCamIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M23 7l-7 5 7 5V7z" />
      <rect x="1" y="5" width="15" height="14" rx="2" />
    </svg>
  );
}
function FieldGrowthIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </svg>
  );
}

function FieldNav({ tabs, pathname }: { tabs: FieldTab[]; pathname: string }) {
  const matches = (h: string) => (h === "/" ? pathname === "/" : pathname.startsWith(h));
  const activeHref = tabs.find(
    (t) => matches(t.href) && !tabs.some((o) => o.href.length > t.href.length && matches(o.href)),
  )?.href;
  return (
    <nav className={`dd-tabbar ${tabs.some((t) => t.icon) ? "" : "dd-tabbar-text"}`}>
      {tabs.map((t) => {
        const Icon = t.icon;
        return (
          <Link key={t.href} href={t.href} className={t.rec ? "dd-rec" : undefined} data-on={t.href === activeHref} aria-current={t.href === activeHref ? "page" : undefined}>
            {Icon && <Icon className="h-[17px] w-[17px]" />}
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

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

  // App tabs are for signed-in users only (signed-out visitors start on sign-in)
  if (loading || !user) return null;
  const fieldTabs = fieldSkinOn(profile?.role) ? FIELD_TABS[profile!.role] : undefined;
  if (fieldTabs) return <FieldNav tabs={fieldTabs} pathname={pathname} />;
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
