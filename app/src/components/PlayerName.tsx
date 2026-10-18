"use client";

// A player's name as a coach sees it: first name only, or "Player #7F3K"
// (switch: COACH_SEES_PLAYER). Names are fetched once per player and cached.
import { doc, getDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { anonPlayer } from "@/lib/anon";
import { db } from "@/lib/firebase";
import { COACH_SEES_PLAYER } from "@/lib/switches";

const cache = new Map<string, Promise<string | null>>();

function firstNameOf(uid: string): Promise<string | null> {
  let p = cache.get(uid);
  if (!p) {
    p = getDoc(doc(db, "playerNames", uid))
      .then((d) => (d.data()?.firstName as string | undefined)?.trim() || null)
      .catch(() => null);
    cache.set(uid, p);
  }
  return p;
}

export default function PlayerName({ uid }: { uid: string }) {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    if (COACH_SEES_PLAYER !== "firstName") return;
    let live = true;
    firstNameOf(uid).then((n) => live && setName(n));
    return () => {
      live = false;
    };
  }, [uid]);
  // Until it loads (or if the player hasn't published a name), the number shows
  return <>{name ?? anonPlayer(uid)}</>;
}
