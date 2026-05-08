import GameCanvas from "@/components/GameCanvas";
import Link from "next/link";

export default function PlayPage() {
  return (
    <div className="play-shell relative flex flex-col">
      <Link
        href="/"
        aria-label="Back to title"
        className="absolute right-2 top-2 z-30 inline-flex h-11 min-w-[44px] items-center justify-center rounded-full bg-black/50 px-4 font-mono text-xs text-zinc-200 backdrop-blur hover:bg-black/70 active:bg-black/80"
        style={{
          top: "max(0.5rem, env(safe-area-inset-top))",
          right: "max(0.5rem, env(safe-area-inset-right))",
        }}
      >
        ← back
      </Link>
      <GameCanvas />
    </div>
  );
}
