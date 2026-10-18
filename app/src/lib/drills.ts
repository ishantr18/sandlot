// Drill library — each drill targets a specific, measurable flaw.
// All equipment-free (a bat, or an imaginary one). IDs are stored in
// Firestore assignments, so never rename an existing id — add new ones.
export interface DrillDef {
  id: string;
  name: string;
  target: string; // which metric it improves
  category: DrillCategory;
  description: string;
  // Demo videos from established hitting coaches / orgs. Every link was
  // checked against YouTube (title + channel) on Oct 17, 2026.
  videos?: DrillVideo[];
}

export interface DrillVideo {
  url: string;
  title: string;
  channel: string;
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
    videos: [
      { url: "https://www.youtube.com/watch?v=avCj7JZZTzQ", title: "3 Drills for Using Your Lower Half Properly", channel: "Hitting Done Right" },
    ],
  },
  {
    id: "separation-stretch",
    name: "Torso separation holds",
    target: "Hip–shoulder separation",
    category: "hips",
    description:
      "Stride and turn your hips while keeping shoulders closed. Freeze 3 seconds at max stretch. 8 reps — this builds the rubber-band feeling that creates bat speed.",
    videos: [
      { url: "https://www.youtube.com/watch?v=U2KBltwQ_yk", title: "Hip to Shoulder Separation Drill", channel: "Antonelli Baseball" },
    ],
  },
  {
    id: "step-back",
    name: "Step-back drill",
    target: "Kinematic sequence",
    category: "hips",
    description:
      "Start with your feet together. Step your back foot back into your stance, then stride forward and swing in one flowing motion. The momentum teaches the lower half to lead. 10 slow, 10 game-speed.",
    videos: [
      { url: "https://www.youtube.com/watch?v=AkwKO0J2SEM", title: "Step Backs", channel: "Driveline Baseball" },
      { url: "https://www.youtube.com/watch?v=oBk4EUB3kdk", title: "Youth Hitting Drill – The Step Back", channel: "Driveline Youth" },
    ],
  },

  // ── Lunge (head drift after foot plant) ──
  {
    id: "no-stride",
    name: "No-stride swings",
    target: "Head movement",
    category: "head",
    description:
      "Set your feet a little wider than normal with your front foot already down. Swing with NO stride — rotate only. With nowhere to lunge, you feel what turning in place is like. 15 swings, head still.",
    videos: [
      { url: "https://www.youtube.com/watch?v=hbp36iPevck", title: "The No Stride Drill", channel: "ProSwingNY" },
      { url: "https://www.youtube.com/watch?v=IwppyEitjSg", title: "No Stride Hip Load Drill", channel: "Blast Motion" },
    ],
  },
  {
    id: "balance-beam",
    name: "Balance-beam swings",
    target: "Head movement",
    category: "head",
    description:
      "Swing while standing on a line, curb, or 2x4. If your head lunges, you fall off. 15 controlled swings staying on the line — eyes level, head quiet.",
    videos: [
      { url: "https://www.youtube.com/watch?v=dq0iGcrRLIk", title: "Balance Beam Hitting Drills", channel: "Jack Perconte" },
    ],
  },

  // ── Front-knee brace ──
  {
    id: "firm-front-side",
    name: "Firm-front-side finish",
    target: "Front-knee brace",
    category: "frontLeg",
    description:
      "Swing at 70% speed and freeze at contact. Your front leg should be firm — nearly straight — like a post you're turning against. Hold 2 seconds, check it, reset. 10 reps, then 5 at full speed with the same firm post.",
    videos: [
      { url: "https://www.youtube.com/watch?v=g9MhTZYIPS4", title: "Your Front Leg at the Plate", channel: "MLB Network" },
      { url: "https://www.youtube.com/watch?v=c9Hh7Jlgrjs", title: "Out in Front – Front Leg Focus Drill", channel: "Baseball Rebellion" },
    ],
  },

  // ── Backside collapse (shoulder dip at launch) ──
  {
    id: "high-tee",
    name: "High-tee swings",
    target: "Shoulder tilt",
    category: "shoulders",
    description:
      "Set the tee (or imagine the pitch) at the top of the strike zone. You can't hit a high ball with a dropped back shoulder, so it trains you to stay tall through the load. 15 swings, level shoulders at launch.",
    videos: [
      { url: "https://www.youtube.com/watch?v=0BYiG_0saOY", title: "High Tee", channel: "Driveline Baseball" },
      { url: "https://www.youtube.com/watch?v=Nstgnb1tv9k", title: "Hitting Tip – High Tee", channel: "Ripken Baseball" },
    ],
  },
  {
    id: "wall-behind-back-foot",
    name: "Wall behind back foot",
    target: "Shoulder tilt",
    category: "shoulders",
    description:
      "Stand with your back foot about a foot in front of a wall or fence. Take slow swings without your back knee or hip bumping it — collapsing the back side pushes you backward into the wall. 10 slow, 5 game-speed.",
    videos: [
      { url: "https://www.youtube.com/watch?v=BaTJaWV0hO8", title: "Backside Barrier – Don't Collapse the Backside", channel: "Hitting Done Right" },
      { url: "https://www.youtube.com/watch?v=Cy0m9HuIBmA", title: "Wall Drill Variations to Shorten the Swing Path", channel: "Hitting Done Right" },
    ],
  },

  // ── Tempo ──
  {
    id: "wall-bat-tempo",
    name: "Wall-bat tempo reps",
    target: "Swing tempo",
    category: "tempo",
    description:
      "Stand close to a wall (back to it). Slow-motion swing without touching the wall — forces a compact, unhurried path. 10 slow reps, then 5 at full speed keeping the same rhythm.",
    videos: [
      { url: "https://www.youtube.com/watch?v=IjrSQZ6OJDA", title: "Staying Inside the Ball", channel: "MLB Network" },
      { url: "https://www.youtube.com/watch?v=rw7rZu160E0", title: "How to Make Your Swing Shorter and Quicker", channel: "Antonelli Baseball" },
    ],
  },

  // ── Stride ──
  {
    id: "stride-ladder",
    name: "Stride ladder",
    target: "Stride",
    category: "stride",
    description:
      "Mark your normal stride spot with tape. Add marks 10cm shorter and longer. Do 5 swings at each and feel which base gives you the most powerful, balanced turn.",
    videos: [
      { url: "https://www.youtube.com/watch?v=pIlU4MiaFwM", title: "Stride Check Drill", channel: "SKLZ" },
      { url: "https://www.youtube.com/watch?v=VINFv7mhp5A", title: "Three Stride Drill", channel: "Baseball Rebellion" },
    ],
  },

  // ── Added Oct 17, 2026 (library only; videos from established coaches) ──
  {
    id: "walk-through",
    name: "Walk-through swings",
    target: "Rhythm and sequence",
    category: "tempo",
    description:
      "Start a couple of steps behind your stance, walk forward into your load and stride, and swing in one smooth motion. Feel your legs and hips lead the bat.",
    videos: [
      { url: "https://www.youtube.com/watch?v=d_Bw3KL2om4", title: "Walk Through", channel: "Driveline Baseball" },
      { url: "https://www.youtube.com/watch?v=gZ4Uvc1fmqA", title: "The Walk Through Drill", channel: "Pro Baseball Insider" },
    ],
  },
  {
    id: "hook-em",
    name: "Hook 'Em drill",
    target: "Hip–shoulder separation",
    category: "hips",
    description:
      "As you stride, let your hips start to turn while your chest stays turned in, then let the shoulders and bat follow. Hips first, then hands.",
    videos: [
      { url: "https://www.youtube.com/watch?v=IyCE0hey7-I", title: "Hook 'Em", channel: "Driveline Baseball" },
    ],
  },
  {
    id: "offset-closed",
    name: "Offset closed stance swings",
    target: "Torso rotation",
    category: "hips",
    description:
      "Set your front foot a little closer to the plate than normal (a closed stance) and swing. You have to turn your hips and chest all the way through to square up the ball.",
    videos: [
      { url: "https://www.youtube.com/watch?v=FS2kDqBOM9s", title: "Offset Closed", channel: "Driveline Baseball" },
    ],
  },
  {
    id: "stay-back",
    name: "Stay-back swings",
    target: "Head movement",
    category: "head",
    description:
      "Stride softly and keep your head behind your front knee as you swing. If your head drifts toward the pitcher, start again slower.",
    videos: [
      { url: "https://www.youtube.com/watch?v=OOCM_BazSao", title: "3 Hitting Drills to Stop Lunging", channel: "Antonelli Baseball" },
      { url: "https://www.youtube.com/watch?v=Ax1iuZ2MVLs", title: "3 Drills to Keep Your Weight Back", channel: "YouGoProBaseball" },
    ],
  },
  {
    id: "offset-open",
    name: "Offset open / opposite-field tee",
    target: "Posture and bat path",
    category: "shoulders",
    description:
      "Open your front foot a little and set the tee slightly deeper. Keep your posture and drive the ball to the opposite field.",
    videos: [
      { url: "https://www.youtube.com/watch?v=6t4FASZanQA", title: "Offset Open", channel: "Driveline Baseball" },
    ],
  },
  {
    id: "kick-back",
    name: "Kick-back drill",
    target: "Front shoulder closed",
    category: "shoulders",
    description:
      "Swing at a tee while keeping your front shoulder pointed at the pitcher until your hips go. Don't let your shoulder fly open early.",
    videos: [
      { url: "https://www.youtube.com/watch?v=zd1wQiawQLk", title: "The Kick Back Drill", channel: "Pro Baseball Insider" },
    ],
  },
  {
    id: "connection-ball",
    name: "Towel connection swings",
    target: "Staying connected (no casting)",
    category: "shoulders",
    description:
      "Tuck a rolled-up towel under your front arm and swing without letting it drop until after contact. It keeps your arms connected to your turn.",
  },
  {
    id: "one-arm",
    name: "One-hand swings",
    target: "Short, quick hand path",
    category: "tempo",
    description:
      "Choke up on a light bat, hold it with one hand, and hit off a tee with short, quick swings. Do top hand, then bottom hand.",
    videos: [
      { url: "https://www.youtube.com/watch?v=U3Rj-f1xN04", title: "Hitting Tip – One Arm Drill", channel: "Ripken Baseball" },
    ],
  },
  {
    id: "kershaw-balance",
    name: "Kershaw balance load",
    target: "Back-hip load and balance",
    category: "stride",
    description:
      "Lift your front leg and pause, balanced over your back hip like a pitcher, then stride out and swing without tipping forward.",
    videos: [
      { url: "https://www.youtube.com/watch?v=r3wazOZE-MQ", title: "Kershaw", channel: "Driveline Baseball" },
    ],
  },
  {
    id: "launch-hold",
    name: "Launch-position holds",
    target: "Load and launch position",
    category: "stride",
    description:
      "Load and stride, then freeze for 2 seconds in your launch position — weight on your back side, hands back. Then swing.",
    videos: [
      { url: "https://www.youtube.com/watch?v=Ae78VrLDIHQ", title: "Ready. Set. Launch.", channel: "Matt Lisle" },
    ],
  },
];
