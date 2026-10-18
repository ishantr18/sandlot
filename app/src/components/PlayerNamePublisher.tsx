"use client";

// Players share ONLY their first name with coaches (switch: COACH_SEES_PLAYER).
// Written to playerNames/{uid} = { firstName }; nothing else about the player
// is readable by coaches. With the switch on "anon", the doc is removed.
import { deleteDoc, doc, getDoc, setDoc } from "firebase/firestore";
import { useEffect } from "react";
import { useAuth } from "@/components/AuthProvider";
import { db } from "@/lib/firebase";
import { COACH_SEES_PLAYER } from "@/lib/switches";

export default function PlayerNamePublisher() {
  const { user, profile } = useAuth();
  useEffect(() => {
    if (!user || profile?.role !== "player") return;
    const ref = doc(db, "playerNames", user.uid);
    if (COACH_SEES_PLAYER !== "firstName") {
      deleteDoc(ref).catch(() => {});
      return;
    }
    const firstName = (user.displayName ?? "").trim().split(/\s+/)[0]?.slice(0, 30);
    if (!firstName) return;
    getDoc(ref)
      .then((d) => (d.data()?.firstName === firstName ? null : setDoc(ref, { firstName })))
      .catch(() => {});
  }, [user, profile]);
  return null;
}
