"use client";

// Auth context — who is signed in AND what role they play.
// Roles: player (default) · mentor (coach) · guardian (parent).
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { createContext, useContext, useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";

export interface Profile {
  role: "player" | "mentor" | "guardian";
  displayName?: string;
  guardianOf?: string[]; // player uids this guardian watches
  verifiedMentor?: boolean;
}

const AuthContext = createContext<{
  user: User | null;
  profile: Profile | null;
  loading: boolean;
}>({ user: null, profile: null, loading: true });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const snap = await getDoc(doc(db, "users", u.uid));
          if (snap.exists()) {
            const p = snap.data() as Profile & { email?: string };
            // Self-heal pre-Aug-20 profiles: backfill email so parents can link
            if (!p.email && u.email) {
              await setDoc(
                doc(db, "users", u.uid),
                { email: u.email.toLowerCase() },
                { merge: true },
              ).catch(() => {});
            }
            setProfile(p);
          } else {
            setProfile({ role: "player" });
          }
        } catch {
          setProfile({ role: "player" });
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
