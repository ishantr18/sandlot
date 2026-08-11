"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/upload", label: "Upload", icon: "📹" },
  { href: "/analysis", label: "Analysis", icon: "📐" },
  { href: "/drills", label: "Drills", icon: "🏋️" },
  { href: "/progress", label: "Progress", icon: "📈" },
];

export default function Nav() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 left-0 right-0 flex justify-around border-t bg-white py-2 dark:bg-zinc-900">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`flex flex-col items-center px-4 py-1 text-xs ${
            pathname.startsWith(t.href) ? "font-bold text-green-700" : "text-zinc-500"
          }`}
        >
          <span className="text-xl">{t.icon}</span>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
