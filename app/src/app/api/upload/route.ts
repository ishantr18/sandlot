// Token handshake for client uploads.
// The browser NEVER sees BLOB_READ_WRITE_TOKEN (it lives only on the server).
// Instead the client asks this route for permission, and we mint a short-lived,
// constrained token: videos only, size-capped, expiring. See docs/BLUEPRINT.md.
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ["video/*"],
        maximumSizeInBytes: 200 * 1024 * 1024, // 200 MB — a 30s phone clip is far below this
        validUntil: Date.now() + 10 * 60 * 1000, // token dies in 10 minutes
        addRandomSuffix: true, // no guessable filenames
      }),
      // Fires via webhook when an upload completes (not on localhost — Blob's
      // servers can't reach your laptop). Firestore session records are written
      // client-side after upload for now; revisit in Phase 4.
      onUploadCompleted: async () => {},
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}
