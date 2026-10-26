# Diamond Drive

**Baseball for every kid, not just the ones who can pay.**

Diamond Drive is a free web app that gives young baseball players swing feedback from a phone video
and connects them with approved volunteer coaches. It runs in any phone's browser, with no app store
and no download.

**Live app:** https://sandlot-weld.vercel.app
Entry for the 2026 Congressional App Challenge, Washington's 1st District.

---

## How it works

1. **Film.** A player records or uploads one swing from the side.
2. **Hide the face, on the phone.** Before the video leaves the device, a face detector (BlazeFace)
   finds every face and pixelates it. A second, independent model (YuNet) re-scans the result. If a
   face is still visible, the app re-blurs it, and if that fails, the upload is blocked.
3. **Analyze the swing.** A pose model (BlazePose) tracks 33 body points per frame. Diamond Drive's
   own swing engine turns those points into baseball measurements: finding the swing in the clip,
   rejecting clips that can't be measured reliably, and measuring stride, hip turn, head movement,
   front-knee and timing. It explains problems in plain English and suggests drills.
4. **Get a real coach.** Approved volunteer coaches review waiting swings, leave comments pinned to
   a moment in the video, and assign drills. Swings from players who have been coached the least
   are tagged so nobody gets skipped.
5. **Families see everything.** A linked parent sees every swing, comment and drill. There is no
   private messaging, and coaches never see the original video.

## Privacy and safety by design

- Face blurring happens **on the device**; the unblurred video is never uploaded.
- **Role-based security rules** (`app/firestore.rules`) are enforced by the server: players can only
  write their own swings, only approved coaches can review, and parents can read only their linked
  child. Rules are covered by tests in `app/tests/rules.test.mjs`.
- Coaches are approved by an admin before they can see anything.

## Tech stack

| Part | Technology |
|---|---|
| App | TypeScript, Next.js 16, React 19, Tailwind CSS |
| Accounts and data | Firebase Authentication, Cloud Firestore |
| Video storage | Vercel Blob (private, signed links) |
| Computer vision (runs in the browser) | Google MediaPipe BlazePose and BlazeFace; OpenCV YuNet via ONNX Runtime Web |
| Hosting | Vercel |

The vision models are pretrained; they were not trained for this project. The baseball analysis built
on top of them (swing detection, quality checks, measurements, feedback) is in `app/src/lib/swingMetrics.ts`.

## Where to look in the code

| Path | What it does |
|---|---|
| `app/src/lib/swingMetrics.ts` | The swing engine: quality checks, swing detection, measurements, feedback |
| `app/src/lib/poseExtract.ts` | Runs the pose model over the video and builds the body-point time series |
| `app/src/lib/faceblur.ts`, `app/src/lib/yunet.ts` | On-device face pixelation and the second-model check |
| `app/src/lib/growth.ts` | Skill levels and progress over time |
| `app/src/lib/coachQueue.ts` | The coach review queue |
| `app/firestore.rules` | Server-side permissions for players, coaches, parents and admins |
| `app/src/app/` | Pages: upload, analysis, coach, family, progress, drills, admin, and `lab` (a tuning tool) |
| `app/src/app/api/` | Server routes for secure video upload and playback |
| `app/src/components/` | Shared UI components |

## Documentation

- [`docs/TECHNICAL-OVERVIEW.md`](docs/TECHNICAL-OVERVIEW.md): architecture and security model
- [`docs/ENGINE.md`](docs/ENGINE.md): how the swing engine works, in detail
- [`docs/VALIDATION.md`](docs/VALIDATION.md): testing the engine against coach-labeled swings, and its known limits
- [`docs/PARENT-CONSENT.md`](docs/PARENT-CONSENT.md): the plain-language information sheet for families
- [`docs/AI_USAGE_LOG.md`](docs/AI_USAGE_LOG.md): how AI tools were used during development

## Run it locally

```bash
cd app
npm install
# create app/.env.local with your Firebase web config (NEXT_PUBLIC_FIREBASE_*)
# and a Vercel Blob token (BLOB_READ_WRITE_TOKEN)
npm run dev
```

Security-rule tests: `npm run test:rules` (requires the Firebase emulator).

## Use of AI in development

I chose the problem, designed the app's features and safety requirements, filmed and ran test swings,
decided how the app should respond when measurements didn't match the real swing, and made the final
product decisions. I used Claude Code as a coding assistant to help write and review the code; commits
it helped with are marked as co-authored. Details are in [`docs/AI_USAGE_LOG.md`](docs/AI_USAGE_LOG.md).
