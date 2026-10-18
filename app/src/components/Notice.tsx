// Designed empty + error states — an icon, a plain-English line, and a way
// forward. Replaces bare "Nothing yet." and red error text.
import { Inbox, TriangleAlert } from "lucide-react";
import Link from "next/link";

type Action = { label: string; onClick?: () => void; href?: string };

function ActionButton({ a, primary }: { a: Action; primary: boolean }) {
  const cls = primary
    ? "rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
    : "rounded-full border border-border px-4 py-2 text-xs font-semibold";
  return a.href ? (
    <Link href={a.href} className={cls}>
      {a.label}
    </Link>
  ) : (
    <button onClick={a.onClick} className={cls}>
      {a.label}
    </button>
  );
}

export default function Notice({
  tone = "empty",
  title,
  children,
  actions = [],
  className = "",
}: {
  tone?: "empty" | "error";
  title: string;
  children?: React.ReactNode;
  actions?: Action[];
  className?: string;
}) {
  const error = tone === "error";
  const Icon = error ? TriangleAlert : Inbox;
  return (
    <section
      role={error ? "alert" : undefined}
      className={`dd-notice flex gap-3 rounded-2xl p-4 ${
        error ? "bg-destructive/10 ring-1 ring-destructive/40" : "bg-card"
      } ${className}`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
          error ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary"
        }`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="flex-1 text-sm">
        <p className="font-semibold">{title}</p>
        {children && <div className="mt-0.5 text-muted-foreground">{children}</div>}
        {actions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {actions.map((a, i) => (
              <ActionButton key={a.label} a={a} primary={i === 0} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
