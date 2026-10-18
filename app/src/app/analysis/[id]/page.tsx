"use client";

// Analysis page — THE screen. Blurred swing video with the AI skeleton
// overlaid (drawn from the stored landmark series, synced to playback),
// real metric tiles, and plain-English findings with assigned drills.
import PlayerName from "@/components/PlayerName";
import { DrawingUtils, PoseLandmarker } from "@mediapipe/tasks-vision";
import {
  addDoc,
  deleteDoc,
  deleteField,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { BadgeCheck, Ban, Check, ChevronLeft, ChevronRight, Flag, Plus, Star } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { DRILLS } from "@/lib/drills";
import { COACH_SAFETY_BUTTONS } from "@/lib/switches";
import { fieldSkinOn } from "@/lib/skin";
import { db } from "@/lib/firebase";
import { playbackUrl } from "@/lib/video";
import DrillPicker from "@/components/DrillPicker";
import LinkifiedText from "@/components/LinkifiedText";
import ReactionButton, { reactionLabel } from "@/components/ReactionButton";
import GrowthPanel from "@/components/GrowthPanel";
import type { PoseFrame } from "@/lib/poseExtract";
import { DISABLED_METRICS, type Finding, type SwingMetrics } from "@/lib/swingMetrics";

interface CommentRow {
  id: string;
  mentorId?: string;
  mentorName?: string;
  mentorOrg?: string; // team / school the admin verified
  timestampSec: number;
  text: string;
  createdAt: number;
}

interface SessionDoc {
  playerId: string;
  videoPathname: string;
  createdAt: number;
  metrics?: SwingMetrics;
  findings?: Finding[];
  landmarks?: string;
  reactions?: Record<string, string>; // commentId → the player's emoji
}


const SEVERITY_STYLE = {
  major: "border-l-4 border-red-500",
  minor: "border-l-4 border-yellow-500",
  good: "border-l-4 border-primary",
} as const;

// Favorite coach: doc id playerId_coachId (rules allow only the player to write)
async function saveFavorite(playerId: string, coachId: string, on: boolean) {
  const ref = doc(db, "favorites", `${playerId}_${coachId}`);
  if (on) await setDoc(ref, { playerId, coachId, createdAt: Date.now() });
  else await deleteDoc(ref);
}

async function saveAssignment(playerId: string, drillId: string, coachId: string, coachName: string) {
  await addDoc(collection(db, "assignments"), {
    playerId,
    drillId,
    assignedBy: coachId,
    mentorName: coachName,
    status: "assigned",
    createdAt: Date.now(),
  });
}

export default function AnalysisSessionPage() {
  const { id } = useParams<{ id: string }>();
  const { user, profile, loading } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const framesRef = useRef<PoseFrame[]>([]);
  const rafRef = useRef(0);
  const [session, setSession] = useState<SessionDoc | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [newComment, setNewComment] = useState("");
  const [assigned, setAssigned] = useState<Set<string>>(new Set()); // drills assigned this visit
  const [coachMsg, setCoachMsg] = useState("");
  const [blockedCoaches, setBlockedCoaches] = useState<Set<string>>(new Set());
  const [favorites, setFavorites] = useState<Set<string>>(new Set()); // coachIds the player starred
  const [safetyMsg, setSafetyMsg] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0); // bump to retry the load

  useEffect(() => {
    // Wait for the profile too — checking access before the role loads
    // wrongly showed "You don't have access" on a refresh / direct link
    if (!user || !id || !profile) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "sessions", id));
        if (!snap.exists()) return setError("Session not found.");
        const data = snap.data() as SessionDoc;
        const isOwner = data.playerId === user.uid;
        const isMentor = profile?.role === "mentor" && !!profile.verifiedMentor;
        const isGuardian = (profile?.guardianOf ?? []).includes(data.playerId);
        if (!isOwner && !isMentor && !isGuardian && !profile?.isAdmin)
          return setError("You don't have access to this session.");
        setSession(data);
        // load coach comments (visible to player, guardian, and mentors alike)
        const csnap = await getDocs(
          query(collection(db, "comments"), where("sessionId", "==", id)),
        );
        const cs = csnap.docs.map((d) => ({ id: d.id, ...d.data() }) as CommentRow);
        cs.sort((a, b) => b.createdAt - a.createdAt); // newest first
        setComments(cs);
        // The player has now seen this feedback — clears "New feedback" on Home
        if (isOwner && cs.length > 0)
          updateDoc(doc(db, "sessions", id), { feedbackSeenAt: Date.now() }).catch(() => {});
        // Blocks hide a coach's comments from the player's side. Coaches don't
        // need them (and the rules don't let a coach list a player's blocks).
        if (!isMentor) {
          const bsnap = await getDocs(
            query(collection(db, "blocks"), where("playerId", "==", data.playerId)),
          );
          setBlockedCoaches(new Set(bsnap.docs.map((d) => d.data().coachId as string)));
          // Coaches this player has favorited (player + parent can read them)
          const fsnap = await getDocs(
            query(collection(db, "favorites"), where("playerId", "==", data.playerId)),
          ).catch(() => null);
          if (fsnap) setFavorites(new Set(fsnap.docs.map((d) => d.data().coachId as string)));
        }
        framesRef.current = data.landmarks ? (JSON.parse(data.landmarks) as PoseFrame[]) : [];
        const url = await playbackUrl(id);
        if (url) setVideoUrl(url);
        else setError("Couldn't load the video (link may have expired — reload).");
      } catch {
        setError("Couldn't load this swing — check your connection and try again.");
        setLoadFailed(true);
      }
    })();
    return () => cancelAnimationFrame(rafRef.current);
  }, [user, profile, id, reloadKey]);

  // Draw the skeleton for whichever stored frame is nearest to playback time
  function startOverlay() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d")!;
    const drawer = new DrawingUtils(ctx);
    const frames = framesRef.current;
    const fieldGreen = document.documentElement.dataset.skin === "field";

    const loop = () => {
      const t = video.currentTime;
      // nearest frame by time (frames are sorted)
      let lo = 0,
        hi = frames.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (frames[mid].t < t) lo = mid + 1;
        else hi = mid;
      }
      const near =
        lo > 0 && Math.abs(frames[lo - 1].t - t) < Math.abs(frames[lo].t - t)
          ? frames[lo - 1]
          : frames[lo];

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (near && Math.abs(near.t - t) < 0.2) {
        const lms = near.lm.map((l) => ({ x: l.x, y: l.y, z: 0, visibility: l.v }));
        drawer.drawConnectors(lms, PoseLandmarker.POSE_CONNECTIONS, {
          color: fieldGreen ? "#5CE38B" : "#22c55e", // Field skin uses the prototype green
          lineWidth: 3,
        });
        drawer.drawLandmarks(lms, { color: "#ffffff", radius: 3 });
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(loop);
  }

  if (!loading && !user) {
    return (
      <main className="mx-auto max-w-md p-6 pb-28">
        <p className="rounded-2xl bg-card p-6 text-sm text-muted-foreground">
          <Link href="/auth" className="text-primary underline">
            Sign in
          </Link>{" "}
          to view your analysis.
        </p>
      </main>
    );
  }

  async function assignDrill(drillId: string) {
    if (!user || !session) return;
    try {
      await saveAssignment(session.playerId, drillId, user.uid, user.displayName ?? "Coach");
      setAssigned((s) => new Set([...s, drillId]));
      setCoachMsg("Drill assigned — it appears on the player's Drills page.");
    } catch {
      setCoachMsg("Couldn't assign the drill — check your connection and try again.");
    }
  }

  // Report / Block under comments — who sees them is a switch (lib/switches.ts)
  const showSafety =
    (profile?.role === "guardian" && COACH_SAFETY_BUTTONS !== "none") ||
    (profile?.role === "player" && COACH_SAFETY_BUTTONS === "everyone");

  async function toggleFavorite(coachId: string) {
    if (!session) return;
    const before = favorites;
    const on = !before.has(coachId);
    const next = new Set(before);
    if (on) next.add(coachId);
    else next.delete(coachId);
    setFavorites(next); // show it right away
    try {
      await saveFavorite(session.playerId, coachId, on);
    } catch {
      setFavorites(before);
    }
  }

  async function react(commentId: string, emoji: string | null) {
    if (!session) return;
    const before = session.reactions;
    const next = { ...(before ?? {}) };
    if (emoji) next[commentId] = emoji;
    else delete next[commentId];
    setSession({ ...session, reactions: next }); // show it right away
    try {
      await updateDoc(doc(db, "sessions", id), {
        [`reactions.${commentId}`]: emoji ?? deleteField(),
      });
    } catch {
      setSession({ ...session, reactions: before });
    }
  }

  // Drills the AI matched to this swing's findings, deduped, in finding order
  const suggestedDrills = [
    ...new Set(
      (session?.findings ?? [])
        .filter((f) => !DISABLED_METRICS.has(f.metric))
        .flatMap((f) => f.drillIds),
    ),
  ]
    .map((did) => DRILLS.find((d) => d.id === did))
    .filter((d): d is (typeof DRILLS)[number] => !!d);

  const m = session?.metrics;
  const tiles = m
    ? [
        { label: "Hips→shoulders gap", value: m.sequenceGapMs, unit: "ms" },
        { label: "Hip turn", value: m.hipTurnDeg, unit: "°" },
        { label: "Hip–shoulder sep", value: m.hipShoulderSepDeg, unit: "°", key: "hipShoulderSepDeg" },
        { label: "Swing tempo", value: m.tempoSec, unit: "s" },
        { label: "Head drift (after plant)", value: m.headDriftPct, unit: "%" },
        { label: "Stride", value: m.stridePct, unit: "%" },
        { label: "Front-knee brace", value: m.kneeBraceDeg, unit: "°" },
        { label: "Shoulder tilt", value: m.shoulderTiltDeg, unit: "°" },
        { label: "Tracking quality", value: Math.round((m.trackingQuality ?? 0) * 100), unit: "%" },
      ].filter((t) => !(t.key && DISABLED_METRICS.has(t.key)))
    : [];

  // Coach review screen in the Field skin (switch: FIELD_SKIN_ROLES): same
  // pieces as below, laid out like the prototype — composer under the video,
  // AI notes / numbers / growth folded into "Reference", then earlier comments.
  const coachField = profile?.role === "mentor" && fieldSkinOn(profile.role);

  const errorEl = error && (
        <p className="mb-4 rounded-2xl bg-card p-4 text-sm text-destructive">
          {error}
          {loadFailed && (
            <>
              {" "}
              <button
                onClick={() => {
                  setError("");
                  setLoadFailed(false);
                  setReloadKey((k) => k + 1);
                }}
                className="text-primary underline"
              >
                Retry
              </button>
            </>
          )}
        </p>
  );

  const videoEl = (
    <>
          <section className="dd-video relative mb-4 overflow-hidden rounded-2xl bg-card">
            {videoUrl ? (
              <>
                <video
                  ref={videoRef}
                  src={videoUrl}
                  controls
                  playsInline
                  muted
                  onPlay={startOverlay}
                  onSeeked={startOverlay}
                  className="w-full"
                />
                <canvas
                  ref={canvasRef}
                  className="pointer-events-none absolute inset-0 h-full w-full"
                />
              </>
            ) : (
              <div className="flex aspect-video items-center justify-center text-sm text-muted-foreground">
                Loading video…
              </div>
            )}
          </section>
          <p className="mb-4 text-xs text-muted-foreground">
            ▶ Play or scrub — the green skeleton is the AI&apos;s view of the body,
            computed on-device.
          </p>
    </>
  );

  const safetyRowEl = profile?.role === "mentor" && session && user && (
            <div className="mb-4 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="font-medium"><PlayerName uid={session.playerId} /></span>
              <button
                onClick={async () => {
                  await addDoc(collection(db, "reports"), {
                    targetId: session.playerId,
                    targetRole: "player",
                    byId: user.uid,
                    sessionId: id,
                    createdAt: Date.now(),
                  });
                  setSafetyMsg("Reported — thank you.");
                }}
                className="underline"
              >
                <Flag className="mr-1 inline h-3.5 w-3.5" />Report video
              </button>
              <button
                onClick={async () => {
                  await addDoc(collection(db, "blocks"), {
                    playerId: session.playerId,
                    coachId: user.uid,
                    byId: user.uid,
                    createdAt: Date.now(),
                  });
                  setSafetyMsg("Hidden — this player won't appear in your queue.");
                }}
                className="underline"
              >
                <Ban className="mr-1 inline h-3.5 w-3.5" />Hide this player
              </button>
              {safetyMsg && <span className="text-primary">{safetyMsg}</span>}
            </div>
  );

  const tilesEl = (
          <section className="mb-4 grid grid-cols-2 gap-2 wide:gap-4">
            {tiles.map((t) => (
              <div key={t.label} className="dd-stat rounded-2xl bg-card p-4">
                <div className="font-mono text-3xl font-bold text-primary">
                  {t.value === null || t.value === undefined ? (
                    // This clip couldn't support the measurement — an em dash is
                    // honest; a 0 would read as a (very good) score.
                    <span className="text-muted-foreground">&mdash;</span>
                  ) : (
                    <>
                      {t.value}
                      <span className="text-lg text-muted-foreground">{t.unit}</span>
                    </>
                  )}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{t.label}</div>
              </div>
            ))}
          </section>
  );

  const noMetricsEl = !m && session && (
            <section className="mb-4 rounded-2xl bg-card p-4 text-sm text-muted-foreground">
              This swing has the video only — it was uploaded before AI analysis
              existed (or was analyzed on an older version). New uploads get the
              full breakdown automatically.
            </section>
  );

  const findings = session?.findings?.filter((f) => !DISABLED_METRICS.has(f.metric)) ?? [];
  const findingsEl = session?.findings?.filter((f) => !DISABLED_METRICS.has(f.metric)).map((f, i) => (
              <section key={i} className={`dd-finding rounded-2xl bg-card p-4 ${SEVERITY_STYLE[f.severity]}`}>
                {/* Field skin: the prototype's "The read" kicker on the first read */}
                {i === 0 && (
                  <div className="dd-only">
                    <p className="dd-k">The read</p>
                  </div>
                )}
                <p className="dd-msg text-sm">{f.message}</p>
                {f.drillIds.length > 0 && (
                  <p className="dd-drillchip mt-2 text-xs text-primary">
                    → Drill:{" "}
                    {f.drillIds
                      .map((id) => DRILLS.find((d) => d.id === id)?.name ?? id)
                      .join(" · ")}
                  </p>
                )}
              </section>
            ));

  const noCommentsEl = comments.length === 0 && (
              <p className="rounded-2xl bg-card p-4 text-sm text-muted-foreground">
                No coach comments yet.
              </p>
  );

  const commentEls = comments
              .filter((c) => !c.mentorId || !blockedCoaches.has(c.mentorId))
              .map((c) => (
              <div
                key={c.id}
                className={`dd-comment rounded-2xl bg-card p-4${
                  coachField && (c.mentorId === user?.uid || c.id.startsWith("local-")) ? " dd-mine" : ""
                }`}
              >
                <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  {/* Tapping the name/date jumps the video to where the coach paused;
                      the comment itself is plain, selectable text with live links */}
                  <button
                    onClick={() => {
                      if (videoRef.current) videoRef.current.currentTime = c.timestampSec;
                    }}
                    className="dd-coachline inline-flex flex-wrap items-center gap-1 text-left text-xs text-muted-foreground"
                  >
                    <b className="font-normal dd-coachname">{c.mentorName ?? "Coach"}</b>
                    {/* Only admin-approved coaches can comment at all */}
                    <BadgeCheck className="h-3.5 w-3.5 text-primary" aria-label="Verified coach" />
                    {c.mentorOrg && <span>· {c.mentorOrg}</span>}
                    <span>
                      ·{" "}
                      {new Date(c.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })},{" "}
                      {new Date(c.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                    </span>
                  </button>
                  <LinkifiedText text={c.text} className="dd-quote mt-1 text-sm" />
                </div>
                {/* Favorite this coach — their queue can then filter to you */}
                {session && c.mentorId && !c.id.startsWith("local-") &&
                  (user?.uid === session.playerId ? (
                    <button
                      onClick={() => toggleFavorite(c.mentorId!)}
                      aria-pressed={favorites.has(c.mentorId)}
                      className={`dd-fav flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold transition-colors ${
                        favorites.has(c.mentorId) ? "text-amber-400" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Star className={`h-4 w-4 ${favorites.has(c.mentorId) ? "fill-amber-400" : ""}`} />
                      {favorites.has(c.mentorId) ? "Favorited" : "Favorite"}
                    </button>
                  ) : (
                    profile?.role === "guardian" &&
                    favorites.has(c.mentorId) && (
                      <span className="flex shrink-0 items-center gap-1 px-2 py-1 text-xs font-semibold text-amber-400">
                        <Star className="h-4 w-4 fill-amber-400" /> Favorited
                      </span>
                    )
                  ))}
                </div>
                {/* Reactions (comments are stored per swing; reactions on the player's
                    own swing doc) — the player reacts; coach and parent see it */}
                {session && !c.id.startsWith("local-") &&
                  (user?.uid === session.playerId ? (
                    <div className="-ml-2 mt-2">
                      <ReactionButton value={session.reactions?.[c.id]} onChange={(e) => react(c.id, e)} />
                    </div>
                  ) : (
                    session.reactions?.[c.id] && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {profile?.role === "guardian" ? "Your player" : "Player"} reacted{" "}
                        <span className="text-base">{session.reactions[c.id]}</span>{" "}
                        {reactionLabel(session.reactions[c.id])}
                      </p>
                    )
                  ))}
                {showSafety && c.mentorId && user && session && (
                  <div className="mt-2 flex gap-3 text-xs text-muted-foreground">
                    <button
                      onClick={async () => {
                        await addDoc(collection(db, "reports"), {
                          targetId: c.mentorId,
                          targetRole: "mentor",
                          byId: user.uid,
                          sessionId: id,
                          commentText: c.text,
                          createdAt: Date.now(),
                        });
                        setSafetyMsg("Reported — we review every report.");
                      }}
                      className="underline"
                    >
                      <Flag className="mr-1 inline h-3.5 w-3.5" />Report
                    </button>
                    <button
                      onClick={async () => {
                        await addDoc(collection(db, "blocks"), {
                          playerId: session.playerId,
                          coachId: c.mentorId,
                          byId: user.uid,
                          createdAt: Date.now(),
                        });
                        setBlockedCoaches((s) => new Set([...s, c.mentorId!]));
                        setSafetyMsg(
                          "Coach blocked — their comments are hidden and your swings leave their queue.",
                        );
                      }}
                      className="underline"
                    >
                      <Ban className="mr-1 inline h-3.5 w-3.5" />Block this coach
                    </button>
                  </div>
                )}
              </div>
            ));

  const safetyMsgEl = safetyMsg && <p className="text-xs text-primary">{safetyMsg}</p>;

  const growthEl = profile?.role === "mentor" && profile.verifiedMentor && session && (
              <div className="mb-4">
                <h2 className="dd-label mb-2 text-sm font-semibold text-muted-foreground">
                  <PlayerName uid={session.playerId} />&apos;s growth
                </h2>
                <GrowthPanel playerId={session.playerId} mode="coach" />
              </div>
  );

  const composerEl = profile?.role === "mentor" && session && (
              <div className={`rounded-2xl bg-card p-4${coachField ? " dd-composer" : ""}`}>
                {coachField && <p className="dd-composer-k">Your review</p>}
                <p className={`mb-2 text-xs text-muted-foreground${coachField ? " dd-hide" : ""}`}>
                  Comment lands at the video&apos;s current time — pause where you want it.
                  Visible to the player and their parent.
                </p>
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="At this moment — watch your back elbow…"
                  className={`mb-2 w-full rounded-xl border-0 bg-secondary p-3 text-sm${coachField ? " dd-composer-input" : ""}`}
                  rows={2}
                />
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      if (!newComment.trim() || !user) return;
                      const timestampSec = videoRef.current?.currentTime ?? 0;
                      await addDoc(collection(db, "comments"), {
                        sessionId: id,
                        mentorId: user.uid,
                        mentorName: user.displayName ?? "Coach",
                        ...(profile?.coachOrg ? { mentorOrg: profile.coachOrg } : {}),
                        timestampSec,
                        text: newComment.trim(),
                        createdAt: Date.now(),
                      });
                      setComments((cs) =>
                        [...cs, {
                          id: `local-${Date.now()}`,
                          mentorName: user.displayName ?? "Coach",
                          mentorOrg: profile?.coachOrg,
                          timestampSec,
                          text: newComment.trim(),
                          createdAt: Date.now(),
                        }].sort((a, b) => b.createdAt - a.createdAt),
                      );
                      setNewComment("");
                      setCoachMsg("Comment posted.");
                    }}
                    className="flex-1 rounded-full bg-primary py-2 text-sm font-semibold text-primary-foreground"
                  >
                    Post comment
                  </button>
                </div>
                {/* One tap: the drills the AI already matched to this swing */}
                {suggestedDrills.length > 0 && (
                  <div className="mt-3">
                    <p className="mb-2 text-xs text-muted-foreground">Suggested by the AI for this swing:</p>
                    <div className="flex flex-wrap gap-2">
                      {suggestedDrills.map((d) => (
                        <button
                          key={d.id}
                          disabled={assigned.has(d.id)}
                          onClick={() => assignDrill(d.id)}
                          className={`rounded-full border border-primary/50 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary disabled:opacity-50${coachField ? " dd-suggest" : ""}`}
                        >
                          {assigned.has(d.id) ? <Check className="mr-1 inline h-3.5 w-3.5" /> : <Plus className="mr-1 inline h-3.5 w-3.5" />}
                          {d.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {/* Any drill in the library: type to search, pick to assign */}
                <div className="mt-3">
                  <DrillPicker onPick={assignDrill} assigned={assigned} />
                </div>
                {coachMsg && <p className="mt-2 text-xs text-primary">{coachMsg}</p>}
                {coachField && (
                  <p className="dd-fineprint">
                    Your comment lands at the video&apos;s current time — scrub, pause where you want it. Visible
                    to the player and their parent.
                  </p>
                )}
              </div>
  );

  if (coachField) {
    const measured = [
      m?.sequenceGapMs != null && `hips ${m.sequenceGapMs}ms`,
      m?.tempoSec != null && `tempo ${m.tempoSec}s`,
    ].filter(Boolean);
    return (
      <main className="mx-auto max-w-md p-6 pb-28 desk:max-w-2xl">
        <Link href="/" className="dd-back inline-flex items-center gap-0.5 text-sm">
          <ChevronLeft className="h-4 w-4" /> On Deck
        </Link>
        <h1 className="dd-title dd-review-title mt-3 mb-4">
          {session ? <PlayerName uid={session.playerId} /> : "Review"}
          {session && (
            <span className="dd-when">
              {" "}
              · {new Date(session.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </span>
          )}
        </h1>
        {errorEl}
        {videoEl}
        {safetyRowEl}
        {composerEl}

        {session && (
          <>
            <p className="dd-label mb-0">Reference</p>
            <details className="dd-ref">
              <summary>
                <span>
                  <b>AI notes</b> · {findings.length} finding{findings.length === 1 ? "" : "s"}
                </span>
                <ChevronRight className="dd-chev h-4 w-4" />
              </summary>
              <div className="dd-refbody space-y-2">
                {noMetricsEl}
                {findingsEl}
                {findings.length === 0 && m && <p className="text-sm text-muted-foreground">No AI notes on this swing.</p>}
              </div>
            </details>
            {m && (
              <details className="dd-ref">
                <summary>
                  <span>
                    <b>Measured</b>
                    {measured.length > 0 && <> · {measured.join(" · ")}</>}
                  </span>
                  <ChevronRight className="dd-chev h-4 w-4" />
                </summary>
                <div className="dd-refbody">{tilesEl}</div>
              </details>
            )}
            {profile?.verifiedMentor && (
              <details className="dd-ref">
                <summary>
                  <span>
                    <b><PlayerName uid={session.playerId} />&apos;s growth</b> · effort &amp; skills
                  </span>
                  <ChevronRight className="dd-chev h-4 w-4" />
                </summary>
                <div className="dd-refbody">
                  <GrowthPanel playerId={session.playerId} mode="coach" />
                </div>
              </details>
            )}
          </>
        )}

        <p className="dd-label mb-3">Earlier comments</p>
        <div className="space-y-2">
          {noCommentsEl}
          {commentEls}
          {safetyMsgEl}
        </div>
        <Link href="/" className="dd-softbtn">
          Back to On Deck →
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md p-6 pb-28 desk:max-w-2xl wide:max-w-5xl wide:px-10 wide:pt-12">
      <div className="mb-6 flex items-center gap-3 wide:mb-10">
        <Link href="/progress" className="dd-back rounded-full bg-card p-2">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="dd-title text-4xl font-bold tracking-tight wide:text-6xl">Analysis</h1>
      </div>

      {errorEl}

      <div className="wide:grid wide:grid-cols-5 wide:items-start wide:gap-8">
        <div className="wide:col-span-3">
          {videoEl}
          {safetyRowEl}
        </div>

        <div className="wide:col-span-2">
          {tilesEl}
          {noMetricsEl}
          <h2 className="dd-label mb-2 text-sm font-semibold text-muted-foreground">AI Coaching</h2>
          <div className="space-y-2">{findingsEl}</div>

          <h2 className="dd-label mb-2 mt-6 text-sm font-semibold text-muted-foreground">
            Coach comments
          </h2>
          <div className="space-y-2">
            {noCommentsEl}
            {commentEls}
            {safetyMsgEl}

            {growthEl}
            {composerEl}
          </div>
        </div>
      </div>
    </main>
  );
}
