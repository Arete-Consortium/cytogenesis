import Link from "next/link";
import TitleStats from "@/components/TitleStats";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-12 text-center sm:gap-8 sm:p-8">
      <h1 className="text-4xl font-semibold tracking-tight text-zinc-100 sm:text-5xl">
        Cytogenesis
      </h1>
      <p className="max-w-md text-sm text-zinc-400 sm:text-base">
        Drift. Capture. Evolve. A roguelike cellular-automation game.
      </p>
      <Link
        href="/play"
        className="inline-flex h-12 min-w-[200px] items-center justify-center rounded-full border border-zinc-700 px-8 font-medium text-zinc-100 transition-colors hover:bg-zinc-800 active:bg-zinc-900"
      >
        Begin →
      </Link>
      <TitleStats />
    </main>
  );
}
