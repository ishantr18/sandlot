// Drill library — each drill targets a specific, measurable flaw.
// All equipment-free (a bat, or an imaginary one). IDs are stored in
// Firestore assignments, so never rename an existing id — add new ones.
export interface DrillDef {
  id: string;
  name: string;
  target: string; // which metric it improves
  category: DrillCategory;
  description: string;
}

// Body part a drill trains — drives the icon and the filter chips
export type DrillCategory = "hips" | "head" | "frontLeg" | "shoulders" | "tempo" | "stride";
export const CATEGORY_LABEL: Record<DrillCategory, string> = {
  hips: "Hips",
  head: "Head",
  frontLeg: "Front leg",
  shoulders: "Shoulders",
  tempo: "Tempo",
  stride: "Stride",
};

export const DRILLS: DrillDef[] = [
  // ── Kinematic sequence / separation (hips before shoulders) ──
  {
    id: "hip-fire-tee",
    name: "Hip fire tee drill",
    target: "Kinematic sequence",
    category: "hips",
    description:
      "Set up at a tee (or imaginary tee). Start your hips turning while your hands stay back — feel the stretch across your core, THEN let the hands go. 10 slow reps, 10 game-speed.",
  },
  {
    id: "separation-stretch",
    name: "Torso separation holds",
    target: "Hip–shoulder separation",
    category: "hips",
    description:
      "Stride and turn your hips while keeping shoulders closed. Freeze 3 seconds at max stretch. 8 reps — this builds the rubber-band feeling that creates bat speed.",
  },
  {
    id: "step-back",
    name: "Step-back drill",
    target: "Kinematic sequence",
    category: "hips",
    description:
      "Start with your feet together. Step your back foot back into your stance, then stride forward and swing in one flowing motion. The momentum teaches the lower half to lead. 10 slow, 10 game-speed.",
  },

  // ── Lunge (head drift after foot plant) ──
  {
    id: "no-stride",
    name: "No-stride swings",
    target: "Head movement",
    category: "head",
    description:
      "Set your feet a little wider than normal with your front foot already down. Swing with NO stride — rotate only. With nowhere to lunge, you feel what turning in place is like. 15 swings, head still.",
  },
  {
    id: "balance-beam",
    name: "Balance-beam swings",
    target: "Head movement",
    category: "head",
    description:
      "Swing while standing on a line, curb, or 2x4. If your head lunges, you fall off. 15 controlled swings staying on the line — eyes level, head quiet.",
  },

  // ── Front-knee brace ──
  {
    id: "firm-front-side",
    name: "Firm-front-side finish",
    target: "Front-knee brace",
    category: "frontLeg",
    description:
      "Swing at 70% speed and freeze at contact. Your front leg should be firm — nearly straight — like a post you're turning against. Hold 2 seconds, check it, reset. 10 reps, then 5 at full speed with the same firm post.",
  },

  // ── Backside collapse (shoulder dip at launch) ──
  {
    id: "high-tee",
    name: "High-tee swings",
    target: "Shoulder tilt",
    category: "shoulders",
    description:
      "Set the tee (or imagine the pitch) at the top of the strike zone. You can't hit a high ball with a dropped back shoulder, so it trains you to stay tall through the load. 15 swings, level shoulders at launch.",
  },
  {
    id: "wall-behind-back-foot",
    name: "Wall behind back foot",
    target: "Shoulder tilt",
    category: "shoulders",
    description:
      "Stand with your back foot about a foot in front of a wall or fence. Take slow swings without your back knee or hip bumping it — collapsing the back side pushes you backward into the wall. 10 slow, 5 game-speed.",
  },

  // ── Tempo ──
  {
    id: "wall-bat-tempo",
    name: "Wall-bat tempo reps",
    target: "Swing tempo",
    category: "tempo",
    description:
      "Stand close to a wall (back to it). Slow-motion swing without touching the wall — forces a compact, unhurried path. 10 slow reps, then 5 at full speed keeping the same rhythm.",
  },

  // ── Stride ──
  {
    id: "stride-ladder",
    name: "Stride ladder",
    target: "Stride",
    category: "stride",
    description:
      "Mark your normal stride spot with tape. Add marks 10cm shorter and longer. Do 5 swings at each and feel which base gives you the most powerful, balanced turn.",
  },
];
