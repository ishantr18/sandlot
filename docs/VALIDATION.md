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
| **Good / corrected** (no major false alarm) | 10 | 10 | 8 | **2 / 10** |

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

1. **Hip–shoulder separation gives false alarms on good swings (5 of 10).** From the side,
   the two hips overlap, so the angle of the "hip line" is mostly noise. This needs a new
   definition, e.g. rotation estimated from how wide the hips and shoulders *appear*, or
   switching this metric off until then. **Decision needed.**
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
