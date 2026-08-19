// Drill library — each drill targets a specific, measurable flaw.
export interface DrillDef {
  id: string;
  name: string;
  target: string; // which metric it improves
  description: string;
}

export const DRILLS: DrillDef[] = [
  {
    id: "hip-fire-tee",
    name: "Hip fire tee drill",
    target: "Hip–shoulder separation",
    description:
      "Set up at a tee (or imaginary tee). Start your hips turning while your hands stay back — feel the stretch across your core, THEN let the hands go. 10 slow reps, 10 game-speed.",
  },
  {
    id: "balance-beam",
    name: "Balance-beam swings",
    target: "Head movement",
    description:
      "Swing while standing on a line, curb, or 2x4. If your head lunges, you fall off. 15 controlled swings staying on the line — eyes level, head quiet.",
  },
  {
    id: "stride-ladder",
    name: "Stride ladder",
    target: "Stride",
    description:
      "Mark your normal stride spot with tape. Add marks 10cm shorter and longer. Do 5 swings at each and feel which base gives you the most powerful, balanced turn.",
  },
  {
    id: "wall-bat-tempo",
    name: "Wall-bat tempo reps",
    target: "Swing tempo",
    description:
      "Stand close to a wall (back to it). Slow-motion swing without touching the wall — forces a compact, unhurried path. 10 slow reps, then 5 at full speed keeping the same rhythm.",
  },
  {
    id: "separation-stretch",
    name: "Torso separation holds",
    target: "Hip–shoulder separation",
    description:
      "Stride and turn your hips while keeping shoulders closed. Freeze 3 seconds at max stretch. 8 reps — this builds the rubber-band feeling that creates bat speed.",
  },
];
