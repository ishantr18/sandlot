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

Both come from Google's free, open-source **MediaPipe** toolkit (`@mediapipe/tasks-vision`
version 1.0.1, Apache 2.0 license, which allows free use in any project). We didn't train
them. Google trained them on huge collections of labeled photos. We use them the way a
carpenter uses a power drill: we don't build the tool, we build the house with it.

| | **BlazeFace** (face finder) | **BlazePose** (body tracker) |
|---|---|---|
| File in our app | `blaze_face_short_range.tflite`, 224 KB | `pose_landmarker_lite.task`, 5.5 MB |
| Made by | Google Research (published 2019) | Google Research (published 2020) |
| What goes in | One video frame | One video frame |
| What comes out | A box around each face, plus a confidence score | **33 body points**, each with a position and a confidence score |
| Used for | Finding faces so we can **destroy** them (privacy) | Tracking the body so we can **measure** the swing (coaching) |
| Our settings | `minDetectionConfidence: 0.3`: deliberately jumpy, because hiding a non-face is harmless and missing a real face isn't | "full" version on a zoomed crop of the player for the swing (tested: 3× steadier than lite on the whole frame, same speed) |
| Analogy | A security guard who spots faces in a crowd | Motion-capture dots on a player, without the suit |

**Which size? (updated Oct 9)** Google ships BlazePose in three sizes: lite (5.5 MB), full (9 MB) and heavy
(29 MB). Bigger is slightly more precise but slower and a bigger download. Diamond Drive is
built for kids with old or cheap phones, so it uses lite. (On Sep 27 we tested the full
model on our clips. It did not fix the problems in the "What the AI gets wrong" table below, so the extra size
wasn't worth it.)

### A third model: YuNet (the independent checker)

After the app hides the faces, it checks its own output with **YuNet**, a face detector from
OpenCV (MIT license) built by different researchers with a different design from Google's
BlazeFace. If BlazeFace has a blind spot, YuNet probably doesn't share it. It runs on the
phone through ONNX Runtime Web. If either model still sees a face, **the upload is blocked**.
Tested with a fourth model (SCRFD) as the judge: no clip with a visible face got through.

### The 33 body points

BlazePose always returns the same 33 points in the same order, which is how the code can
ask for "point 23" and know it's the left hip:

| Body part | Points | Numbers used by the swing engine |
|---|---|---|
| Face | nose, eyes (inner/center/outer), ears, mouth corners | nose (0) for head drift / lunge |
| Arms | shoulders, elbows, wrists | shoulders (11, 12), wrists (15, 16) |
| Hands | pinky, index finger, thumb knuckles | not used (too small to track at filming distance) |
| Legs | hips, knees, ankles | hips (23, 24), knees (25, 26), ankles (27, 28) |
| Feet | heels, toes | not used |

Each point comes back as **x** (how far across the frame, 0 to 1), **y** (how far down, 0
to 1), and **visibility** (0 to 1, the model's confidence that the point is really
visible and not hidden behind the body). BlazePose also guesses depth (z), but from one
camera that guess is rough, so we don't use it.

### How a model "sees"

Both are **convolutional neural networks (CNNs)**. A CNN slides thousands of tiny learned
filters across an image. The first layers notice simple things like edges and color
changes. Later layers combine those into shapes, and the deepest layers recognize things
like "this is a knee." Nobody programmed "what a knee looks like." The network learned it
by being shown many photos where people had marked the knees by hand, and adjusting itself
millions of times until its guesses matched.

BlazePose works in **two stages**, like how you'd find someone in a photo:
1. **Detector:** "Where is the person?" A fast network finds the person and draws a box
   around them.
2. **Landmark network:** "Where exactly is each joint?" A second network looks only inside
   that box and places the 33 points.

In **video mode** (which we use), it also **tracks**. It uses where the body was in the last
frame to find it faster in the next one, instead of searching the whole picture every time.

### How many times the AI runs per swing

| Step | How often the model runs | Why |
|---|---|---|
| Face scan (privacy) | BlazeFace + BlazePose on every frame, then BlazeFace again on the blurred output (the self-check) | A face must never slip through on a single frame |
| Swing locate (pass 1) | 12 times per second across the whole clip | Cheap way to find *when* the swing happens |
| Swing measure (pass 2) | 60 times per second for ~2 seconds around the swing | A swing takes ~0.15–0.3 s, so a fine clock is needed |

A typical 10-second, 30 fps clip means **well over a thousand model runs**, all on the phone.

### The big design decision: the AI runs *on the phone*

Most apps send your video to a company's computer ("the cloud") to be analyzed. Diamond
Drive doesn't. The model files and MediaPipe's engine are stored on **our own website**
(not loaded from Google) and downloaded into the page. They run **on the kid's own
device**, using **WebAssembly**, a format that lets a browser run heavy code almost as fast
as a normal app. Under the hood MediaPipe uses Google's TensorFlow Lite with a CPU
accelerator called XNNPACK.

That's what makes the privacy promise real:
- **The original, un-blurred video never leaves the phone.** The cloud only ever receives
  the face-hidden video and a list of numbers.
- No video is sent to Google or any AI company. Once the page has loaded, the AI makes no
  network calls at all.
- It costs nothing per swing, because there's no server doing the work. That's how the app
  can stay free.

### What the AI gets wrong (and why the engine exists)

The models are good but not perfect, and **most of the real engineering is handling their
mistakes.** Problems we measured on real clips:

| AI weakness | What it looks like | How the app handles it |
|---|---|---|
| **Can't see depth** | From the front, a shoulder turning toward the camera looks like it's dipping | Camera-angle check: front-facing clips are refused, not measured |
| **Jitter** | Each point wobbles a few pixels every frame even when the player is still | Positions are averaged over ±25 ms, and speeds are measured over ~60 ms instead of one frame *(v4: fixed 3 of our own 4 clips that were being rejected)* |
| **Left/right mix-ups** | From the side, one hip hides behind the other and the model sometimes swaps "left hip" and "right hip" for a frame | Continuity check: if swapping the labels back fits the previous frame much better, it swaps them back *(v4)* |
| **Motion blur** | During the fastest part of a swing, wrists blur and the model loses them | Swing detection now looks for a *burst* of hand travel, not one fast frame *(v4)*. Validation (Sep 27): the swing is timed right on about half of web swings, and no-bat shadow swings remain a weak spot |
| **Low confidence** | Dark, backlit, or cropped video | Quality gate uses the visibility scores to reject the clip with advice on how to film it better |
| **Hips overlap from the side** | The 2D "hip line" angle is mostly noise | **Fixed with 3D (v5):** BlazePose infers depth, so rotation is measured from above. Separation stays off |
| **Faces missed at a distance** | BlazeFace is built for faces within ~2 m | BlazePose's head points (nose, ears) act as a backup face finder, and the self-check re-scans the output |

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
| **Kinematic sequence** (the flagship) | Do the hips start turning *before* the shoulders? Measured in 3D; needs a 60 fps video. |
| **Hip turn** *(new Oct 3, 3D)* | How far the hips rotate through the swing. Catches "lack of rotation" (4/4 in testing) |
| **Hip–shoulder separation** *(switched off Sep 27, unreliable from the side)* | How much "rubber-band stretch" between hips and shoulders |
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
- **Coaches must be certified by a real person.** A coach applies with their league or
  school and a credential the admin can check (SafeSport certificate, USA Baseball, Little
  League background check, school coaching certificate). Until the admin approves them on
  the Admin page, they see **nothing**. The admin can revoke access any time.
- **Parents link with a family code, not an email.** The player taps "Make a family code"
  on their Home screen, and the parent types the 6-character code in. The code works once
  and expires in 24 hours. Having it proves the kid said yes. The player sees who's linked
  and can remove a parent.
- **Coaches see swings, never identities.** Players appear as codes like "Player #7F3K." Since
  Oct 3 this is enforced in the database too: a coach can't look up any player's name or
  email.
- **No private messages anywhere.** Coaches can leave comments tied to a moment in the video
  and assign drills. There's no chat.
- **Equity queue:** coaches get the *least-reviewed* swings first, so no kid gets ignored.
- **Parents see every comment** and every drill on their child's account.
- **Block and report** tools. Reports go only to the admin.
- **Forgot password** sends a reset email.
- **Videos are locked to the right people.** Uploading requires being signed in. To watch a
  video, the server asks the database *as you*, so the same rules decide (player, linked
  parent, certified coach or admin). Everyone else gets "not allowed." Swing records no
  longer carry the player's name.
- **Rules tested automatically:** 18 tests (`npm run test:rules`) act out the honest paths and
  the attacks: a coach approving themselves, a stranger linking to a kid, a coach looking up
  a player's name. Every attack fails.

### D. Athlete growth (Oct 10)
- **Growth tab** (player) and **Athlete's Growth tab** (parent): five skill bars —
  **Core** (hip turn), **Hands** (quick, compact swing), **Balance** (no lunging), **Lower
  Half** (stride + firm front leg), **Posture** (no back-side collapse) — each 0–100%.
- **Compared only to yourself:** each bar averages the last 3 swings and shows the change
  since the first 3 ("Core 64% ▲ +18 since the start"). No leaderboards.
- **Effort bar:** swings this week (goal 3) and drills marked done.
- **Coach-confirmed:** a certified coach reviewing a swing sees that player's bars and can
  confirm progress; the bar then shows "✓ Coach-confirmed". Small incentive, not a game.

### E. Everything else
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

**Engine accuracy (see VALIDATION.md; v5 Oct 3: lunges 10/12, lack of rotation 4/4):** web-clip validation done. It catches lunges 7/12, no-stride 3/3, soft knee 4/6, and separation is now switched off, which cut false alarms on good swings from 8/10 to 4/10.

**After the filming (Claude + student):**
- Fit the final thresholds to the new clips and build the **validation table**, the proof
  that the engine's verdicts match known swing flaws

**Deadline:** submit the week of **Oct 12** (target), hard deadline **Mon Oct 26, 12:00 pm EDT**.
The day-by-day plan is in `CHECKLIST.md`.
