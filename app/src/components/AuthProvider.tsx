"use client";

// Auth context — who is signed in AND what role they play.
// Roles: player (default) · mentor (coach) · guardian (parent).
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
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
          setProfile(snap.exists() ? (snap.data() as Profile) : { role: "player" });
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
