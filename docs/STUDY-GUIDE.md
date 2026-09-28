# Diamond Drive — Study Guide
*Everything to know cold when someone asks "how does it work?" — plus what's left.*
*(Deep engine detail lives in ENGINE.md; this is the whole-app view.)*

---

## 1. The three answers to memorize

**One sentence:** Diamond Drive gives underprivileged kids pro-level baseball
coaching on any phone — an AI swing coach with privacy engineered in, backed by
certified volunteer coaches.

**One minute:** Baseball training costs $3–10K/year, so kids without money get
less feedback, not less talent. Diamond Drive closes that gap: a kid films a
swing on any phone; the app pixelates their face on-device before anything
uploads, runs computer vision to measure seven swing mechanics, explains the
problems in plain English, and assigns free drills. Certified volunteer coaches
review anonymous swings — sorted so the least-coached kids come first — and
every word they write is visible to parents. No downloads, no app store, no
cost: it runs from a link on any device.

**Why it wins on tech (30 sec):** Two neural networks run in the browser with
no server — one finds faces to destroy them (privacy), one finds 33 body points
to analyze them (coaching). Everything the app claims, it verifies: it re-scans
its own blurred output to prove anonymity, and it refuses to analyze clips the
math can't trust.

---

## 2. AI / computer-vision concepts (know these cold)

| Concept | What it is | Where in our app |
|---|---|---|
| **Computer vision (CV)** | AI that understands images/video | The entire engine — no LLMs run in the app |
| **CNN (convolutional neural network)** | Network that scans images with learned filters; early layers see edges, deep layers see "knee-like" patterns | Inside both MediaPipe models |
| **Pretrained model** | A network someone else trained on millions of labeled examples; you build systems on top | BlazePose (33 body points) + BlazeFace (face boxes), by Google |
| **Pose estimation / landmarks** | Finding body joints in an image; a landmark = one point (x, y, confidence) | 33 per frame, the raw material of everything |
| **Inference vs training** | Training = learning from data (Google did it); inference = using the model (we do it, on-device) | Every frame processed is inference |
| **Confidence score** | The model's own "how sure am I" per point | Drives quality gate + "use the better-seen wrist" |
| **On-device AI** | Inference on the user's hardware, not a cloud server | Models ship from our domain, run as WebAssembly in the page — this IS the privacy architecture |
| **WebAssembly (WASM)** | Compiled code browsers run near-native speed | How CNNs run inside a web page |
| **Temporal analysis** | Reasoning over a *sequence* of frames (a CNN sees one at a time) | Our original code: time series → smoothing → angular velocity → event detection |
| **Event detection** | Finding moments in a signal | Contact = peak hand speed; launch = walk-back to 15%; foot plant = ankle-speed collapse |
| **Normalization** | Removing an irrelevant variable by dividing it out | All distances ÷ body height → camera distance doesn't matter, no calibration step |
| **Quality gate** | Refusing to run on input you can't trust | 6 checks; bad clips get rejected with fix-it advice, never wrong coaching |
| **Kinematic sequence** | Hips fire before shoulders (power chain) | Flagship metric: hip-rotation peak vs shoulder-rotation peak, in ms |
| **2D proxy** | An honest single-camera approximation of a 3D quantity | All 7 metrics; we compare a player to themselves, never to lab numbers |
| **Pixelation vs blur** | Mosaic *destroys* data (unrecoverable); blur smears it (research has reversed it) | Faces → 8-block mosaic. Deliberate choice, citable |
| **Two-model fusion** | Two models vote; one's blind spot covered by the other | Face detector ∪ pose head-box → what gets pixelated |
| **Self-audit / verification loop** | The system checks its own output | Re-run face detector on the blurred video; "0 faces detectable" or auto re-blur |
| **Calibration / ground truth** | Fitting thresholds to reality; ground truth = data where the right answer is known | Our filmed clips + deliberate-flaw dataset (labels known in advance) + published biomechanics (Escamilla 2009) |
| **LLM (what we did NOT use in-app)** | Language models like Claude | Used as a *development tool* (disclosed in AI_USAGE_LOG.md); zero LLMs run in the product |

## 3. Coding / engineering concepts

**Stack:** TypeScript (typed JavaScript — errors at build time, not in a kid's
hands) · React (UI as components) · Next.js (framework: pages, API routes) ·
Tailwind (styling) · Firebase (auth + Firestore database) · Vercel (hosting) ·
Vercel Blob (private video storage) · Recharts (charts) · PWA (installable web
app — no app store, which is an *equity feature*: works from a link on any
device).

| Concept | One-liner + where |
|---|---|
| **Client vs server** | Browser code anyone can read vs our API routes holding secrets. Secret storage key lives ONLY server-side |
| **Token handshake** | Browser asks our server for a short-lived, weak permission (videos-only, 200MB, 10min) instead of ever holding the real key — `/api/upload` |
| **Signed / expiring URLs** | Videos are never public; every view is a 15-minute link minted by `/api/video`. Tested: direct access = 403 |
| **Private-by-default storage** | The Blob store is locked; kids' videos have no public address at all |
| **Authentication vs authorization** | Who you are (Firebase Auth) vs what you may do (role: player/mentor/guardian) |
| **Security rules** | Server-enforced law, not UI politeness: players write only their own sessions; only *certified* coaches read/comment; guardians read only their linked player; reports are write-only. A hacked client changes nothing |
| **Roles & role-aware UI** | One app, three experiences — nav, home, and permissions all switch on the profile's role |
| **Data model** | Firestore collections: users, sessions (video path + landmarks + metrics + findings), comments, assignments, blocks, reports |
| **Denormalization** | Copying a field (playerName onto sessions) to avoid extra lookups |
| **Compensating transaction** | If step 2 fails, undo step 1 — guardian signup deletes the just-created login if the player lookup fails (we shipped the orphan bug first; this is the fix) |
| **Object URLs** | A local in-memory address for a picked file — preview & processing before anything uploads |
| **MediaRecorder / getUserMedia** | Browser camera APIs behind Record-now (3-2-1 countdown, review/retake) |
| **Codecs & containers** | MP4/WebM are boxes; H.264/HEVC/VP9 are what's inside. Machines can lie about support — we test record AND playback, and blacklist formats per-device that fail (self-healing) |
| **Graceful degradation** | When the audit can't verify, it says "unverified," never "verified"; when a clip can't be analyzed, video-only mode |
| **Small multiples** | One mini-chart per metric (different units can't share an axis); palette validated for color-blind contrast |
| **The equity queue** | Coach feed sorted by fewest-reviews-first — attention flows to whoever got the least. One sort line, the app's values in code |
| **Anonymity, asymmetric** | Coaches see "Player #7F3K" + pixelated video; players/parents see the coach's full name on everything. The vulnerable side is shielded, the powerful side is exposed |
| **Version control** | Git + private GitHub repo; committed daily — the whole build history is inspectable |

## 4. Questions judges will actually ask — with answers

- **"Did you build the AI?"** — "We use Google's pretrained pose model — like
  every professional CV product, you don't retrain the eyes. Everything decided
  *from* its output — when the swing happens, whether hips fire first, whether
  to trust the clip — is our original code, calibrated on our own footage."
- **"What was the hardest bug?"** (pick one, tell it with numbers)
  1. `tempo: 0` — 20fps sampling = 50ms clock vs a 150ms swing → 60fps
  2. A clip starting mid-swing got confident wrong coaching → degenerate guards
  3. Front-view video produced a fake 70° tilt → camera-angle detector
  4. A Windows laptop recorded videos it couldn't play back → per-device format blacklist
  5. Guardian signup orphaned accounts → compensating transaction
- **"Why should parents trust this?"** — "They don't have to trust — they can
  check. Faces are destroyed on the kid's device before upload and the app
  re-scans its own output to verify. Coaches are certified humans, identified by
  name, with no way to message a child; kids are anonymous numbers to them.
  Parents see every interaction, and the database rules — not our good
  intentions — enforce all of it."
- **"What can't it do?"** (maturity question — answer proudly) — "No bat
  tracking (casting detection needs it — that's 2.0), one camera angle only,
  and 2D proxies rather than lab values — so we compare a player to themselves
  over time, never to a pro's absolute numbers."
- **"Why a web app, not the App Store?"** — "Our users might not have their own
  phone. A link works on a shared Android, a school Chromebook, a library PC.
  No account stores, no downloads, no cost — access IS the product."
- **"What did YOU learn?"** — personal, but the arc is: testing on real
  machines finds bugs theory never will; verify claims instead of asserting
  them; safety can live in architecture instead of policy.

## 5. WHAT'S LEFT (as of Sep 27)

Full status and schedule: CHECKLIST.md (day-by-day) · FOR-DAD.md (one-page status).

- [x] Engine v3 committed; polish pass (load-error states, error pages, lint clean, /spike retired)
- [ ] **Drill library** — approve the 10 drills (user) → wire in (Claude)
- [ ] **Calibration filming** (user + Dad, ~30 min) → `/lab` runs
- [ ] **Threshold fit + validation table** (Claude, after filming) — the accuracy proof
- [ ] **Answers 3 + 5** in your own words · **portal registration** (WA-01 vs WA-02)
- [ ] **Demo video** (DEMO-SCRIPT.md) — week of Oct 5
- [ ] **SUBMIT** week of Oct 12 · deadline Mon Oct 26, 12:00pm EDT · then Exit Questionnaire
- [ ] Optional: mini-pilot (PARENT-CONSENT.md); app-store versions after submission (FOR-DAD.md)

### Study priorities before any judging conversation
1. This file, top to bottom
2. ENGINE.md §2 (how the CV was built), §6–7 (swing detection + metrics), §11 (war stories)
3. Be able to draw the pipeline from memory: film → blur (on-device) → verify → analyze (on-device) → upload → coach → parent
