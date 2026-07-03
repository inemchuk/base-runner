import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root: an orphaned ~/package-lock.json makes Next infer
  // the wrong root. __dirname is this project directory.
  outputFileTracingRoot: __dirname,
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
