import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 p-8 text-center">
      <h1 className="text-5xl font-semibold tracking-tight text-zinc-100">
        Cytogenesis
      </h1>
      <p className="max-w-md text-base text-zinc-400">
        Drift. Capture. Evolve. A roguelike cellular-automation game.
      </p>
      <Link
        href="/play"
        className="rounded-full border border-zinc-700 px-6 py-3 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-800"
      >
        Begin →
      </Link>
      <p className="text-xs text-zinc-600">phase 0 · scaffold + canvas loop</p>
    </main>
  );
}
