import GameCanvas from "@/components/GameCanvas";
import Link from "next/link";

export default function PlayPage() {
  return (
    <div className="relative flex h-screen w-screen flex-col">
      <Link
        href="/"
        className="absolute right-3 top-3 z-10 rounded bg-black/40 px-2 py-1 font-mono text-[11px] text-zinc-300 backdrop-blur hover:bg-black/60"
      >
        ← back
      </Link>
      <GameCanvas />
    </div>
  );
}
