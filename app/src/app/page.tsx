// Home / landing — mission statement + entry point
import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center p-6 pb-24 text-center">
      <h1 className="mb-2 text-4xl font-bold">⚾ Sandlot</h1>
      <p className="mb-8 text-zinc-600">
        Pro-level baseball coaching on any phone — for every kid, not just the ones who can
        afford it.
      </p>
      <Link
        href="/upload"
        className="rounded-lg bg-green-700 px-6 py-3 font-semibold text-white"
      >
        Analyze my swing
      </Link>
    </main>
  );
}
