// Smoke test: private Blob store round trip (upload → signed URL → fetch → delete)
// Run: node --env-file=.env.local scripts/blob-smoke.mjs
import { put, del, issueSignedToken, presignUrl } from "@vercel/blob";

const pathname = "videos/smoke-test.txt";

const blob = await put(pathname, "hello sandlot", { access: "private", allowOverwrite: true });
console.log("1. uploaded:", blob.pathname);

const direct = await fetch(blob.url);
console.log("2. direct fetch of private url →", direct.status, direct.status === 403 || direct.status === 401 ? "(blocked, good)" : "(NOT BLOCKED?)");

const validUntil = Date.now() + 60_000;
const token = await issueSignedToken({ pathname, operations: ["get"], validUntil });
const { presignedUrl } = await presignUrl(token, { operation: "get", pathname, access: "private", validUntil });
const signed = await fetch(presignedUrl);
console.log("3. signed fetch →", signed.status, await signed.text());

await del(pathname);
console.log("4. cleaned up");
