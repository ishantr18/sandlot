"use client";

// Puts data-skin="field" on <html> for the roles listed in FIELD_SKIN_ROLES.
// Remembers the last choice so a reload paints the right look immediately
// (the inline script in layout.tsx reads it before React loads).
import { useEffect } from "react";
import { useAuth } from "@/components/AuthProvider";
import { fieldSkinOn } from "@/lib/skin";

export default function SkinSwitch() {
  const { user, profile, loading } = useAuth();
  useEffect(() => {
    if (loading) return;
    const on = !!user && fieldSkinOn(profile?.role);
    const html = document.documentElement;
    if (on) html.dataset.skin = "field";
    else delete html.dataset.skin;
    try {
      if (on) localStorage.setItem("dd-skin", "field");
      else localStorage.removeItem("dd-skin");
    } catch {}
  }, [user, profile, loading]);
  return null;
}
