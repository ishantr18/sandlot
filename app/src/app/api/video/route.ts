// Playback for a PRIVATE blob: mint an expiring signed URL.
// Videos of kids never sit on a public URL — every view goes through
// this route and the link dies 15 minutes later.
//
// Who may watch? We don't re-implement the answer here: the route fetches
// the session from Firestore AS THE CALLER (with their own ID token), so the
// same security rules that guard the database decide — the player, their
// linked parent, a certified coach, or the admin. Anyone else gets a 403.
// (v1 took any file path from anyone. Closed Oct 3.)
import { issueSignedToken, presignUrl } from "@vercel/blob";
import { NextResponse } from "next/server";
import { bearer } from "@/lib/serverAuth";

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!;

export async function GET(request: Request): Promise<NextResponse> {
  const sessionId = new URL(request.url).searchParams.get("session");
  const token = bearer(request);
  if (!sessionId || !/^[A-Za-z0-9]{1,64}$/.test(sessionId)) {
    return NextResponse.json({ error: "Invalid session" }, { status: 400 });
  }
  if (!token) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  // Read the session as the caller — Firestore verifies the token and applies
  // the rules. 403/404 here means "not yours to watch".
  const fs = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/sessions/${sessionId}?mask.fieldPaths=videoPathname`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  );
  if (!fs.ok) {
    return NextResponse.json({ error: "Not allowed" }, { status: fs.status === 401 ? 401 : 403 });
  }
  const pathname = ((await fs.json()) as { fields?: { videoPathname?: { stringValue?: string } } })
    .fields?.videoPathname?.stringValue;
  if (!pathname || !pathname.startsWith("videos/")) {
    return NextResponse.json({ error: "No video" }, { status: 404 });
  }

  try {
    const validUntil = Date.now() + 15 * 60 * 1000; // 15-minute lifetime

    // 1) Ask the Blob API for a delegation scoped to ONLY this file, read-only
    const signedToken = await issueSignedToken({
      pathname,
      operations: ["get"],
      validUntil,
    });

    // 2) Turn the delegation into a fetchable URL for the <video> tag
    const { presignedUrl } = await presignUrl(signedToken, {
      operation: "get",
      pathname,
      access: "private",
      validUntil,
    });

    return NextResponse.json({ url: presignedUrl });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
