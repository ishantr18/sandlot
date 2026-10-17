// Re-mounts on every navigation, so each screen gets the same entrance:
// 200ms fade + slight rise, top-level cards staggered (see globals.css).
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="dd-page contents">{children}</div>;
}
