// Is the Field skin on for this role? (switch: FIELD_SKIN_ROLES in switches.ts)
import { FIELD_SKIN_ROLES, FIELD_SKIN_SIGNED_OUT } from "@/lib/switches";

export type Role = "player" | "mentor" | "guardian";
export const fieldSkinOn = (role?: Role | null) => !!role && FIELD_SKIN_ROLES.includes(role);

// Signed in → by role (FIELD_SKIN_ROLES); signed out → FIELD_SKIN_SIGNED_OUT
export const fieldSkinFor = (signedIn: boolean, role?: Role | null) =>
  signedIn ? fieldSkinOn(role) : FIELD_SKIN_SIGNED_OUT;
