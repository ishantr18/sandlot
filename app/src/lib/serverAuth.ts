// Server-side check of WHO is calling an API route.
// The browser sends its Firebase ID token (a signed pass that Firebase gives
// a signed-in user, valid ~1 hour). We verify Google's signature on it with
// Google's PUBLIC keys — no secret key needed — and read the user's uid.
import { createRemoteJWKSet, jwtVerify } from "jose";

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!;
const GOOGLE_KEYS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
);

// Returns the caller's uid, or null if the token is missing/forged/expired.
export async function verifyIdToken(token: string | null | undefined): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, GOOGLE_KEYS, {
      issuer: `https://securetoken.google.com/${PROJECT_ID}`,
      audience: PROJECT_ID,
    });
    return typeof payload.sub === "string" && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}

export function bearer(request: Request): string | null {
  const h = request.headers.get("authorization") ?? "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}
