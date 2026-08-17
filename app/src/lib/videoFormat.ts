// Device-adaptive video format selection.
//
// Some machines LIE about their codec support (claim "probably" playable,
// then fail to decode their own recordings — seen on a Windows/Acer test
// machine with vp9). So we don't just trust the browser's claims: when a
// format produces an unreadable file, we blacklist it ON THIS DEVICE
// (localStorage) and the next attempt automatically uses the next candidate.

const CANDIDATES: [string, string][] = [
  ["video/webm;codecs=vp9", "webm"],
  ["video/webm;codecs=vp8", "webm"],
  ["video/webm", "webm"],
  ["video/mp4", "mp4"],
];

const KEY = "dd-bad-mimes";

function norm(m: string): string {
  return m.toLowerCase().replace(/["\s]/g, "");
}

export function badMimes(): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

export function blacklistMime(mime: string): void {
  if (!mime || typeof localStorage === "undefined") return;
  const bad = badMimes();
  if (!bad.some((b) => norm(b) === norm(mime))) {
    bad.push(mime);
    localStorage.setItem(KEY, JSON.stringify(bad));
  }
}

function isBlacklisted(mime: string): boolean {
  const bad = badMimes().map(norm);
  const m = norm(mime);
  // A recorded file's type may carry extra codec detail — match loosely
  return bad.some((b) => b === m || b.startsWith(m) || m.startsWith(b));
}

export function pickMimeType(): { mime: string; ext: string } {
  const probe = typeof document !== "undefined" ? document.createElement("video") : null;
  for (const [mime, ext] of CANDIDATES) {
    if (isBlacklisted(mime)) continue;
    if (
      typeof MediaRecorder !== "undefined" &&
      MediaRecorder.isTypeSupported(mime) &&
      probe &&
      probe.canPlayType(mime) !== ""
    ) {
      return { mime, ext };
    }
  }
  return { mime: "", ext: "webm" }; // last resort: let the browser choose
}

export function formatSupportMatrix(): string {
  const probe = typeof document !== "undefined" ? document.createElement("video") : null;
  const bad = badMimes();
  return CANDIDATES.map(([m]) => {
    const rec =
      typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)
        ? "rec"
        : "-";
    const play = probe ? probe.canPlayType(m) || "-" : "?";
    const black = bad.some((b) => norm(b) === norm(m)) ? "/BLOCKED" : "";
    return `${m}[${rec}/${play}${black}]`;
  }).join(" ");
}
