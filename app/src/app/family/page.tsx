"use client";

// Family view — a parent's read-only window onto their player's activity.
// Every session, every coach comment, every assignment: nothing hidden.
// This transparency is what makes the mentor layer safe.
// Linking needs a family code from the player's own Home screen.
import { collection, getDocs, query, where } from "firebase/firestore";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import Notice from "@/components/Notice";
import { linksFor, linkWithCode, type Link as FamilyLink } from "@/lib/family";
import { db } from "@/lib/firebase";

interface Row {
  id: string;
  playerId: string;
  createdAt: number;
  status: string;
}

function LinkForm({ onLinked }: { onLinked: () => void }) {
  const { user } = useAuth();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!user) return;
        setBusy(true);
        setMsg("");
        const res = await linkWithCode(user.uid, user.displayName ?? "Parent", code).catch(
          () => "bad-code" as const,
        );
        setBusy(false);
        if (res === "ok") {
          setCode("");
          onLinked();
        } else
          setMsg(
            res === "expired"
              ? "That code has expired — ask your player to make a new one."
              : "That code doesn't match. Check it on your player's Home screen.",
          );
      }}
      className="rounded-2xl bg-card p-4 lg:max-w-md"
    >
      <p className="mb-2 text-sm font-semibold">Link a player</p>
      <p className="mb-3 text-xs text-muted-foreground">
        On your player&apos;s phone: Home → Family code. Type it here.
      </p>
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="ABC234"
          required
          maxLength={8}
          className="flex-1 rounded-xl border-0 bg-secondary p-2 font-mono tracking-widest"
        />
        <button
          disabled={busy}
          className="rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-40"
        >
          {busy ? "…" : "Link"}
        </button>
      </div>
      {msg && <p className="mt-2 text-xs text-destructive">{msg}</p>}
    </form>
  );
}

export default function FamilyPage() {
  const { user, profile, loading, refresh } = useAuth();
  const [links, setLinks] = useState<FamilyLink[] | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0); // bump to retry the load

  useEffect(() => {
    if (!user || profile?.role !== "guardian") return;
    (async () => {
      try {
        const ls = await linksFor("guardianId", user.uid);
        const snaps = await Promise.all(
          ls.map((l) =>
            getDocs(query(collection(db, "sessions"), where("playerId", "==", l.playerId))),
          ),
        );
        const r = snaps.flatMap((snap) =>
          snap.docs.map((d) => ({
            id: d.id,
            playerId: d.data().playerId as string,
            createdAt: d.data().createdAt as number,
            status: d.data().status as string,
          })),
        );
        r.sort((a, b) => b.createdAt - a.createdAt);
        setLinks(ls);
        setRows(r);
      } catch {
        setLoadError(true);
      }
    })();
  }, [user, profile, reloadKey]);

  if (!loading && (!user || profile?.role !== "guardian")) {
    return (
      <main className="mx-auto max-w-md p-6 pb-28">
        <h1 className="mb-6 text-4xl font-bold tracking-tight">Family</h1>
        <p className="rounded-2xl bg-card p-6 text-sm text-muted-foreground">
          This page is for parent accounts.{" "}
          <Link href="/auth" className="text-primary underline">
            Sign in
          </Link>{" "}
          as a parent to see your player&apos;s activity.
        </p>
      </main>
    );
  }

  const nameOf = (pid: string) => links?.find((l) => l.playerId === pid)?.playerName ?? "Your player";

  return (
    <main className="mx-auto max-w-md p-6 pb-28 lg:max-w-5xl lg:px-10 lg:pt-12">
      <h1 className="mb-2 text-4xl font-bold tracking-tight lg:text-6xl">Family</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Everything your player does here is visible to you — every swing, every
        coach comment, every assigned drill. Videos are face-anonymized on the
        player&apos;s own device before upload.
      </p>

      {rows === null &&
        (loadError ? (
          <Notice
            tone="error"
            title="Couldn't load your player's activity"
            actions={[
              {
                label: "Try again",
                onClick: () => {
                  setLoadError(false);
                  setReloadKey((k) => k + 1);
                },
              },
            ]}
          >
            Check your connection, then try again.
          </Notice>
        ) : (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ))}

      {links?.length === 0 && (
        <LinkForm
          onLinked={() => {
            void refresh();
            setReloadKey((k) => k + 1);
          }}
        />
      )}

      {links && links.length > 0 && (
        <>
          <p className="mb-2 text-sm text-muted-foreground">
            Linked: {links.map((l) => l.playerName ?? "Your player").join(", ")}
          </p>
          {rows?.length === 0 && (
            <p className="mb-6 rounded-2xl bg-card p-6 text-sm text-muted-foreground">
              No activity yet.
            </p>
          )}
          {rows && rows.length > 0 && (
            <section className="mb-6 rounded-2xl bg-card lg:max-w-2xl">
              {rows.map((r, i) => (
                <Link
                  key={r.id}
                  href={`/analysis/${r.id}`}
                  className={`flex items-center gap-3 p-4 ${i > 0 ? "border-t border-border" : ""}`}
                >
                  <div className="flex-1">
                    <div className="text-sm font-medium">
                      {links.length > 1 && `${nameOf(r.playerId)} · `}
                      {new Date(r.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}{" "}
                      ·{" "}
                      {new Date(r.createdAt).toLocaleTimeString(undefined, {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </div>
                    <div className="text-xs text-muted-foreground">{r.status}</div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              ))}
            </section>
          )}
          <details className="lg:max-w-md">
            <summary className="mb-2 cursor-pointer text-sm text-primary">+ Link another player</summary>
            <LinkForm
              onLinked={() => {
                void refresh();
                setReloadKey((k) => k + 1);
              }}
            />
          </details>
        </>
      )}
    </main>
  );
}
