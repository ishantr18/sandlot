// Browser side of video playback: ask our server for a 15-minute link to ONE
// session's video, proving who we are with the Firebase ID token. The server
// only answers if the database rules let this user read that session.
import { auth } from "./firebase";

export async function playbackUrl(sessionId: string): Promise<string | null> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) return null;
  const res = await fetch(`/api/video?session=${encodeURIComponent(sessionId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return ((await res.json()) as { url: string }).url;
}
