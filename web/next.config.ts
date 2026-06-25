import type { NextConfig } from "next";
import path from "path";

const root = path.join(__dirname, "..", "..", "..");
const onVercel = !!process.env.VERCEL;

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // Local: pin the turbopack/tracing root so the template's node_modules junction resolves inside the repo root.
  // Vercel: not needed (node_modules is installed fresh); pinning it would point outside the project and break the build, so omit it.
  ...(onVercel
    ? {}
    : {
        turbopack: { root },
        outputFileTracingRoot: root,
      }),
};

export default nextConfig;