// 404 — the page (or swing) doesn't exist.
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md p-6 pb-28 desk:max-w-2xl wide:max-w-5xl wide:px-10 wide:pt-12">
      <h1 className="mb-6 text-4xl font-bold tracking-tight wide:mb-10 wide:text-6xl">Foul ball</h1>
      <p className="rounded-2xl bg-card p-6 text-sm text-muted-foreground wide:max-w-md">
        We couldn&apos;t find that page.{" "}
        <Link href="/" className="text-primary underline">
          Head back home
        </Link>
        .
      </p>
    </main>
  );
}
