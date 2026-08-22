// Player anonymity: coaches see a stable number, never a name.
// Derived from the uid so the same player keeps the same number
// (a coach can recognize "Player #7F3K improved" without knowing who they are).
export function anonPlayer(uid: string): string {
  return `Player #${uid.slice(0, 4).toUpperCase()}`;
}
