// Token handshake for client uploads.
// The browser NEVER sees BLOB_READ_WRITE_TOKEN (it lives only on the server).
// Instead the client asks this route for permission, and we mint a short-lived,
// constrained token: videos only, size-capped, expiring. See docs/BLUEPRINT.md.
//
// Only a SIGNED-IN user gets a token: the browser sends its Firebase ID token
// as the upload's clientPayload and we verify Google's signature on it.
// (v1 handed a token to anyone on the internet. Closed Oct 3.)
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/serverAuth";

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const uid = await verifyIdToken(clientPayload);
        if (!uid) throw new Error("Sign in to upload.");
        if (!pathname.startsWith("videos/")) throw new Error("Invalid upload path.");
        return {
          allowedContentTypes: ["video/*"],
          maximumSizeInBytes: 200 * 1024 * 1024, // 200 MB — a 30s phone clip is far below this
          validUntil: Date.now() + 10 * 60 * 1000, // token dies in 10 minutes
          addRandomSuffix: true, // no guessable filenames
        };
      },
      // Fires via webhook when an upload completes (not on localhost — Blob's
      // servers can't reach your laptop). Firestore session records are written
      // client-side after upload.
      onUploadCompleted: async () => {},
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
