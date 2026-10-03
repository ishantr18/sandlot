# Diamond Drive: Status Brief for Dad

*Sep 27, 2026 · 29 days to the deadline (Mon Oct 26, 12:00 pm EDT) · target: submit week of Oct 12*

For the full plain-English explanation of the app and its AI, read **PROJECT-EXPLAINED.md**
(10 minutes). This page covers only where things stand and what needs you.

---

## Where we are

**The app is built and live:** sandlot-ishantr18s-projects.vercel.app

| Part | Status |
|---|---|
| Face hiding on the phone, with self-check before upload | ✅ Done, tested on Mac + Windows |
| Swing engine: 7 measurements, rejects bad clips | ✅ Done (v3 on Sep 20); final accuracy tuning waits on new clips |
| Coaching text + drills | ✅ Works; 5 placeholder drills to be replaced by the approved 10 |
| Progress charts | ✅ Done |
| Coach + parent accounts (anonymous players, no DMs, parents see everything) | ✅ Done, all three views tested |
| Installs on a phone home screen | ✅ Works today |
| Written submission answers | 🟡 4 of 6 drafted; 2 need Ish's own words |
| AI-use disclosure | ✅ Drafted (AI_USAGE_LOG.md) |
| Accuracy proof (validation table) | ⏳ Waiting on filming |
| Demo video | ⏳ Script ready (DEMO-SCRIPT.md), not filmed |
| Pilot with real kids | ❌ Didn't happen in September; optional small version below |

## The next four weeks

| Week | What happens |
|---|---|
| **Sep 28 – Oct 4** | Film the test swings (~30 min, needs you as camera operator + one swing of yours). Approve drills. Register on the CAC portal. Write answers 3 & 5. |
| **Oct 5 – 11** | Accuracy table built from the new clips. Film the demo video. Features frozen. |
| **Oct 12 – 18** | **Submit.** Double-check the video is public and answers are pasted. |
| **Oct 19 – 26** | Buffer. Rehearse for judging. Exit questionnaire after the deadline. |

## Where we need you

1. **Camera operator** for the test-swing session and the demo video (~2 sessions, ~1 hr each).
2. **One swing of yours** for the test set (a "different body" data point).
3. **District question:** is Ish's school address in WA-01 or WA-02? It decides which
   competition we enter. Needed before registering on the portal.
4. **Optional mini-pilot:** if 3–5 teammates' families would try it for a week, their
   progress charts and a quote would strengthen the video. Consent one-pager:
   PARENT-CONSENT.md. Only worth it if it can start by ~Oct 1.
5. **Feedback on the pitch:** watch the 3-minute walkthrough once and tell us where you
   got lost. The judges aren't engineers either.

## How accounts work now (Oct 3)

- **Coaches** apply with a checkable credential (e.g. SafeSport certificate number). Ish
  approves them on the **Admin** page, which only his account can open. Until then they
  see nothing.
- **Parents** link with a **family code** from the player's Home screen (6 characters,
  works once, expires in 24 h). Knowing a kid's email isn't enough anymore.
- **Forgot password** emails a reset link.
- **New accounts verify their email** (a link, emailed at sign-up) before they can see or upload any swing.
- Test logins are in `TEST-ACCOUNTS.local.md` on the Mac (never uploaded anywhere).

## The "real mobile app" question

It **already installs like an app** (Add to Home Screen → own icon, full screen). Putting
it in the app stores is a separate, optional step:

| Route | Cost | Effort | Risk before Oct 26 |
|---|---|---|---|
| Google Play (Android wrapper) | $25 once | 1–2 days | Low |
| Apple App Store (iPhone wrapper) | $99/year, **account must be in your name** (Ish is a minor) | ~1 week incl. camera permission work | High: Apple often rejects "websites in a wrapper," and review can take 1–3 weeks |

**Recommendation: don't do it before submitting.** Judges see the video, and CAC accepts
web apps. "No app store, works from a link on any phone, free" is itself an equity
argument in the pitch. Revisit Play Store in November, App Store after that.

## Where the code lives and how it goes live

**The code is a folder on the Mac:** `~/Desktop/CAC-2026- (baseball)/app/`. There's no
website for editing it; editing these files changes the app.

**Editor:** Visual Studio Code (already installed). **File → Open Folder** → the `app` folder.
The files that matter are in `app/src/`:

| Folder / file | What's in it |
|---|---|
| `src/lib/swingMetrics.ts` | **The swing engine**: quality gate, swing detection, the 6 metrics, coaching text. Ish's part for judges |
| `src/lib/poseExtract.ts` | Turns the video into the 33 body points |
| `src/lib/faceblur.ts` | Face hiding |
| `src/lib/drills.ts` | The drill list |
| `src/app/<page>/page.tsx` | Each screen (`upload`, `analysis`, `progress`, `coach`, `family`, `drills`, `lab`) |

**Seeing changes while coding (only on this Mac):**
1. In VS Code: **View → Terminal**, then run `npm run dev`.
2. Open **http://localhost:3000** in Chrome. Saving a file updates the page within a second or two.
3. To test an engine change, open **localhost:3000/lab** and drop in clips from `test-clips/`.

Good first files to read: `drills.ts` (simple), and the `T = { ... }` thresholds block near
the top of `swingMetrics.ts`. Changing a number there changes when the app flags a flaw.

**Getting a change to the live site:** three steps, run in the `app` folder:

| Step | Command | What it does |
|---|---|---|
| 1. Save a checkpoint | `git add -A` then `git commit -m "what I changed"` | Records the change so it can be undone |
| 2. Back up | `git push` | Copies it to GitHub (private). **Does not update the live app** |
| 3. Go live | `vercel --prod` | Builds on Vercel and replaces the live site (~1 minute) |

Vercel isn't connected to GitHub, so step 3 is always separate. That's on purpose until
after submission: a half-finished push can't accidentally replace the version judges might
open. (Before Oct 3 the live site hadn't been deployed for 37 days, because pushing alone never deploys.)

**Testing on a phone:** localhost only works on the Mac. Deploy, open the live link on the
phone, tap Share → **Add to Home Screen**, and test record → blur → analysis.

## Testing guide: is everything working?

**Accounts** (passwords in `TEST-ACCOUNTS.local.md` on the Mac). Gmail ignores anything
after a **+**, so `tcemathclub+parenttest@gmail.com` lands in the tcemathclub inbox but is a
separate app account.

| Role | Email | Notes |
|---|---|---|
| Player | `tcemathclub@gmail.com` | |
| Parent | `shan.ramalingham.ai@gmail.com` | Already linked to TCE |
| Coach | `ishant.ram.ai@gmail.com` | Pre-approved test coach |
| Admin | `ishant.ram@gmail.com` | Ish's own password. Approves coaches |
| New parent | `tcemathclub+parenttest@gmail.com` | Tests family codes from scratch |
| New coach | `tcemathclub+coachtest@gmail.com` | Tests apply → approve from scratch |

**First time each account signs in after Oct 3:** it must **verify its email**. The app
shows "Check your email". Tap **Resend**, click the link in that inbox (check Spam), then
tap **I've clicked the link**.

**Step 1: click through (~10 min, laptop is fine).** Sign out between accounts with the ⇥ icon (bottom right).
1. **Player:** Home → Family code → **Make a family code**. Write it down.
2. **New parent:** Create account → Parent → enter the code. Verify the email. Family
   should show TCE's swings.
3. **Player:** "Linked parents" lists the new parent. Tap **Remove**; it should ask "are you
   sure?" first.
4. **New coach:** Create account → Coach → fill in team, credential and number. Verify the
   email. It should say **Certification pending**, with no swings visible.
5. **Admin:** Home → **🛡️ Admin** → approve the new coach. Also try Reject / Revoke.
6. **New coach:** the Review tab now opens.
7. **Forgot password:** Sign in → Forgot password? → an email arrives within a few
   minutes (**check Spam**; it's from `noreply@sandlot-cac-2026.firebaseapp.com`).

**Step 2: real phone (~10 min).** Open the live link on the phone → Share → **Add to Home
Screen**. As **Player**, record a swing and let it blur, analyze and upload. Then as
**Coach**, comment and assign a drill. Then as **Parent**, check that the comment shows up.

**Step 3: calibration filming.** No account needed: run clips through **/lab**, which never
uploads. Name each file after its flaw (e.g. `lunge-1.mov`) and save it to `test-clips/`.

If something looks wrong: screenshot it and note which account and which step.

## Money spent so far

$0. Everything runs on free tiers (Vercel, Firebase).
