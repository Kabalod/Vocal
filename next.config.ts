import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  serverExternalPackages: ["ffmpeg-static", "ffprobe-static", "@prisma/client"],
  experimental: {
    serverActions: {
      bodySizeLimit: "80mb",
    },
  },
  webpack: (config, { nextRuntime }) => {
    if (nextRuntime === "edge") {
      config.resolve.alias = {
        ...config.resolve.alias,
        [path.resolve(__dirname, "src/instrumentation-node.ts")]: false,
        [path.resolve(__dirname, "src/lib/pipeline.ts")]: false,
      };
    }
    return config;
  },
};

export default nextConfig;
