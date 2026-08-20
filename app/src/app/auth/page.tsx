"use client";

// Sign in / create account — with role selection.
// Players own swings; coaches review them; parents watch over their kid.
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { auth, db } from "@/lib/firebase";

function friendly(code: string): string {
  if (code.includes("email-already-in-use")) return "That email already has an account — try signing in.";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found"))
    return "Email or password doesn't match an account.";
  if (code.includes("weak-password")) return "Password needs at least 6 characters.";
  if (code.includes("invalid-email")) return "That doesn't look like an email address.";
  return "Something went wrong — try again.";
}

const ROLES = [
  { id: "player", label: "⚾ Player", blurb: "I'm here to train" },
  { id: "mentor", label: "🧢 Coach", blurb: "I review swings" },
  { id: "guardian", label: "👨‍👩‍👧 Parent", blurb: "I watch over a player" },
] as const;

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [role, setRole] = useState<"player" | "mentor" | "guardian">("player");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [childEmail, setChildEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "signup") {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(cred.user, { displayName: name });

        // Parents link to their player by the player's email
        let guardianOf: string[] = [];
        if (role === "guardian") {
          const snap = await getDocs(
            query(
              collection(db, "users"),
              where("email", "==", childEmail.trim().toLowerCase()),
              limit(1),
            ),
          );
          if (snap.empty) {
            setError(
              "No player account found with that email — have your player create their account first, then sign up.",
            );
            setBusy(false);
            return;
          }
          guardianOf = [snap.docs[0].id];
        }

        await setDoc(doc(db, "users", cred.user.uid), {
          uid: cred.user.uid,
          displayName: name,
          email: email.trim().toLowerCase(),
          role,
          ...(guardianOf.length ? { guardianOf } : {}),
          createdAt: Date.now(),
        });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      router.push("/");
    } catch (err) {
      setError(friendly((err as { code?: string }).code ?? ""));
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-md p-6 pb-28">
      <h1 className="mb-1 text-4xl font-bold tracking-tight">
        {mode === "signin" ? "Sign in" : "Create your account"}
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {mode === "signin" ? "Welcome back to Diamond Drive." : "Free, forever. That's the point."}
      </p>

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
              className="w-full rounded-2xl border-0 bg-card p-3"
            />
            {role === "guardian" && (
              <input
                type="email"
                value={childEmail}
                onChange={(e) => setChildEmail(e.target.value)}
                placeholder="Your player's account email"
                required
                className="w-full rounded-2xl border-0 bg-card p-3"
              />
            )}
          </>
        )}
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          required
          className="w-full rounded-2xl border-0 bg-card p-3"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password (6+ characters)"
          required
          minLength={6}
          className="w-full rounded-2xl border-0 bg-card p-3"
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full bg-primary py-3 font-semibold text-primary-foreground disabled:opacity-40"
        >
          {busy ? "One sec…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>

      <button
        onClick={() => {
          setMode(mode === "signin" ? "signup" : "signin");
          setError("");
        }}
        className="mt-4 w-full text-center text-sm text-primary"
      >
        {mode === "signin" ? "New here? Create an account" : "Have an account? Sign in"}
      </button>
    </main>
  );
}
