"use client";

// Player's Family card: make a code for a parent, see who's linked, unlink.
// The code is the consent step — a parent can only link with a code made
// on THIS account, and it works once, for 24 hours.
import { useEffect, useState } from "react";
import { currentFamilyCode, linksFor, newFamilyCode, unlink, type FamilyCode, type Link } from "@/lib/family";

export default function FamilyCard({ playerId, playerName }: { playerId: string; playerName: string }) {
  const [code, setCode] = useState<FamilyCode | null>(null);
  const [links, setLinks] = useState<Link[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const [c, l] = await Promise.all([currentFamilyCode(playerId), linksFor("playerId", playerId)]);
        setCode(c);
        setLinks(l);
      } catch {
        setError("Couldn't load your family info.");
      }
    })();
  }, [playerId, reloadKey]);

  async function makeCode() {
    setBusy(true);
    setError("");
    try {
      setCode(await newFamilyCode(playerId, playerName));
    } catch {
      setError("Couldn't make a code — try again.");
    }
    setBusy(false);
  }

  return (
    <section className="mt-6 rounded-2xl bg-card p-4 lg:p-6">
      <h2 className="mb-1 text-sm font-semibold">👨‍👩‍👧 Family code</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Give this to a parent so they can see your swings and every coach comment.
        It works once and expires in 24 hours.
      </p>
      {code ? (
        <div className="mb-3 flex items-center justify-between rounded-xl bg-secondary p-3">
          <span className="font-mono text-2xl font-bold tracking-[0.3em] text-primary">{code.code}</span>
          <button onClick={makeCode} disabled={busy} className="text-xs text-muted-foreground underline">
            New code
          </button>
        </div>
      ) : (
        <button
          onClick={makeCode}
          disabled={busy}
          className="mb-3 w-full rounded-full bg-primary py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
        >
          {busy ? "One sec…" : "Make a family code"}
        </button>
      )}
      {links.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted-foreground">Linked parents</p>
          {links.map((l) => (
            <div key={l.id} className="flex items-center justify-between text-sm">
              <span>{l.guardianName ?? "Parent"}</span>
              <button
                onClick={async () => {
                  await unlink(l.id).catch(() => setError("Couldn't remove — try again."));
                  setReloadKey((k) => k + 1);
                }}
                className="text-xs text-muted-foreground underline"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </section>
  );
}
