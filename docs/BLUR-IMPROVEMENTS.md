# Blur Improvements — research notes (ideas only, not built yet)

Current state (works, user-verified Aug 16): per-frame face detection → 8-block
pixelation, 15/20% margin, 10-frame hold, no audio in output, blur-or-block upload.

## Priority 1 — biggest safety wins, small effort
1. **Self-audit pass.** After blurring, run the face detector over the OUTPUT.
   If any face is still detectable → warn + re-blur with bigger boxes. Turns
   "we blur" into "we verify anonymity" — a killer demo-video line.
2. **Pose-based head backup.** At full filming distance the face model may miss
   small faces; the pose model (already shipped) always knows where the head is
   (nose/eye/ear landmarks). Union both signals: face boxes OR head-landmark
   circles. Guarantees coverage at any distance, ~30 lines.
3. **Two-pass processing.** Detect on ALL frames first, then render. Lets the
   hold work *backwards* too (blur frames BEFORE first detection — currently a
   face entering the frame is visible for 1–2 frames until detected).

## Priority 2 — robustness
4. **Box smoothing (EMA).** Boxes jitter frame to frame; an exponential moving
   average makes the mosaic glide instead of twitch. Research calls this the
   temporal-consistency problem ([bgblur guide](https://www.bgblur.com/blog/en/temporal-consistency-video-anonymization-complete-guide)).
5. **Multi-face stress config.** Confirm detector maxFaces covers a dugout of
   bystanders; pilot videos will have teammates in the background.
6. **Oval mask** instead of rectangle — covers the same area with less visual
   damage; purely cosmetic.

## Priority 3 — speed / quality
7. **WebCodecs pipeline.** Current re-record runs in real time (10s clip = 10s
   processing). WebCodecs (VideoDecoder/VideoEncoder) can process
   faster-than-realtime and with controlled bitrate. Bigger rewrite; do only if
   pilot kids complain about wait times.
8. **Bitrate tuning** on MediaRecorder — output quality currently browser-default.

## Notes from the literature
- Plain gaussian blur is partially reversible and defeats neither modern face
  recognition nor deblurring research — pixelation at very low block counts is
  materially stronger, which is why we ship mosaic, not blur
  ([survey](https://arxiv.org/pdf/2405.19173), [UU-Net](https://arxiv.org/pdf/2007.04316)).
- State of the art is GAN face-swapping/inpainting (replace the face with a
  synthetic one, preserving expression) ([expression-consistent anonymization](https://arxiv.org/html/2601.11635),
  [GAN inpainting](https://arxiv.org/pdf/2106.02328)) — massively out of scope
  for on-device in-browser, but worth citing in the 2.0 essay answer.
- Temporal consistency (no flicker, no single-frame leaks) matters as much as
  per-frame strength — that's ideas 3 & 4.

## Suggested order when we build: 1 → 2 → 3 → 4 (fits in one day, likely Aug 18)
