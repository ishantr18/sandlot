# Engine Validation: Web Clips (Sep 27, 2026)

*How well does the swing engine catch flaws that a coach has named? Tested on real swings
from YouTube coaching videos, checked by eye, run through the real engine.*

**Bottom line:** the engine reliably catches **lunging, no-stride, and a soft front knee**
when it can time the swing. It is **not yet trustworthy on good swings**: the
hip–shoulder separation metric raises false alarms, and it times about half the swings
wrong. The engine is honest about many of its limits (it refuses clips it can't read), but
those two problems need fixing before we claim accuracy in the submission.

---

## Method

1. **Find labeled swings.** A research pass collected 34 YouTube clips where a hitting coach
   names a flaw (or calls a swing corrected), filmed roughly from the side.
2. **Check every clip by eye.** Contact sheets for all 33 downloaded clips were inspected
   for camera angle, real-time vs slow-motion, and the exact contact time of each swing.
   **Only 12 clips survived.** The rest were posed or slow demos, slow-motion (including
   *every* pro/MLB clip), front or oblique views, split-screens, or panning fan video. One
   "McGwire" clip was actually a recreational hitter filmed from the front.
3. **Cut one clip per swing** (1.8 s before contact → 1.2 s after), giving **36 labeled
   swings, 28 of them distinct** (one lesson video carries three flaw labels).
4. **Run the real engine.** A headless-Chrome runner feeds each clip through the app's own
   `/lab` page, so it uses exactly the same code a phone runs.
5. **Score direction-aware.** A no-stride swing counts as caught only if the engine calls
   the stride too *short*. Getting flagged for the opposite reason is a miss.

Tools (kept out of git with the clips, in `test-clips/web/`): `run.mjs` (runner),
`segment.mjs` / `segment2.mts` (swing finder), `evaluate.mts` (scorer),
`annotations.json` (ground truth), `validation.json` (every result).

## Results

| Coach's label | Swings | Analyzed | Swing timed right (±0.25 s) | Engine agrees |
|---|---|---|---|---|
| Lunge (head drifts forward) | 12 | 11 | 4 | **7 / 12** |
| No stride | 3 | 3 | 3 | **3 / 3** |
| Soft / buckled front knee | 6 | 4 | 1 | **4 / 6** (both independent swings rejected) |
| Low separation ("lack of rotation") | 4 | 4 | 1 | 3 / 4 *(same 4 swings as the lunge video, weak label)* |
| Back-side collapse | 1 | 1 | 1 | 1 / 1 *(drop not confirmed by eye)* |
| No hip lead (sequence) | 0 | — | — | *no usable clip found* |
| **Good / corrected** (no major false alarm) | 10 | 10 | 8 | 2 / 10 → **6 / 10** with separation switched off |

Our own 4 side-view shadow-swing clips: all analyzed after the v4 fixes (3 of 4 were
rejected before). Side_good2 is still timed on the post-swing recoil (the model loses the
wrists to motion blur in a no-bat swing).

## What this found, and what was fixed (engine v4)

| Problem found | Fix | Result |
|---|---|---|
| Your own good clips rejected: swing found in the follow-through | Swing = the burst where the hands travel furthest (midpoint of both wrists), measured over ±30 ms; left/right label swaps repaired; points averaged over ±25 ms | 4/4 own side-view clips analyzed |
| "Stride" measured stance width: every no-stride hitter scored as a "very wide stride" | Stride = how far the front foot moves from lift to landing | No-stride 0/3 → **3/3** |
| Foot plant searched only after launch, so the stride (which happens in the load) was missed | Search the full second before contact for the step | Lunge 4/12 → **7/12** |

## Still broken (next steps, in priority order)

1. **Hip–shoulder separation gave false alarms on good swings (5 of 10).** From the side,
   the two hips overlap, so the angle of the "hip line" is mostly noise. **Decision
   (Sep 27): switched off.** It's still computed and stored (`DISABLED_METRICS` in
   `swingMetrics.ts`), but players no longer see its tile, chart, or coaching. That
   includes old sessions. Redesign idea for later: estimate rotation from how wide the hips
   and shoulders *appear*. The remaining false alarms on good swings are head drift (3)
   and knee (1).
2. **Swing timing is wrong for about half the web swings,** usually 0.2–0.5 s early. Part
   of that is the videos (lesson edits jump from one swing straight to the next), and part
   is the engine picking the load or an earlier motion.
3. **Head-drift false alarms on 3 "corrected" swings.** These may be real (the coach said
   "better," not "perfect"), but they need a look.
4. **Coverage gaps:** no real-time pro swings, no labeled no-hip-lead swing, and one
   back-side-collapse swing. Our own deliberate-flaw filming session (CHECKLIST) is still
   the best way to fill these. There the correct answer is known before recording.

## Honest caveats
- Most labeled hitters are **adult slow-pitch softball** players, not youth baseball.
- Contact times come from 10 fps contact sheets (±0.2 s).
- These are YouTube videos used for private testing only. They are not redistributed and
  not in the submission.
- 28 distinct swings is a small sample. Treat the percentages as a direction, not a
  guarantee.

---

## Update — Oct 3: engine v5 (3D rotation) and face blur v2

### Swing engine v5
BlazePose also *infers* depth for every point. Seen from above (sideways vs depth), the hip
line's angle is the hips' real turn — the 2D line angle we used before is noise from the
side, which is why separation was switched off and the old sequence gap read 0–534 ms.

| Coach's label | v4 | **v5** |
|---|---|---|
| Lunge caught | 7 / 12 | **10 / 12** (12/12 analyzed) |
| "Lack of rotation" caught | — | **4 / 4** via the new **hip turn** metric (8–25° vs 46–71° on most good swings) |
| No stride · soft knee · back-side collapse | 3/3 · 4/4 · 1/1 | 3/3 · 4/4 · 1/1 |
| Good swings, no major false alarm | 6 / 10 | 4 / 10 |

- **Hips-before-shoulders** is now measured in 3D with a sub-frame peak fit, and only on
  clips filmed at ≥45 fps (30 fps frames are as far apart as the gap itself). It reads near
  0 ms on our clips, so its warnings are capped at "minor" until the calibration filming
  (no-hips ×2, at 60 fps) validates it.
- **Still weak:** head drift (lunge) — lunge and good swings overlap (2–23% vs 2–65%), so
  no threshold separates them on this data; knee readings overlap too. Not tuned to these
  labels on purpose (adult softball, "corrected" swings) — the calibration filming is the fix.
- Separation stays off (3D separation reads near 0°).

### Face blur v2 (independent judge: OpenCV YuNet, a different model)
| Test clip | Faces left uncovered, v1 → **v2** |
|---|---|
| Batting practice (dugout players) | 213 → **30** |
| Fan crowd | 462 → **21** |
| MLB broadcast crowds | 1,947 / 3,502 / 633 → **1,111 / 1,647 / 236** |
| Coach demo · player turned away | 26 → **0** · 11 → **0** |

Fixes: frame-stepped scan, zoomed 2×2 + 3×3 tiles, full-range face model, heads of up to 5
people incl. turned away, output length check (2/13 v1 outputs were 0.28 s yet "verified"),
2 fps self-check that ignores already-pixelated areas, and **upload blocked if a face
survives both passes**. Remaining gap: dense stadium crowds. Tools: `test-clips/blur/`.

---

## Update — Oct 9: crop-and-zoom pose, independent face check

### Pose extraction: model size × crop-and-zoom (41 clips, `test-clips/web/exp/compare.mts`)
| Setting | Jitter (lower = steadier) | Swing timed right | Good swings, no false alarm | Time/clip |
|---|---|---|---|---|
| Lite, full frame (was live) | 10.3‰ | 16 / 29 | 4 / 10 | 4.3 s |
| Lite + crop | 2.9‰ | 13 / 26 | 3 / 6 | 4.0 s |
| **Full + crop (now live)** | **3.2‰** | **21 / 29** | **6 / 10** | 4.6 s |
| Heavy + crop | 2.5‰ | 16 / 28 | 4 / 7 | 31.8 s |

Crop-and-zoom: after the coarse pass finds the player, the 60 fps swing pass runs on a crop
around them scaled to ≥640 px tall — about 3× steadier points. The heavy model was 7×
slower for no accuracy gain. Quality-gate ideas tested and **not** added: "more than one
swing" rejected 3 good clips; "lost the player during the swing" never triggered.

### Face blur: independent self-check
The app's final check now also runs **YuNet** (OpenCV, MIT license) through ONNX Runtime
Web — a different network from the BlazeFace models that find the faces. Judged by a
**third** model, **SCRFD** (InsightFace), on the 13 clips:
- Every clip the app lets upload has **0 visible faces** (both own clips + 5 single-player clips).
- Every clip with a visible face is **blocked** (batting practice, fan crowd, 3 broadcasts).
- 2 false blocks (coach demo, netting) — the safe direction.
