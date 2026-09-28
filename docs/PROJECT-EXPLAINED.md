# Diamond Drive, Explained in Plain English

*Written Sep 27, 2026. What the app is, how its AI works, what's been built, and what's left.
No coding knowledge needed. For deeper detail: ENGINE.md (the AI) and TECHNICAL-OVERVIEW.md (the architecture).*

---

## 1. The app in one paragraph

Private baseball lessons and travel teams cost $3,000–$10,000 a year. Kids who can't pay
don't get less talented, they just stop getting feedback. Diamond Drive is a free app where
a kid films a swing on any phone. The app hides their face before the video goes anywhere,
watches the swing with computer vision, explains what went wrong in plain English, and
gives them drills to fix it. Volunteer coaches can review swings without ever learning who
the kid is, and parents can see everything.

---

## 2. The AI inside the app: computer vision, not a chatbot

When people hear "AI" today they think of ChatGPT or Claude, which are **large language
models (LLMs)** that read and write text. **Diamond Drive has no LLM in it.** Its AI is
**computer vision**: software that looks at pictures and works out what's in them.

### The two AI models it uses

Both come from Google's free, open-source **MediaPipe** toolkit. We didn't train them.
Google trained them on millions of labeled photos. We use them the way a carpenter uses a
power drill: we don't build the tool, we build the house with it.

| Model | What it does | Analogy |
|---|---|---|
| **BlazeFace** (224 KB) | Draws a box around every face in a video frame | A security guard who spots faces in a crowd |
| **BlazePose** (5.5 MB) | Finds **33 points on the body** in every frame (shoulders, elbows, wrists, hips, knees, ankles, nose, ears…) | Putting dots on a player like a motion-capture suit, without the suit |

### How a model "sees" (the short version)

Both are **convolutional neural networks (CNNs)**. A CNN slides thousands of tiny learned
filters across an image. The first layers notice simple things like edges and color
changes. Later layers combine those into shapes, and the deepest layers recognize things
like "this is a knee." Nobody programmed "what a knee looks like." The network learned it
from examples.

For each of the 33 body points, BlazePose returns a position plus a **confidence score**,
its own guess of how sure it is. Our app uses those scores constantly, for example to reject
a clip where the feet are cut off.

### The big design decision: the AI runs *on the phone*

Most apps send your video to a company's computer ("the cloud") to be analyzed. Diamond
Drive doesn't. Both models are downloaded into the web page and run **on the kid's own
device**, using a technology called **WebAssembly** that lets a browser run heavy code fast.

That's what makes the privacy promise real. **The original, un-blurred video never leaves
the phone.** The cloud only ever receives the face-hidden video and a list of numbers.

---

## 3. What we built on top of the AI (the original work)

Google's model only gives you dots. Every baseball decision is made by code written for this
project. That's the part judges care about.

### A. Face hiding (privacy pipeline): `faceblur.ts`
1. **Scan:** both models look for heads. The face detector finds faces, and the pose model
   finds the head from the ears and nose. Using both covers each one's blind spots (like
   a small face far from the camera).
2. **Pixelate:** each face becomes a chunky 8-block mosaic. We chose pixelation over blur
   on purpose, because researchers have shown blur can sometimes be reversed and a mosaic
   can't.
3. **Self-check:** the app runs the face detector *again on its own output*. If it still
   finds a face, it re-hides it with a bigger box and checks again. If it can't confirm the
   face is gone, it says so and **won't upload**. The app proves its own work instead of
   just promising.
4. Sound is removed too, since voices can identify people.

### B. The swing engine: `poseExtract.ts` + `swingMetrics.ts`
1. **Collect dots over time.** A CNN looks at one frame at a time, but a swing is a
   *movement*. The engine samples the video up to **60 times per second** and turns the
   dots into timelines (where the left hip was at 0.00s, 0.017s, 0.033s…).
2. **Quality gate: refuse instead of guessing.** Before measuring anything, it checks the
   clip. Is a person tracked? Is the lighting OK? Is the player big enough in frame? Was it
   filmed from the **side**? A front-facing video gets rejected, because depth can't be
   measured from the front and the numbers would be wrong. Every rejection tells the kid
   how to film it better.
3. **Find the swing inside the clip.** Contact = the moment the hands move fastest. Launch =
   when the hands start speeding up. Foot plant = when the front ankle stops moving.
4. **Measure seven things**, the same ones a hitting coach watches:

| Metric | What it means in baseball terms |
|---|---|
| **Kinematic sequence** (the flagship) | Do the hips start turning *before* the shoulders? That's how power travels up the body. |
| **Hip–shoulder separation** | How much "rubber-band stretch" between hips and shoulders |
| **Tempo** | How long the swing takes from launch to contact |
| **Head drift after foot plant** | Does the head lunge forward? A moving head makes the ball harder to see |
| **Stride length** | How big the step toward the pitcher is |
| **Front-knee brace** | Does the front leg firm up at contact to turn against? |
| **Shoulder tilt** | Are the shoulders level or dipping at the start? |

5. **No measuring tape needed.** Every distance is divided by the player's own height in
   the video, so it doesn't matter whether the phone was 2 meters or 5 meters away.
6. **Coaching.** Each number is compared to thresholds (based on our test clips and a
   published youth-baseball study, Escamilla 2009) and turned into plain-English feedback
   plus matching drills.
7. **Honest partial results.** If the feet are cut off, it still measures the four
   upper-body metrics and clearly marks the other three as "not measured." It never
   pretends with a zero.

### C. The people layer (coaches and parents)
- **Three account types:** Player, Coach, Parent.
- **Coaches see swings, never identities.** Players appear as codes like "Player #7F3K."
- **No private messages anywhere.** Coaches can leave comments tied to a moment in the video
  and assign drills. There's no chat.
- **Equity queue:** coaches get the *least-reviewed* swings first, so no kid gets ignored.
- **Parents see every comment** and every drill on their child's account.
- **Block and report** tools, with the rules enforced by the database itself (Firestore
  security rules) rather than just hidden buttons.

### D. Everything else
- Record inside the app with a 3-2-1 countdown, or upload a clip.
- Skeleton replay drawn over the video, synced as you scrub.
- **Progress charts** showing each metric over time.
- Filming guide for first-time users.
- **Installs to the home screen** like an app. No app store and no download fee, just a link.
- `/lab`: a private testing bench used to tune the engine on test clips.

---

## 4. How AI tools were used to *build* it (separate from the app's AI)

**Claude Code** (an AI coding assistant) was used throughout as a pair programmer and tutor.
It wrote a lot of the setup and plumbing code and much of the app code from the student's
instructions. The student:
- chose the idea, designed the privacy and coach-trust rules, and set the "refuse rather
  than guess" principle
- filmed every test clip and ran them through `/lab`
- **found the engine's real bugs by noticing when a number didn't match the swing**:
  tempo reading 0.00s, a half-finished swing getting coached, a fake 70° shoulder tilt on a
  front-facing video, and a normal swing flagged as "too long"
- decided how each bug should be fixed

Competition rules allow AI tools but require full disclosure. Every session is logged in
`AI_USAGE_LOG.md`, which ends with the disclosure statement that goes into the submission.

---

## 5. What was found and fixed along the way (the "technical difficulty" story)

| Problem noticed | Why it happened | Fix |
|---|---|---|
| Tempo always 0.00s | Sampling only 20 times/sec. A swing is ~0.15s, so it fell between samples | Sample at 60/sec, at exact timestamps |
| Mid-swing clip got coached | No check that the whole swing was in the video | "Degenerate swing" guards reject it |
| Fake 70° shoulder tilt | From the front, a shoulder turning *toward* the camera looks like it's dipping | Camera-angle gate: detect front views and refuse them |
| Good swing flagged "too long" | The threshold was a guess, not measured | Re-fit thresholds from real clips and published research |
| Some laptops recorded videos they couldn't play back | Browser video-format bugs | App remembers which formats fail on each device and avoids them |

---

## 6. What's left (as of Sep 27, 2026)

**Needs recording (student, can't be done by anyone else):**
- Film the deliberate-flaw test swings (no hips ×2, lunge ×2, collapsed back side ×2, no stride ×2,
  3 normal real-bat swings, 1 swing from Dad) and run them through `/lab`
- Film the demo video (script: `DEMO-SCRIPT.md`)

**Needs the student's decision or words:**
- Approve the 10-drill library (then it gets wired in)
- Write submission answers 3 (Inspiration) and 5 (Biggest takeaway) in the student's own words
- Register on the CAC portal; confirm district (WA-01 vs WA-02)
- Optional: a small pilot with a few teammates (consent form: `PARENT-CONSENT.md`)

**After the filming (Claude + student):**
- Fit the final thresholds to the new clips and build the **validation table**, the proof
  that the engine's verdicts match known swing flaws

**Deadline:** submit the week of **Oct 12** (target), hard deadline **Mon Oct 26, 12:00 pm EDT**.
The day-by-day plan is in `CHECKLIST.md`.
