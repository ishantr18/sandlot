"use client";

// Auth context — who is signed in AND what role they play.
// Roles: player (default) · mentor (coach) · guardian (parent).
// Permissions are NOT read from the profile any more (a user could edit
// their own profile): coach certification comes from the admin-approved
// coachApplications doc, parent links from guardianLinks.
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { ADMIN_UIDS, getCoachApplication, linksFor, type CoachStatus } from "@/lib/family";
import { auth, db } from "@/lib/firebase";

export interface Profile {
  role: "player" | "mentor" | "guardian";
  displayName?: string;
  guardianOf?: string[]; // player uids this parent is linked to (from guardianLinks)
  verifiedMentor?: boolean; // admin approved this coach
  coachStatus?: CoachStatus;
  coachOrg?: string; // team / league / school from their application
  isAdmin?: boolean;
}

const AuthContext = createContext<{
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  refresh: () => Promise<void>; // re-read after linking / applying
}>({ user: null, profile: null, loading: true, refresh: async () => {} });

async function loadProfile(u: User): Promise<Profile> {
  const isAdmin = ADMIN_UIDS.includes(u.uid);
  try {
    const snap = await getDoc(doc(db, "users", u.uid));
    const base = snap.exists()
      ? { role: (snap.data().role ?? "player") as Profile["role"], displayName: snap.data().displayName as string | undefined }
      : { role: "player" as const };
    if (base.role === "mentor") {
      const app = await getCoachApplication(u.uid).catch(() => null);
      const coachStatus: CoachStatus = app?.status ?? "none";
      return {
        ...base,
        coachStatus,
        coachOrg: app?.organization,
        verifiedMentor: coachStatus === "approved",
        isAdmin,
      };
    }
    if (base.role === "guardian") {
      const links = await linksFor("guardianId", u.uid).catch(() => []);
      return { ...base, guardianOf: links.map((l) => l.playerId), isAdmin };
    }
    return { ...base, isAdmin };
  } catch {
    return { role: "player", isAdmin };
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setProfile(u ? await loadProfile(u) : null);
      setLoading(false);
    });
  }, []);

  const refresh = useCallback(async () => {
    if (auth.currentUser) setProfile(await loadProfile(auth.currentUser));
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
