"use client";

// Sign in / create account — with role selection.
// Players own swings; coaches review them; parents watch over their kid.
// Parents link with a FAMILY CODE from the player's app (not an email), and
// coaches submit credentials the admin checks before they see any swing.
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { ClipboardList, Users, Video } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import BrandMark from "@/components/BrandMark";
import { CREDENTIALS, linkWithCode, submitCoachApplication } from "@/lib/family";
import { sendVerifyEmail } from "@/lib/verifyEmail";
import { auth, db } from "@/lib/firebase";

function friendly(code: string): string {
  if (code.includes("email-already-in-use")) return "That email already has an account — try signing in.";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found"))
    return "Email or password doesn't match an account.";
  if (code.includes("weak-password")) return "Password needs at least 6 characters.";
  if (code.includes("invalid-email")) return "That doesn't look like an email address.";
  if (code.includes("too-many-requests")) return "Too many tries — wait a minute and try again.";
  return "Something went wrong — try again.";
}

const ROLES = [
  { id: "player", label: "Player", icon: Video, blurb: "I'm here to train" },
  { id: "mentor", label: "Coach", icon: ClipboardList, blurb: "I review swings" },
  { id: "guardian", label: "Parent", icon: Users, blurb: "I watch over a player" },
] as const;

// Explicit text, placeholder and border colors — on the dark theme a bare
// field read as black-on-black (judges thought the password box was missing).
const FIELD =
  "w-full rounded-2xl border border-input bg-card p-3 text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40";

export default function AuthPage() {
  const router = useRouter();
  const { user, loading, refresh } = useAuth();
  // Already signed in on this device → straight into the app. (Not while this
  // page is creating/signing in an account — submit() navigates itself.)
  const submitting = useRef(false);
  useEffect(() => {
    if (!loading && user && !submitting.current) router.replace("/");
  }, [loading, user, router]);
  const [mode, setMode] = useState<"signin" | "signup" | "reset">("signin");
  const [role, setRole] = useState<"player" | "mentor" | "guardian">("player");

  // Arrive pre-set from the welcome screen (?mode=signup&role=mentor)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const m = p.get("mode");
    const r = p.get("role");
    // Reading the URL must wait until after hydration (the server has no
    // window), so a one-time setState here is intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (m === "signup" || m === "signin") setMode(m);
    if (r === "player" || r === "mentor" || r === "guardian") setRole(r);
  }, []);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [familyCode, setFamilyCode] = useState("");
  const [organization, setOrganization] = useState("");
  const [credential, setCredential] = useState<string>(CREDENTIALS[0]);
  const [credentialId, setCredentialId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    submitting.current = true;
    setBusy(true);
    setError("");
    setInfo("");
    try {
      if (mode === "reset") {
        // Firebase answers the same way whether or not the account exists, so
        // showing errors can't be used to probe for emails. Real problems
        // (typo'd address, too many tries) are shown.
        try {
          await sendPasswordResetEmail(auth, email.trim(), { url: `${window.location.origin}/auth` });
          setInfo(
            `Sent to ${email.trim()} — if it has an account. It comes from noreply@sandlot-cac-2026.firebaseapp.com and often lands in Spam or Promotions. It can take a few minutes.`,
          );
        } catch (err) {
          const code = (err as { code?: string }).code ?? "";
          if (code.includes("user-not-found"))
            setInfo(`Sent to ${email.trim()} — if it has an account. Check Spam too.`);
          else setError(friendly(code));
        }
        setBusy(false);
        return;
      }
      if (mode === "signup") {
        // Create the login, then the profile, then the role step. ANY later
        // failure deletes the login again — no orphans, ever.
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        try {
          await updateProfile(cred.user, { displayName: name });
          await setDoc(doc(db, "users", cred.user.uid), {
            uid: cred.user.uid,
            displayName: name,
            role,
            createdAt: Date.now(),
          });
          if (role === "guardian") {
            const res = await linkWithCode(cred.user.uid, name, familyCode);
            if (res !== "ok") {
              await cred.user.delete().catch(() => {});
              setError(
                res === "expired"
                  ? "That family code has expired — ask your player to make a new one (Home → Family code)."
                  : "That family code doesn't match. Check it on your player's Home screen (Family code) and try again.",
              );
              setBusy(false);
              return;
            }
          }
          if (role === "mentor") {
            await submitCoachApplication({
              uid: cred.user.uid,
              displayName: name,
              organization: organization.trim(),
              credential,
              credentialId: credentialId.trim(),
              note: note.trim(),
            });
          }
        } catch (err) {
          await cred.user.delete().catch(() => {});
          throw err;
        }
        // Prove the email is real. Until the link is clicked, the app shows
        // only the "check your email" screen and the database refuses swings.
        // A failed send shows on the next screen, which has Resend
        await sendVerifyEmail(cred.user).catch((e) => console.error("verification email failed", e));
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      await refresh();
      router.push("/");
    } catch (err) {
      setError(friendly((err as { code?: string }).code ?? ""));
      setBusy(false);
    }
  }

  const title =
    mode === "signin" ? "Sign in" : mode === "reset" ? "Reset password" : "Create your account";
  const subtitle =
    mode === "signin"
      ? "Welcome back to Diamond Drive."
      : mode === "reset"
        ? "We'll email you a link to choose a new password."
        : "Free, forever. That's the point.";

  return (
    <main className="mx-auto max-w-md p-6 pb-28">
      <div className="mb-8 flex items-center gap-3 pt-6">
        <BrandMark className="h-9 w-9" />
        <span className="text-sm font-semibold uppercase tracking-[0.3em]">Diamond Drive</span>
      </div>
      <h1 className="mb-1 text-4xl font-bold tracking-tight">{title}</h1>
      <p className="mb-6 text-sm text-muted-foreground">{subtitle}</p>

      <form onSubmit={submit} className="space-y-3">
        {mode === "signup" && (
          <>
            <div className="grid grid-cols-3 gap-2">
              {ROLES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRole(r.id)}
                  className={`rounded-2xl p-3 text-center text-xs transition-colors ${
                    role === r.id ? "bg-primary/15 ring-1 ring-primary" : "bg-card"
                  }`}
                >
                  <r.icon className="mx-auto mb-1 h-5 w-5 text-primary" />
                  <div className="text-sm font-semibold">{r.label}</div>
                  <div className="mt-1 text-muted-foreground">{r.blurb}</div>
                </button>
              ))}
            </div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              required
              className={FIELD}
            />
            {role === "guardian" && (
              <div>
                <input
                  value={familyCode}
                  onChange={(e) => setFamilyCode(e.target.value.toUpperCase())}
                  placeholder="Family code (6 letters/numbers)"
                  required
                  maxLength={8}
                  autoCapitalize="characters"
                  className={`${FIELD} font-mono tracking-widest`}
                />
                <p className="mt-1 px-1 text-xs text-muted-foreground">
                  Your player makes this on their Home screen → Family code. It
                  proves you have their OK, and it works once.
                </p>
              </div>
            )}
            {role === "mentor" && (
              <div className="space-y-3 rounded-2xl bg-card/50 p-3">
                <p className="text-xs text-muted-foreground">
                  Coaches are checked by a real person before they can see any
                  swing. Tell us how to verify you.
                </p>
                <input
                  value={organization}
                  onChange={(e) => setOrganization(e.target.value)}
                  placeholder="Team, league, or school"
                  required
                  className={FIELD}
                />
                <select
                  value={credential}
                  onChange={(e) => setCredential(e.target.value)}
                  className={FIELD}
                >
                  {CREDENTIALS.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <input
                  value={credentialId}
                  onChange={(e) => setCredentialId(e.target.value)}
                  placeholder="Certificate or member number"
                  required
                  className={FIELD}
                />
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Anything else that helps us verify you (optional)"
                  rows={2}
                  className={FIELD}
                />
              </div>
            )}
          </>
        )}
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          required
          className={FIELD}
        />
        {mode !== "reset" && (
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password (6+ characters)"
            required
            minLength={6}
            className={FIELD}
          />
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {info && <p className="text-sm text-primary">{info}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full bg-primary py-3 font-semibold text-primary-foreground disabled:opacity-40"
        >
          {busy
            ? "One sec…"
            : mode === "signin"
              ? "Sign in"
              : mode === "reset"
                ? "Email me a reset link"
                : role === "mentor"
                  ? "Apply as a coach"
                  : "Create account"}
        </button>
      </form>

      {mode === "signin" && (
        <button
          onClick={() => {
            setMode("reset");
            setError("");
            setInfo("");
          }}
          className="mt-4 w-full text-center text-sm text-muted-foreground"
        >
          Forgot password?
        </button>
      )}
      <button
        onClick={() => {
          setMode(mode === "signup" ? "signin" : mode === "reset" ? "signin" : "signup");
          setError("");
          setInfo("");
        }}
        className="mt-3 w-full text-center text-sm text-primary"
      >
        {mode === "signin" ? "New here? Create an account" : "Back to sign in"}
      </button>
      <div className="mt-8 space-y-3 border-t border-border pt-6 text-center text-sm">
        <Link href="/welcome" className="block text-muted-foreground underline">
          New to Diamond Drive? See how it works
        </Link>
        <Link href="/sample" className="block text-muted-foreground underline">
          Just looking? Try a sample swing — no account needed
        </Link>
      </div>
    </main>
  );
}
