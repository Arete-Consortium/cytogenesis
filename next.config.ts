import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  ...(process.env.NEXT_PUBLIC_ITCH_BUILD === "1" ? {
    output: "export",
    assetPrefix: "./",
    images: { unoptimized: true },
  } : {}),
  turbopack: {
    root: path.resolve(process.cwd()),
  },
};

export default nextConfig;
