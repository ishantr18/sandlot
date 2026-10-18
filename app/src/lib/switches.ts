// Look-and-feel switches — change one word, rebuild, done.
// (Width and text-size switches live on <html> in src/app/layout.tsx.)

// What a signed-out visitor sees at "/":
//   "signin"  → the sign-in form (the welcome landing stays at /welcome)
//   "landing" → the welcome landing with the swing animation and role cards
export const SIGNED_OUT_START: "signin" | "landing" = "signin";

// Player Home layout:
//   "classic" → stat cards, shortcut tiles, Today's focus, recent swings, family code
//   "nextUp"  → one "Next up" card, one-line stats, 3 recent swings, family row collapsed
export const PLAYER_HOME: "classic" | "nextUp" = "classic";

// Who sees "Report" / "Block this coach" under coach comments:
//   "parents"  → parents only (players just see the feedback + reactions)
//   "everyone" → players and parents
//   "none"     → nobody
export const COACH_SAFETY_BUTTONS: "parents" | "everyone" | "none" = "parents";
