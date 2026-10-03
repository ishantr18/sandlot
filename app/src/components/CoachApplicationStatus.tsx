"use client";

// What an uncertified coach sees instead of the review queue: where their
// application stands, the admin's note if it was turned down, and a form to
// fix and resubmit. No swing is visible until the admin approves.
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { CREDENTIALS, getCoachApplication, submitCoachApplication, type CoachApplication } from "@/lib/family";

const FIELD = "w-full rounded-2xl border-0 bg-secondary p-3 text-sm";

export default function CoachApplicationStatus() {
  const { user, refresh } = useAuth();
  const [app, setApp] = useState<CoachApplication | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [organization, setOrganization] = useState("");
  const [credential, setCredential] = useState<string>(CREDENTIALS[0]);
  const [credentialId, setCredentialId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    getCoachApplication(user.uid)
      .then((a) => {
        setApp(a);
        if (a) {
          setOrganization(a.organization);
          setCredential(a.credential);
          setCredentialId(a.credentialId);
          setNote(a.note ?? "");
        }
      })
      .catch(() => setApp(null));
  }, [user]);

  const showForm = editing || app === null || app?.status === "rejected";

  return (
    <main className="mx-auto max-w-md p-6 pb-28">
      <h1 className="mb-6 text-4xl font-bold tracking-tight">Almost there</h1>
      <div className="mb-4 rounded-2xl bg-card p-6">
        {app?.status === "rejected" ? (
          <>
            <p className="mb-2 text-lg font-semibold">🧢 Not approved yet</p>
            <p className="text-sm text-muted-foreground">
              {app.reviewNote
                ? `Reviewer's note: ${app.reviewNote}`
                : "We couldn't verify these details. Update them below and resubmit."}
            </p>
          </>
        ) : app ? (
          <>
            <p className="mb-2 text-lg font-semibold">🧢 Certification pending</p>
            <p className="text-sm text-muted-foreground">
              A real person checks every coach before they can see any player
              videos — that&apos;s a promise we make to families. Submitted{" "}
              {new Date(app.submittedAt).toLocaleDateString()}: {app.credential} ·{" "}
              {app.organization}.
            </p>
            {!editing && (
              <button onClick={() => setEditing(true)} className="mt-3 text-xs text-primary underline">
                Edit my details
              </button>
            )}
          </>
        ) : app === null ? (
          <>
            <p className="mb-2 text-lg font-semibold">🧢 Apply to coach</p>
            <p className="text-sm text-muted-foreground">
              Tell us how to verify you. A real person checks every coach before
              they can see any player videos.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
      </div>

      {showForm && app !== undefined && user && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await submitCoachApplication({
                uid: user.uid,
                displayName: user.displayName ?? "Coach",
                organization: organization.trim(),
                credential,
                credentialId: credentialId.trim(),
                note: note.trim(),
              });
              setApp(await getCoachApplication(user.uid));
              setEditing(false);
              await refresh();
            } catch {
              setError("Couldn't submit — try again.");
            }
            setBusy(false);
          }}
          className="space-y-3 rounded-2xl bg-card p-4"
        >
          <input value={organization} onChange={(e) => setOrganization(e.target.value)} placeholder="Team, league, or school" required className={FIELD} />
          <select value={credential} onChange={(e) => setCredential(e.target.value)} className={FIELD}>
            {CREDENTIALS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <input value={credentialId} onChange={(e) => setCredentialId(e.target.value)} placeholder="Certificate or member number" required className={FIELD} />
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything else that helps us verify you (optional)" rows={2} className={FIELD} />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button disabled={busy} className="w-full rounded-full bg-primary py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40">
            {busy ? "One sec…" : app ? "Resubmit" : "Submit application"}
          </button>
        </form>
      )}
    </main>
  );
}
