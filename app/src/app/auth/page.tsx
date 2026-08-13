"use client";

// Sign in / create account. Everyone starts as a "player" —
// mentor and guardian roles arrive in Phase 4.
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { auth, db } from "@/lib/firebase";

// Firebase error codes → human sentences
function friendly(code: string): string {
  if (code.includes("email-already-in-use")) return "That email already has an account — try signing in.";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found"))
    return "Email or password doesn't match an account.";
  if (code.includes("weak-password")) return "Password needs at least 6 characters.";
  if (code.includes("invalid-email")) return "That doesn't look like an email address.";
  return "Something went wrong — try again.";
}

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
        // Profile record in Firestore — roles, guardian links etc. hang off this
        await setDoc(doc(db, "users", cred.user.uid), {
          uid: cred.user.uid,
          displayName: name,
          role: "player",
          createdAt: Date.now(),
        });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      router.push("/upload");
    } catch (err) {
      setError(friendly((err as { code?: string }).code ?? ""));
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-md p-6 pb-24">
      <h1 className="mb-1 text-4xl font-bold tracking-tight">
        {mode === "signin" ? "Sign in" : "Create your account"}
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {mode === "signin" ? "Welcome back to Diamond Drive." : "Free, forever. That's the point."}
      </p>

      <form onSubmit={submit} className="space-y-3">
        {mode === "signup" && (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            required
            className="w-full rounded-2xl border-0 bg-card p-3"
          />
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
