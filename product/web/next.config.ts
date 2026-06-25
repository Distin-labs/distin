import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  turbopack: { root: "/Users/crypto/Downloads/concept-machine" },
  outputFileTracingRoot: "/Users/crypto/Downloads/concept-machine",
};
export default nextConfig;
