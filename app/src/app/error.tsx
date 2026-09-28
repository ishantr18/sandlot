"use client";

// Catch-all error screen — shown if a page crashes while rendering.
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto max-w-md p-6 pb-28 lg:max-w-5xl lg:px-10 lg:pt-12">
      <h1 className="mb-6 text-4xl font-bold tracking-tight lg:mb-10 lg:text-6xl">Oops</h1>
      <section className="rounded-2xl bg-card p-6 lg:max-w-md">
        <p className="mb-4 text-sm text-destructive">
          Something went wrong loading this page — check your connection and try again.
        </p>
        <button
          onClick={() => reset()}
          className="w-full rounded-full bg-primary py-2 text-sm font-semibold text-primary-foreground"
        >
          Try again
        </button>
      </section>
    </main>
  );
}
