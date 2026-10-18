"use client";

// Email verification gate. A new account gets a "verify your email" link at
// sign-up; until it's clicked, the app shows only this screen. The database
// rules ALSO require a verified email (swings, comments, family codes), so
// this screen is the friendly half — not the lock.
import { signOut } from "firebase/auth";
import { Play } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { sendVerifyEmail } from "@/lib/verifyEmail";
import { auth } from "@/lib/firebase";

export default function VerifyEmailGate({ children }: { children: React.ReactNode }) {
  const { user, refresh } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  // The sample swing needs no account, so it's never behind the gate
  if (!user || user.emailVerified || pathname.startsWith("/auth") || pathname.startsWith("/sample"))
    return <>{children}</>;

  return (
    <main className="mx-auto max-w-md p-6 pb-28">
      <h1 className="dd-title mb-1 text-4xl font-bold tracking-tight">Check your email</h1>
      <p className="dd-sub mb-6 text-sm text-muted-foreground">
        Verify <span className="font-semibold text-foreground">{user.email}</span> to start. Click
        the link we emailed you (no email? tap <span className="font-semibold">Resend</span>), then
        come back and tap the green button.
      </p>
      <div className="dd-comment space-y-3 rounded-2xl bg-card p-4 text-sm">
        <p className="text-muted-foreground">
          It comes from <span className="font-mono text-xs">noreply@sandlot-cac-2026.firebaseapp.com</span>.
          Not there? Check Spam or Promotions.
        </p>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setMsg("");
            await user.reload();
            await user.getIdToken(true); // refresh the token so the database sees "verified"
            if (auth.currentUser?.emailVerified) {
              await refresh();
              router.refresh();
              window.location.reload();
            } else setMsg("Not verified yet — click the link in the email first.");
            setBusy(false);
          }}
          className="dd-cta w-full rounded-full bg-primary py-3 font-semibold text-primary-foreground disabled:opacity-40"
        >
          I&apos;ve clicked the link
        </button>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await sendVerifyEmail(user);
              setMsg("Sent a new link. Only the newest link works.");
            } catch (e) {
              setMsg(
                (e as { code?: string }).code?.includes("too-many-requests")
                  ? "Too many emails — wait a few minutes, then try again."
                  : "Couldn't send — try again.",
              );
            }
            setBusy(false);
          }}
          className="w-full rounded-full border border-border py-2"
        >
          Resend the email
        </button>
        {msg && <p className="text-primary">{msg}</p>}
      </div>
      {/* Not a dead end: the product is one tap away while the email is on its way */}
      <Link
        href="/sample"
        className="dd-callout mt-4 flex items-center gap-3 rounded-2xl bg-primary/15 p-4 text-sm ring-1 ring-primary"
      >
        <Play className="h-5 w-5 text-primary" />
        <span className="flex-1">
          <span className="block font-semibold text-primary">While you wait: try a sample swing</span>
          <span className="text-muted-foreground">See a full AI breakdown and a coach tip — no setup.</span>
        </span>
        <span className="text-primary">→</span>
      </Link>
      <button
        onClick={async () => {
          await signOut(auth);
          router.push("/");
        }}
        className="mt-4 w-full text-center text-sm text-muted-foreground"
      >
        Wrong email? Sign out
      </button>
    </main>
  );
}
