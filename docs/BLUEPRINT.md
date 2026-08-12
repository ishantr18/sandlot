# Blueprint — Architecture & Tech

## Stack (chosen for 3-week feasibility)
- **Frontend:** Next.js PWA (React) — no app store, installs on any phone, demos anywhere
- **CV (all on-device, in-browser):** MediaPipe Tasks Vision
  - Face Detector → blur pipeline (Phase 2)
  - Pose Landmarker → 33 body landmarks per frame (Phase 3)
- **Backend:** Firebase — Auth (player/mentor/guardian roles), Firestore (sessions, metrics, comments, drill assignments)
- **Video storage:** Vercel Blob, private store (`sandlot-videos`) — blurred videos only; playback via short-lived signed URLs (Firebase Storage needs a paid plan; see DECISIONS.md)
- **Charts:** Recharts
- **Deploy:** Vercel

## Privacy architecture (the DelBene story)
Raw camera video → face detect + blur on canvas → re-encode → ONLY the blurred file uploads.
Pose landmarks are extracted client-side; only numeric landmark/metric data is stored alongside video.

## CV pipeline
1. Video file → frame extraction via `<video>` + canvas at ~15–30 fps
2. Per frame: Pose Landmarker → 33 landmarks (x, y, z, confidence)
3. Time series of landmarks → metrics engine (pure math, no model training)
4. Quality gate: reject clips with low landmark confidence / partial body in frame

## The 4 metrics (only what's robust from a single 2D side view — never overclaim)
| Metric | From landmarks | Finding example |
|---|---|---|
| Hip–shoulder separation | shoulder line angle − hip line angle at launch | "More separation = more power; yours peaks at 18°, target ~30°" |
| Swing tempo/timing | frames from stride-foot plant → contact | "Your swing is rushed after foot plant" |
| Head movement (balance) | nose landmark displacement across swing | "Your head drifts 20cm — costs consistency" |
| Stride | ankle distance change, front-knee angle at plant | "Stride is short; you're all arms" |

## Data model (Firestore, first pass)
- `users`: role (player/mentor/guardian), guardianOf/linkedGuardian, verifiedMentor flag
- `sessions`: playerId, videoURL (blurred), landmarks summary, metrics{}, findings[], date
- `drills`: name, description, flaw tags, demo media
- `assignments`: drillId, playerId, assignedBy (system|mentorId), status
- `comments`: sessionId, mentorId, timestampInVideo, text (guardian-visible by design)

## Feasibility risks & cages
- 2D can't measure everything → claim only the 4 metrics above
- Bad lighting/angle breaks landmarks → filming guide + auto-reject bad clips
- Phone performance → analyze on upload, not live; process at reduced fps
- ⚡ De-risk spike (Aug 13): render raw skeleton on one clip — go/no-go before building on it
