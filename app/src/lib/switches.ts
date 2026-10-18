// Look-and-feel switches — change one word, rebuild, done.
// (Width and text-size switches live on <html> in src/app/layout.tsx.)

// Logo while the Field skin is on:
//   "baseball"  → the existing baseball mark (user's pick)
//   "homeplate" → the prototype's green home-plate mark
export const FIELD_LOGO: "baseball" | "homeplate" = "baseball";

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
export const COACH_SAFETY_BUTTONS: "parents" | "everyone" | "none" = "none";

// "Field" skin — the approved look from diamond-drive-prototype.html
// (dark field-green, Barlow type, home-plate logo, prototype tab bars).
// Rolled out one role at a time. Remove a role to give it the old look back;
// [] = old look everywhere. Styles live in globals.css under [data-skin="field"].
//   "guardian" = parents · "player" = players · "mentor" = coaches
export const FIELD_SKIN_ROLES: ("player" | "mentor" | "guardian")[] = ["guardian", "mentor", "player"];

// Field skin for signed-out screens (sign in / sign up, welcome, sample swing,
// loading). They have no role yet, so they get their own switch.
//   true → prototype look · false → old look
export const FIELD_SKIN_SIGNED_OUT: boolean = true;

// What a coach sees for a player's name:
//   "firstName" → the player's first name only (no last name, email or photo)
//   "anon"      → "Player #7F3K" (a stable number, never a name)
// Players publish just their first name to playerNames/{uid} (see
// PlayerNamePublisher); switching to "anon" also removes it on their next visit.
export const COACH_SEES_PLAYER: "firstName" | "anon" = "firstName";

// Third impact stat (coach On Deck + Home, parent Home):
//   "comments" → number of coach comments (coach: ones you wrote · parent: on your kid's swings)
//   "dollars"  → "$ coaching given / received free" (≈ $25 per reviewed swing)
export const IMPACT_STAT: "comments" | "dollars" = "comments";

// "How to film your swing" tips:
//   "short" → 3 tips, a few words each (prop-the-phone + lighting tips cut)
//   "full"  → the original 5 tips with full sentences
export const FILM_TIPS: "short" | "full" = "short";
