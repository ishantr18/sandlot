// 404 — the page (or swing) doesn't exist.
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md p-6 pb-28 lg:max-w-5xl lg:px-10 lg:pt-12">
      <h1 className="mb-6 text-4xl font-bold tracking-tight lg:mb-10 lg:text-6xl">Foul ball</h1>
      <p className="rounded-2xl bg-card p-6 text-sm text-muted-foreground lg:max-w-md">
        We couldn&apos;t find that page.{" "}
        <Link href="/" className="text-primary underline">
          Head back home
        </Link>
        .
      </p>
    </main>
  );
}
