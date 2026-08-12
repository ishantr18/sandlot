# Decisions Log

| Date | Decision | Why |
|---|---|---|
| Aug 10 | Compete in WA-01 (DelBene) unless school address is in WA-02 | Mill Creek residence = WA-01. WA-02 (Larsen/Everett) has a much lower bar — check school's district before registering |
| Aug 10 | Theme: baseball access equity — AI coach + supervised mentors | Matches WA-01's 3-year winning meta (access-equity apps); fresh lane; personal connection |
| Aug 10 | Cut the virtual little league (teams/seasons/scheduling) | Months of CRUD work, zero judging points; v2.0 essay material |
| Aug 10 | AI-coach-first architecture (CV analysis), mentors as bonus layer | Solves cold-start (app valuable with zero coaches); provides the criterion-3 technical depth WA-01 demands |
| Aug 10 | Build order: framework → face blur → swing analysis | Blur uses the same MediaPipe/canvas pipeline as pose — it's the training ramp. Plus Aug 13 pose spike to de-risk early |
| Aug 10 | Only 3–4 metrics from single 2D side view | 2D video can't measure everything; overclaiming = credibility loss with technical judges |
| Aug 10 | Stack: Next.js PWA + MediaPipe (in-browser) + Firebase + Vercel | 3-week feasible; no app store; on-device ML keeps privacy story literal |
| Aug 10 | Park "underutilized skills" reframe + Skill Card | See PARKED.md — revisit after core build |
| Aug 11 | Videos stored in **Vercel Blob (private store)**, not Firebase Storage | Firebase Storage now requires the paid Blaze plan on new projects — no credit card on a school project. Private store + short-lived signed URLs for playback is also a stronger privacy story. Firebase keeps auth + Firestore |
| Aug 11 | AI working agreement | AI does scaffolding/boilerplate + tutoring; student writes core logic (CV engine especially). All AI use logged in AI_USAGE_LOG.md |
