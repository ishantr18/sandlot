# The Swing Engine — technical documentation

How Diamond Drive turns a phone video into coaching. This is both the judge-facing
technical explainer and the study guide for the submission interview.

---

## 1. What kind of AI this is (and isn't)

**No LLMs run in this app.** The AI in Diamond Drive is **computer vision**:
convolutional neural networks that look at pixels and output body coordinates.
(An LLM — Claude — was used as a *development tool* to write and debug code;
that's disclosed in `AI_USAGE_LOG.md` and is a different thing from the app's
own intelligence.)

Two on-device models, both from Google's **MediaPipe** (free, open,
industry-standard), running as **WebAssembly** in the browser:

| Model | File (ships with our app) | Job |
|---|---|---|
| Pose Landmarker (BlazePose, lite) | `public/mediapipe/pose_landmarker_lite.task` (5.5 MB) | 33 body landmarks per video frame |
| Face Detector (BlazeFace short-range) | `public/mediapipe/blaze_face_short_range.tflite` (224 KB) | Face boxes for the anonymization pipeline |

Key architectural fact: **everything runs on the user's device.** The models are
served from our own domain, inference happens in the browser, and only *numbers*
(landmark series, metrics) plus the anonymized video ever reach the cloud.
Privacy isn't a policy here; it's the data flow.

## 2. How the computer vision was built

The honest engineering answer, in two halves: what we built on, and what we built.

### 2a. The pretrained backbone (what we did NOT build)

We did **not** train a neural network. BlazePose — the pose model — was trained
by Google on enormous labeled datasets (millions of images of humans with
hand-marked body points) using compute far beyond any student project. Training
our own would have needed a labeled dataset that doesn't exist for baseball
(see §11), months of GPU time, and would have produced a worse model.

Using a pretrained model is not a shortcut — it's how professional CV products
are built (the same way real apps don't write their own operating system).
The skill being judged is what you build *on top of* the model.

How the model itself works, in plain terms:
- A **convolutional neural network (CNN)** scans the image with small learned
  filters. Early layers detect edges and textures; deeper layers combine those
  into "elbow-like" and "knee-like" patterns — the network learned these
  patterns from its training data, nobody programmed them.
- BlazePose runs **two stages**: a fast detector finds *where the person is*,
  then a landmark network looks only at that region and regresses **33 body
  points**, each with x, y and a **confidence score** (how sure it is the
  point is really visible).
- In VIDEO mode it also **tracks** between frames — using the previous frame's
  result to stay fast and stable instead of re-detecting from scratch.

### 2b. The CV system we DID build

The model outputs dots. Everything decided from those dots is ours:

1. **On-device deployment** — models ship from our own domain and run as
   WebAssembly in the page. No cloud inference, no Google servers at runtime.
   This choice IS the privacy architecture.
2. **The frame-feeding pipeline** — video decoded through hidden `<video>` +
   canvas elements; frames sampled at up to 60 fps; the model demands strictly
   increasing timestamps, so we maintain a monotonic clock (`nextTs()`).
3. **Two-model fusion** (`faceblur.ts`) — face detector *and* pose model both
   vote on where heads are; the union of their boxes drives the pixelation.
   One model's blind spot (small faces at distance) is covered by the other.
4. **The temporal layer** — a CNN sees one frame at a time; a swing is a
   *sequence*. We turn per-frame dots into time series, smooth them (3-point
   moving average), differentiate them (angular velocity of hip and shoulder
   lines), and detect events in them (contact = hand-speed peak; launch =
   walk-back to 15% of peak; foot plant = front-ankle speed collapse).
   **This temporal reasoning is the core of the swing engine and is entirely
   original code** (`swingMetrics.ts`).
5. **Normalization** — dividing all distances by in-frame body height so the
   same swing measures the same from any camera distance (see §7).
6. **Confidence-aware logic** — the model's per-point confidence scores drive
   the quality gate (feet not visible? lighting bad?) and choices like "use
   whichever wrist the model sees better."
7. **Verification loops** — the anonymization self-audit re-runs the face
   detector on our own output to *prove* the blur worked; the camera-angle
   check rejects geometry the math can't handle.
8. **Calibration against reality** — thresholds fitted from our own filmed
   clips + published biomechanics, with every bug found by testing on real
   video (see §11).

One-sentence version for the interview: *"Google's model tells us where the
body is; every baseball question — when the swing happens, whether the hips
fire first, whether to trust the clip at all — is answered by code we wrote
and calibrated ourselves."*

## 3. Pipeline overview

```
video file (already face-anonymized by lib/faceblur.ts)
   │
   ▼  lib/poseExtract.ts
[EXTRACTION]  video plays invisibly → Pose Landmarker on each frame (≤60fps)
   │          → time series: [{t, lm: 33×{x, y, v}}, ...]
   ▼  lib/swingMetrics.ts
[QUALITY GATE]  6 checks — reject bad input with actionable advice
   │
[SWING DETECTION]  find the swing inside the clip via hand speed
   │
[METRICS]  7 numbers, all normalized to body height
   │
[FINDINGS]  thresholds → plain-English coaching cards → drill IDs
   ▼
session record (Firestore): landmarks + metrics + findings
   ▼  app/analysis/[id]/page.tsx
[REPLAY]  skeleton overlay drawn from STORED series, synced to video scrubbing
```

## 4. Extraction (`lib/poseExtract.ts`)

**Two-pass deterministic seeking (v3 — Sep 20).** v1 played the clip at 1× and
kept whatever frames `requestAnimationFrame` happened to land on, which made
the real sample rate a property of the *device*: a 30 Hz display or a busy
phone silently sampled at ~30 fps or less — the exact condition behind the
original `tempo: 0` bug (§11). It also took as long as the clip and discarded
everything past 15 s, so a swing at 0:20 didn't exist.

v3 seeks to explicit timestamps instead:
- **Pass 1 — coarse:** 12 fps across the whole clip (up to 60 s) to *locate*
  the swing via peak wrist speed, measured in torso-lengths/sec so "fast" is
  relative to the player, not the frame.
- **Pass 2 — fine:** 60 fps across a −1.2 s/+0.8 s window around that peak to
  *measure* it.
- Each frame is keyed by the timestamp that **actually decoded**
  (`requestVideoFrameCallback`'s `mediaTime`), so asking a 30 fps video for
  60 fps yields 30 honest frames instead of 60, half of them duplicates with
  zero displacement — which would corrupt every speed calculation.
- Falls back to the `seeked` event where `requestVideoFrameCallback` is
  missing; a stalled seek times out at 2.5 s rather than hanging the upload.
- Each frame stores 33 landmarks as `{x, y, v}`: x/y are **normalized 0–1**
  (fraction of frame size), `v` is the model's confidence the point is visible.
- Coordinates rounded to 4 decimals; hard cap of 460 frames, thinning outside
  the swing window first — the stored series stays well inside Firestore's
  1 MB document limit no matter how long the clip is (v1 only capped seconds,
  which was a gamble).

## 5. The quality gate (`analyzeSwing`, top of `lib/swingMetrics.ts`)

Principle: **never issue confident coaching on input the math can't trust.**
Every rejection tells the user how to fix the filming.

| Check | Rejects when | Message theme |
|---|---|---|
| Frame count | < 12 tracked frames | "couldn't track a person" |
| Core visibility | mean < 0.5 over head/shoulders/hips/wrists | "lighting too poor / backlit" |
| Body size | body height < 10% of frame | "too far from camera" |
| **Camera angle** | shoulder-width ÷ body-height > 0.22 | "film from the SIDE" |
| Swing position | swing at clip start / clip ends at contact / < 2 frames across swing | "start recording before you swing" |

**Partial coverage instead of rejection (v3).** Feet out of frame used to
reject the whole clip. It no longer does: four of the seven metrics (sequence
gap, separation, tempo, shoulder tilt) never touch the lower body. When the
ankles aren't reliable the engine reports `coverage: "upper-body"`, measures
what it can, and returns `null` — never `0` — for head drift, stride and knee
brace, with a finding naming exactly what was skipped and how to film for a
full read. Two supporting changes make that safe:
- **Core visibility** replaced the mean over all 33 landmarks. Averaging every
  point punished a clip for feet that were merely out of frame, and rejected a
  readable upper body with a "bad lighting" message that wasn't true.
- **The ruler falls back** from shoulder→ankle to torso ÷ 0.38 (standing
  proportions), so hand speed still has a body-relative scale.
- **Front-side detection falls back** ankles → knees → hips, and returns
  "unknown" if none can separate the sides. That matters: guessing wrong flips
  the sign of the shoulder-tilt calculation and would report a collapsed back
  shoulder as perfectly level.

The camera-angle check exists because side-view math applied to a front-facing
video produces *confident nonsense* (our Front.MOV test measured a fake 70°
shoulder tilt). Facing the camera spreads the shoulders horizontally; a side
view stacks them — the ratio separates the two.

## 6. Finding the swing

A clip is mostly standing around plus ~0.5 s of action. The engine finds the
action by **hand speed**:

1. Wrist position per frame (whichever wrist the model sees better)
2. Speed = distance moved ÷ time, in **body-heights per second** (see §7)
3. **Peak speed ≈ contact** (`swingPeak`)
4. Walk backwards until speed < 15% of peak → **launch** (`swingStart`)
5. **Front-foot plant** (`footPlant`): the front ankle's own speed spikes
   during the stride, then drops as the foot lands — plant = first frame after
   the ankle's speed peak where it falls below 25% of that peak

Front leg / swing direction are inferred from which way the hips travel.

## 7. The ruler: body-height normalization

Raw pixel distances depend on how far the camera stands. Every distance in the
engine is divided by the batter's **in-frame body height** (shoulder-mid to
ankle-mid), so "head moved 8% of body height" means the same thing filmed from
3 m or 6 m. This is why the app has no calibration step and no required
filming distance.

## 8. The seven metrics

| Metric | How it's computed | Coaching meaning |
|---|---|---|
| **Sequence gap (ms)** ⭐ | Angular speed of hip line and shoulder line (frame-to-frame change of each line's angle, smoothed); gap = time between hip-rotation peak and shoulder-rotation peak | The kinematic sequence — hips must fire first. Positive gap = body swing; ≤0 = arm swing. The single most diagnostic number in hitting research |
| Hip–shoulder separation (°) | Max angle difference between shoulder line and hip line before contact | The "rubber band" load |
| Tempo (s) | `swingPeak − swingStart` | Rushed vs. long swing |
| Head drift (%) | Nose travel **after foot plant**, ÷ body height | The coaching definition of lunging ("land, then turn") |
| Stride (%) | Max ankle spread ÷ body height in the swing window | Base width |
| Front-knee brace (°) | Hip–knee–ankle interior angle of the front leg at contact | ~180° = braced post (power transfers); bent = power leak |
| Shoulder tilt (°) | Back-shoulder dip below front shoulder at launch | Backside collapse / uppercut warning |

All formulas are 2D **side-view proxies** — honest approximations measurable
from one camera, not lab values (see §10).

## 9. Findings & thresholds

`buildFindings()` compares each metric to thresholds in the exported `T`
constant and emits severity-ranked cards (🔴 major → 🟡 minor → 🟢 good),
worst first, each carrying drill IDs from `lib/drills.ts`.

Threshold sources, in priority order:
1. **Our own filmed clips** (`test-clips/`) — what the camera actually measures
   under app conditions
2. **Published biomechanics** — Escamilla et al. 2009 (*J. Applied
   Biomechanics*): documented hips→torso→hands sequencing; peak torso angular
   velocity 857°/s (adults) vs 717°/s (youth); lead-knee extension range 59°
   vs 32° — independent validation that knee brace separates skill levels, and
   evidence that youth get *gentler* thresholds than pros
3. **Coaching literature** — Driveline, Improve Your Hitting, Hardball
   Mechanics flaw taxonomies (which flaws exist and matter)

Status: **provisional** — final fit happens after the labeled mini-dataset
(deliberate-flaw swings) is filmed and run through `/lab`.

## 10. Honest limitations (say these proudly)

- **2D, one camera**: angles are projections; absolute values shift with
  camera placement. We compare users to themselves over time, not to lab data.
- **No bat tracking**: MediaPipe tracks bodies. Casting/bat-drag detection
  needs bat tracking → documented 2.0 feature, not faked.
- **Front-view metrics** (stepping in the bucket) need the second camera angle
  → 2.0.
- **Youth ≠ small adults** (Escamilla): thresholds deliberately gentler than
  pro numbers.

## 11. Calibration war stories (the "technical difficulty" essay material)

Testing on our own 5 clips exposed four real bugs, all fixed:
1. **`tempo: 0`** — 20 fps sampling = 50 ms clock ticks vs a 150 ms swing.
   Fix: 60 fps sampling.
2. **Confident nonsense on a truncated clip** — a clip starting mid-swing got
   coached instead of rejected. Fix: degenerate-swing guards.
3. **Front-view fake numbers** — 70° "tilt" measured on a front-facing video.
   Fix: the camera-angle gate.
4. **Real swing flagged "long"** — threshold was tighter than reality. Fix:
   widened from our measured data.

5. **Whole clips thrown away for one missing body part** — a clip with the
   feet cropped was rejected outright even though the flagship metric (the
   kinematic sequence) only needs hips and shoulders. Fix: per-metric
   coverage, `null` instead of `0`, and the gate reworded to judge core
   landmarks only. Same rule as everywhere else — refuse the *measurement*
   you can't trust, not the whole video.

Validation methodology (in progress): free-license stock clips (Mixkit,
Internet Archive) for robustness against stranger footage; next, a
**self-built labeled mini-dataset** — deliberate-flaw swings where the correct
verdict is known before analysis — because no public labeled baseball-swing
dataset exists (golf has GolfDB; baseball doesn't).

## 11b. Engine v4 + web validation (Sep 27)

Web validation (docs/VALIDATION.md) ran 36 coach-labelled swings from YouTube
through the real engine. It exposed, and v4 fixed:
6. **Follow-through mistaken for the swing** — the per-frame "better-seen wrist"
   flip-flopped between two wrists a forearm apart; at 60 fps each flip read as
   the fastest motion in the clip. Fix: hands = wrist midpoint; speed measured
   over ±30 ms (central difference); points averaged over ±25 ms; left/right
   label swaps repaired by motion continuity; swing = the burst with the most
   hand TRAVEL, not the single fastest frame (`findBursts`, also used by the
   extractor to aim the 60 fps window).
7. **Stride measured stance width** — no-stride hitters scored "very wide".
   Fix: stride = front-foot travel from lift to landing.
8. **Foot plant searched only after launch** — but the stride happens in the
   load. Fix: search the full second before contact.

Still open: separation false alarms on good swings (side-view hip line is
noise), ~50% swing-timing error on edited web video. See VALIDATION.md.

## 12. File map

| File | Role |
|---|---|
| `app/src/lib/poseExtract.ts` | video → landmark time series |
| `app/src/lib/swingMetrics.ts` | gate + swing detection + metrics + findings (`T` = all thresholds) |
| `app/src/lib/drills.ts` | drill library, flaw-mapped |
| `app/src/lib/faceblur.ts` | anonymization pipeline (runs before the engine) |
| `app/src/app/upload/page.tsx` | orchestrates blur → analyze → gate → upload → save |
| `app/src/app/analysis/[id]/page.tsx` | replay: skeleton overlay + tiles + coaching |
| `app/src/app/lab/page.tsx` | tuning bench (batch-analyze clips, raw numbers) |

## 13. Glossary (interview prep)

- **Landmark**: one tracked body point (33 per frame)
- **Kinematic sequence**: energy order hips→torso→arms; the engine measures it
  as the time gap between rotation-speed peaks
- **Normalization**: dividing by body height so camera distance cancels out
- **Proxy metric**: an honest 2D stand-in for a quantity that truly needs 3D
- **Quality gate**: refusing to analyze what can't be analyzed correctly
- **WebAssembly (WASM)**: compiled code browsers run at near-native speed — how
  CNN inference happens in a web page with no server
