# Diamond Drive — Technical Overview & Implementation Review
*Prepared for engineering review. Everything here is implemented and deployed
unless explicitly marked otherwise. Live app: sandlot-ishantr18s-projects.vercel.app · Private repo: github.com/ishantr18/sandlot*

---

## 1. The idea

Quality baseball coaching costs $3,000–$10,000/year, which prices out most
families. Diamond Drive is a free web app where a kid films their swing on any
phone; the app **anonymizes their face on-device**, runs **computer-vision
swing analysis** locally, explains flaws in plain English with assigned drills,
and lets **certified volunteer coaches** review anonymous swings — prioritized
so the least-coached kids get attention first — with every interaction visible
to parents.

Three account roles, one codebase: **Player** (records, gets analysis),
**Coach** (reviews queue, comments, assigns drills), **Parent** (read-only
window on everything their child does).

## 2. Architecture at a glance

```
USER'S DEVICE (all AI runs here)                      CLOUD
┌────────────────────────────────────┐     ┌──────────────────────────────┐
│ Next.js PWA (TypeScript/React)     │     │ Vercel (hosting + API routes)│
│                                    │     │  /api/upload → mints scoped  │
│ 1. Record/pick video               │     │    10-min upload tokens      │
│ 2. BlazeFace + BlazePose scan      │     │  /api/video  → mints 15-min  │
│    → pixelate faces (8-block       │     │    signed playback URLs      │
│    mosaic), re-encode              │     ├──────────────────────────────┤
│ 3. Self-audit: re-detect faces on  │     │ Vercel Blob (PRIVATE store)  │
│    OWN output; re-blur if found    │     │  blurred videos only         │
│ 4. BlazePose → 33 landmarks/frame  │     ├──────────────────────────────┤
│    (≤60fps time series)            │     │ Firebase Auth (email/pw)     │
│ 5. Metrics engine (original code): │     │ Firestore + security rules:  │
│    quality gate → swing detection  │     │  users, sessions (landmarks+ │
│    → 7 metrics → findings → drills │     │  metrics), comments,         │
│ 6. Upload blurred video + numbers  │     │  assignments, blocks, reports│
└────────────────────────────────────┘     └──────────────────────────────┘
```

**The critical property:** raw video never leaves the device. The cloud only
ever receives (a) the anonymized video, (b) numeric landmark/metric data.
There is no server-side AI, no third-party AI API, no data sent to Google —
the models are static files served from our own domain.

## 3. Borrowed vs. built (full inventory)

### Pretrained AI models (Google MediaPipe — Apache 2.0 license)
| Model | File (self-hosted in `/public/mediapipe/`) | Job |
|---|---|---|
| **BlazeFace** (short-range) | `blaze_face_short_range.tflite`, 224 KB | Face boxes per frame → pixelation targets |
| **BlazePose** (Pose Landmarker, lite) | `pose_landmarker_lite.task`, 5.5 MB | 33 body landmarks + confidence per frame |
| MediaPipe Tasks runtime | `@mediapipe/tasks-vision` 1.0.1 + WASM bundle | Runs both models in-browser at near-native speed |

We did **not** train or fine-tune any model (no labeled baseball dataset
exists publicly; training would require lab-grade compute for a worse result).
The engineering contribution is everything built *on top of* the landmarks.

### Frameworks & services
| Component | Version | Role | Cost |
|---|---|---|---|
| Next.js / React / TypeScript | 16.3 / 19.2 / TS | App framework | free |
| Tailwind + shadcn/ui | v4 / CLI-copied source | Design system (dark "Dugout" theme) | free |
| Firebase Auth + Firestore | v12 SDK | Accounts, roles, all structured data, security rules | free tier |
| Vercel hosting + Blob | Hobby plan | Deploys, API routes, **private** video store | free tier |
| Recharts | v3 | Progress trend charts (CVD-validated palette) | free |
| lucide-react | — | Icons | free |

Notably absent by choice: Firebase Storage (requires paid plan → replaced by
Vercel Blob private store), any analytics/tracking SDK, any LLM API.

### Original code (the substance — all in `app/src/lib/`)
- **`faceblur.ts`** — 3-stage anonymization: scan (both models vote on head
  locations, boxes held ±0.25s so entry/exit frames stay covered) → pixelate
  (8-block mosaic — destructive, unlike gaussian blur which research has
  reversed) → **verify** (re-run detector on output; any hit → auto re-blur
  1.4× and re-audit; "unverified" is reported honestly if it can't check).
  Audio is stripped. Per-device codec blacklist self-heals machines whose
  recorders produce files they can't decode (found on a real Windows laptop).
- **`poseExtract.ts`** — video → landmark time series, ≤60fps (20fps proved
  too coarse: a 150ms swing needs a finer clock), normalized coords, capped
  to fit Firestore's 1MB doc limit.
- **`swingMetrics.ts`** — the engine. Quality gate (6 checks incl. camera-angle
  detection — front-facing videos are *rejected*, not mis-measured). Swing
  detection: contact = peak hand speed, launch = walk-back to 15% of peak,
  foot plant = front-ankle speed collapse. Seven metrics, all normalized to
  in-frame body height (camera distance cancels out — no calibration step):
  **kinematic sequence gap (ms, hips-before-shoulders — the flagship)**,
  hip–shoulder separation (°), tempo (s), post-plant head drift (%), stride
  (%), front-knee brace angle (°), shoulder tilt at launch (°). Thresholds
  anchored in published biomechanics (Escamilla 2009, *J. Applied
  Biomechanics*: youth ≠ scaled-down adults) and calibrated against our own
  filmed clips.
- **Trust/safety layer** — certified-coach gate (human-granted `verifiedMentor`
  flag enforced in database rules), player anonymity to coaches ("Player
  #7F3K"), equity queue (least-reviewed swings first), one-way communication
  (no reply channel, no DMs anywhere), two-way block/report, parent-visible
  everything.

## 4. Security & privacy model (worth independent scrutiny)

1. **Secrets never reach the client.** The Blob master key lives only in
   server env; browsers get single-purpose tokens (upload: video-only, 200MB,
   10-min expiry; playback: one file, read-only, 15-min expiry). Verified:
   direct blob URL fetch returns 403.
2. **Firestore security rules are the enforcement layer**, not the UI:
   players write only their own sessions; only certified mentors read the
   pool or write comments (as themselves only); guardians read only their
   linked player; reports are write-only in-app. A modified client gains
   nothing.
3. **Anonymization is verified, not promised** — the self-audit re-detects
   faces on the app's own output before anything can upload; blur failure
   blocks upload entirely (no code path uploads raw video).
4. **Minimal surface:** camera permission only (no microphone), no tracking,
   no public video URLs, no contact vector between adults and children.

## 5. Known limitations (deliberate, documented)
- 2D single-camera proxies — players are compared to themselves over time,
  never to absolute lab numbers. No bat tracking (casting detection = v2).
- Coach *certification* is a human/organizational act (as with any league's
  background checks); the app enforces the flag, it cannot vet humans.
- Anonymity depends on video content too — filming guide tells players to
  avoid name jerseys.
- Processing takes ~2–3× clip length on-device (multiple passes). Acceptable
  for 5–10s clips; WebCodecs rewrite documented as the optimization path.
- HEVC (iPhone default) doesn't decode on some Windows browsers — handled
  with precise errors + three user fixes, not silent failure.

## 6. Verification status — what's proven vs. pending

**Proven by testing:** privacy round trip (403 on direct access; signed URLs
work); blur verified across two machines (Mac + Windows/Acer) and re-verified
by the in-app audit; engine caught real bugs via 5 filmed test clips (tempo
quantization, mid-swing clips, front-view rejection — all fixed and
re-deployed); full 3-role loop exercised end-to-end (player upload → coach
comment → parent view); role rules live-tested.

**Pending (as of Sep 27):** final threshold calibration against a labeled
deliberate-flaw dataset (filming week of Sep 28); /lab regression run over stock +
original clips; drill library v2 (researched, awaiting final approval). The
September pilot did not happen; a real pilot is framed as v2.0 work.

## 7. The review questions worth asking us
1. Does the no-raw-video claim survive code reading? (`faceblur.ts` +
   `upload/page.tsx` — look for any path that uploads before blur+audit.)
2. Are the Firestore rules actually equivalent to the stated trust model?
   (`app/firestore.rules`, ~90 lines.)
3. Is landmark quality good enough at real filming distances? (Run any clip
   through `/lab` and inspect `trackingQuality` + the skeleton replay.)
4. Do the metric definitions match their coaching claims? (`swingMetrics.ts`
   is commented per-metric; ENGINE.md §7 has the math in plain English.)
