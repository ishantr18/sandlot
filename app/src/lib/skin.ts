// Is the Field skin on for this role? (switch: FIELD_SKIN_ROLES in switches.ts)
import { FIELD_SKIN_ROLES } from "@/lib/switches";

export type Role = "player" | "mentor" | "guardian";
export const fieldSkinOn = (role?: Role | null) => !!role && FIELD_SKIN_ROLES.includes(role);
