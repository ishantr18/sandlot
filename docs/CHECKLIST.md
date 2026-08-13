# Daily Checklist — Aug 10 → Aug 31

Order: **framework → face blurring → swing analysis** (each phase builds the skills for the next).

## Phase 1 — Framework (Aug 10–15)
- [x] **Aug 10:** Repo + Next.js scaffold; deployed to Vercel (project: `sandlot`); start `AI_USAGE_LOG.md`
- [x] **Aug 11:** Wireframe 4 screens (Upload → Analysis → Drills → Progress); Firebase config + data model (⚠️ Firebase project creation + auth wiring still needed — my task)
- [x] **Aug 12:** Screen skeletons; video upload → private Blob → signed-URL playback working end-to-end (tested + deployed)
- [x] **Aug 13:** ⚡ Pose spike: **GO** — skeleton tracking at 35 fps on laptop, on-device (/spike). Bonus: in-browser recorder w/ countdown + review/retake. (Player profile + session history → moved to Aug 14)
- [x] **Aug 14 (done early, Aug 13):** Accounts (sign up/in), sessions saved per upload, Progress history with playback + sign out
- [ ] **Aug 15:** Film test clips ON THE TRIP — dry/shadow swings anywhere (parking lot/park, side view, full body; no ball or bat needed — Dad films). Build filming-setup guide screen. Fallback: YouTube/Pexels slow-mo swings for dev only (never in the submission)

## Phase 2 — Face blurring (Aug 16–18)
- [ ] **Aug 16:** MediaPipe Face Detector running on video frames in-browser
- [ ] **Aug 17:** Blur + re-encode pipeline BEFORE upload; verify raw video never leaves device
- [ ] **Aug 18:** Edge cases (multiple faces, motion), performance pass, "blurred ✓" confirmation UX

## Phase 3 — Swing analysis (Aug 19–24)
- [ ] **Aug 19:** Full pose extraction → per-frame landmark time series
- [ ] **Aug 20:** Skeleton overlay + video scrubber
- [ ] **Aug 21:** Metrics 1–2: hip–shoulder separation, swing tempo/timing
- [ ] **Aug 22:** Metrics 3–4: head movement (balance), stride
- [ ] **Aug 23:** Findings engine: thresholds → plain-English feedback
- [ ] **Aug 24:** Drill library (10–15 drills mapped to flaws) + auto-assignment

## Phase 4 — Progress + mentor layer (Aug 25–27)
- [ ] **Aug 25:** (Back home) Film REAL swing clips with actual bat; re-verify the 4 metric thresholds against them. Then: progress charts per metric across sessions
- [ ] **Aug 26:** Roles (player/mentor/guardian) + guardian-linked accounts
- [ ] **Aug 27:** Mentor queue, timestamped comments, drill assignment — no DMs, guardian sees all

## Phase 5 — Ship (Aug 28–31)
- [ ] **Aug 28:** UX polish: onboarding, empty states, mobile layout
- [ ] **Aug 29:** End-to-end test with Dad; fix bug list
- [ ] **Aug 30:** Performance + PWA install + production deploy
- [ ] **Aug 31:** Buffer day; record 60-sec rough demo; send pilot emails (Little League / Boys & Girls Club / school coach)

**Daily habit (5 min):** check the box, log AI usage, note tomorrow's blocker.
