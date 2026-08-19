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

## 2. Pipeline overview

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

## 3. Extraction (`lib/poseExtract.ts`)

- Samples at up to **60 fps** (was 20 — see §7 for why that failed).
- Each frame stores 33 landmarks as `{x, y, v}`: x/y are **normalized 0–1**
  (fraction of frame size), `v` is the model's confidence the point is visible.
- Coordinates rounded to 4 decimals; capped at 15 s — keeps the stored series
  well under Firestore's 1 MB document limit.

## 4. The quality gate (`analyzeSwing`, top of `lib/swingMetrics.ts`)

Principle: **never issue confident coaching on input the math can't trust.**
Every rejection tells the user how to fix the filming.

| Check | Rejects when | Message theme |
|---|---|---|
| Frame count | < 12 tracked frames | "couldn't track a person" |
| Ankle visibility | mean < 0.45 | "feet aren't in frame" |
| Overall visibility | mean < 0.5 | "lighting too poor / backlit" |
| Body size | body height < 10% of frame | "too far from camera" |
| **Camera angle** | shoulder-width ÷ body-height > 0.22 | "film from the SIDE" |
| Swing position | swing at clip start / clip ends at contact / < 2 frames across swing | "start recording before you swing" |

The camera-angle check exists because side-view math applied to a front-facing
video produces *confident nonsense* (our Front.MOV test measured a fake 70°
shoulder tilt). Facing the camera spreads the shoulders horizontally; a side
view stacks them — the ratio separates the two.

## 5. Finding the swing

A clip is mostly standing around plus ~0.5 s of action. The engine finds the
action by **hand speed**:

1. Wrist position per frame (whichever wrist the model sees better)
2. Speed = distance moved ÷ time, in **body-heights per second** (see §6)
3. **Peak speed ≈ contact** (`swingPeak`)
4. Walk backwards until speed < 15% of peak → **launch** (`swingStart`)
5. **Front-foot plant** (`footPlant`): the front ankle's own speed spikes
   during the stride, then drops as the foot lands — plant = first frame after
   the ankle's speed peak where it falls below 25% of that peak

Front leg / swing direction are inferred from which way the hips travel.

## 6. The ruler: body-height normalization

Raw pixel distances depend on how far the camera stands. Every distance in the
engine is divided by the batter's **in-frame body height** (shoulder-mid to
ankle-mid), so "head moved 8% of body height" means the same thing filmed from
3 m or 6 m. This is why the app has no calibration step and no required
filming distance.

## 7. The seven metrics

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
from one camera, not lab values (see §9).

## 8. Findings & thresholds

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

## 9. Honest limitations (say these proudly)

- **2D, one camera**: angles are projections; absolute values shift with
  camera placement. We compare users to themselves over time, not to lab data.
- **No bat tracking**: MediaPipe tracks bodies. Casting/bat-drag detection
  needs bat tracking → documented 2.0 feature, not faked.
- **Front-view metrics** (stepping in the bucket) need the second camera angle
  → 2.0.
- **Youth ≠ small adults** (Escamilla): thresholds deliberately gentler than
  pro numbers.

## 10. Calibration war stories (the "technical difficulty" essay material)

Testing on our own 5 clips exposed four real bugs, all fixed:
1. **`tempo: 0`** — 20 fps sampling = 50 ms clock ticks vs a 150 ms swing.
   Fix: 60 fps sampling.
2. **Confident nonsense on a truncated clip** — a clip starting mid-swing got
   coached instead of rejected. Fix: degenerate-swing guards.
3. **Front-view fake numbers** — 70° "tilt" measured on a front-facing video.
   Fix: the camera-angle gate.
4. **Real swing flagged "long"** — threshold was tighter than reality. Fix:
   widened from our measured data.

Validation methodology (in progress): free-license stock clips (Mixkit,
Internet Archive) for robustness against stranger footage; next, a
**self-built labeled mini-dataset** — deliberate-flaw swings where the correct
verdict is known before analysis — because no public labeled baseball-swing
dataset exists (golf has GolfDB; baseball doesn't).

## 11. File map

| File | Role |
|---|---|
| `app/src/lib/poseExtract.ts` | video → landmark time series |
| `app/src/lib/swingMetrics.ts` | gate + swing detection + metrics + findings (`T` = all thresholds) |
| `app/src/lib/drills.ts` | drill library, flaw-mapped |
| `app/src/lib/faceblur.ts` | anonymization pipeline (runs before the engine) |
| `app/src/app/upload/page.tsx` | orchestrates blur → analyze → gate → upload → save |
| `app/src/app/analysis/[id]/page.tsx` | replay: skeleton overlay + tiles + coaching |
| `app/src/app/lab/page.tsx` | tuning bench (batch-analyze clips, raw numbers) |

## 12. Glossary (interview prep)

- **Landmark**: one tracked body point (33 per frame)
- **Kinematic sequence**: energy order hips→torso→arms; the engine measures it
  as the time gap between rotation-speed peaks
- **Normalization**: dividing by body height so camera distance cancels out
- **Proxy metric**: an honest 2D stand-in for a quantity that truly needs 3D
- **Quality gate**: refusing to analyze what can't be analyzed correctly
- **WebAssembly (WASM)**: compiled code browsers run at near-native speed — how
  CNN inference happens in a web page with no server
