# Submission Answers — Diamond Drive

Drafted Sep 20, 2026. Six written answers required by the CAC portal (RESEARCH.md).
**Status: drafts.** Answers 3 and 5 need your own words — the bracketed spots are the
only places I couldn't write for you. Nothing here claims a pilot or real users.
Check the portal for per-answer character limits before pasting.

---

## 1. Title

**Diamond Drive**

---

## 2. Purpose

Diamond Drive gives kids who can't afford private coaching pro-level baseball
swing analysis on any phone, with privacy built in.

A player films a swing on a phone. Before anything leaves the device, the app
detects and pixelates every face in the video, then re-scans its own output to
confirm the faces are gone — if it can't confirm, the upload is blocked. It then
tracks 33 body landmarks through the swing and measures six biomechanical
metrics: whether the hips fire before the shoulders, tempo, head drift after front-foot plant, stride length, front-knee brace, and
shoulder tilt. The player gets plain-English coaching and specific drills, and
can watch their numbers trend over time. A layer of certified volunteer
coaches — who see swings but never the player's identity, and who have no way to
message a child — can leave timestamped feedback, with a guardian able to see
every interaction.

Travel ball and private lessons run $3,000–$10,000 a year. Kids without that
money don't get worse at baseball; they just stop getting feedback. This is the
feedback, for free.

---

## 3. Inspiration

[YOUR STORY — 2–3 sentences, first person, concrete. The strongest version names
a specific moment: a teammate who couldn't afford lessons, a cost you saw your
own family weigh, a coach you only got access to because of money. Judges
remember the specific thing, not the statistic.]

The problem is structural: coaching quality has been quietly paywalled. A swing
flaw a paid instructor spots in one session can go uncorrected for years if
nobody is watching. Meanwhile every kid already carries a camera good enough to
measure that flaw — the analysis just cost money nobody would spend on software
for eight-year-olds.

I also built it for a district represented by the House's lead data-privacy
legislator, and that shaped the engineering. An app that asks kids to film
themselves has to earn that. So the anonymization runs on the phone, before
upload, and the app verifies its own work rather than promising.

---

## 4. Technical difficulty faced, and how I solved it

The hard part wasn't detecting a body — a pretrained model does that. It was
learning that a computer-vision system will hand you confident, precise,
completely wrong numbers, and that catching those is the actual engineering.

I filmed five test clips and ran them through a tuning bench I built (`/lab`).
Four failures came out. Tempo read exactly `0.00s` on every swing — I was
sampling at 20 fps, a 50 ms clock, against a swing that lasts about 150 ms. A
clip that started mid-swing got cheerfully coached instead of rejected. A
front-facing video produced a 70° "shoulder tilt" that doesn't physically exist;
the model can't see depth, so a shoulder rotating toward the camera looks like a
shoulder dipping. And a swing I knew was fine got flagged "too long," because my
threshold was tighter than real hitting.

The fixes were structural rather than patches: sample at 60 fps; add degenerate-
swing guards so a clip without a detectable launch, plant, and contact is
rejected; add a camera-angle gate that computes shoulder-width over body-height
and **refuses to analyze** a video shot from the front instead of measuring it
wrong; and re-fit thresholds against measured data anchored to published youth
biomechanics (Escamilla 2009) rather than my assumptions.

The deeper fix is a design rule I applied everywhere: **refuse rather than guess.**
The quality gate rejects unusable video. The anonymization pipeline re-runs face
detection on its own blurred output and re-blurs at a larger radius if it finds
anything; if it can't verify, it reports "unverified" instead of claiming
success, and nothing uploads. A system that tells a kid "I can't read this clip"
is worth more than one that invents a number.

Normalizing every measurement to the player's in-frame body height solved a
subtler problem: camera distance cancels out, so the app needs no calibration
step a kid would get wrong.

---

## 5. Biggest takeaway

[YOUR WORDS — one honest paragraph. Some true directions from the build, pick
whichever is actually yours:]

- Measuring something is much harder than detecting it. Getting a skeleton on
  screen took an afternoon; turning those coordinates into a number a coach
  would agree with took weeks, and most of that was learning how it fails.
- Trust is an engineering constraint, not a policy page. "No raw video leaves
  the phone" had to be true in the data flow — verified by the app itself and
  enforced in database rules — or it was just a sentence.
- Knowing the sport was the advantage. I found every real bug by looking at
  output and thinking *that's not what that swing did.* Nobody who doesn't hit
  would have caught the front-view tilt.

---

## 6. What I'd change in version 2.0

**Skill Card.** The metrics the app already stores become a shareable, verified
profile — rotation-speed trend, consistency, improvement rate — that a kid can
send to a school or select-team coach. Talent visibility without paying for a
showcase. Right now cost gates being *seen*, not just being coached.

**Bat tracking.** The engine measures the body, not the barrel, so it can't yet
detect casting or swing plane — the two things every hitting coach mentions
first. That needs object tracking on top of pose.

**Real depth.** Two-camera or depth-camera capture would replace the 2D proxies
with true three-dimensional rotation, turning "compare yourself to yourself"
into numbers comparable across players.

**Speed.** Analysis currently runs 2–3× clip length because the pipeline makes
several passes over the video with the standard browser decoder. Rewriting it on
WebCodecs would make it near-instant on a phone.

**A real pilot.** The layer I most want to test is the human one — a league's
worth of players and certified volunteer coaches actually using the review
queue — because the equity queue and the anonymity model are designed to survive
that and have only been exercised by me.

**Other sports.** The pipeline is sport-agnostic: pose in, sport-specific
biomechanics out. Softball is nearly free; pitching, tennis, and golf follow the
same shape.
