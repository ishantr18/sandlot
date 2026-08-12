// Playback for a PRIVATE blob: mint an expiring signed URL.
// Videos of kids never sit on a public URL — every view goes through
// this route and the link dies 15 minutes later.
import { issueSignedToken, presignUrl } from "@vercel/blob";
import { NextResponse } from "next/server";

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const pathname = searchParams.get("pathname");

  if (!pathname || !pathname.startsWith("videos/")) {
    return NextResponse.json({ error: "Invalid pathname" }, { status: 400 });
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
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}
