// What a signed-out visitor sees at "/":
//   "signin"  → the sign-in form (the welcome landing stays at /welcome)
//   "landing" → the welcome landing with the swing animation and role cards
export const SIGNED_OUT_START: "signin" | "landing" = "signin";
