import type { NextConfig } from "next";
import path from "path";

const root = path.join(__dirname, "..", "..", "..");
const onVercel = !!process.env.VERCEL;

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // 로컬: 템플릿 node_modules 정션이 root(concept-machine) 안에 들어오게 turbopack/tracing root를 고정.
  // Vercel: node_modules를 새로 설치하므로 불필요 — 오히려 프로젝트 밖을 가리켜 빌드가 깨지니 생략.
  ...(onVercel
    ? {}
    : {
        turbopack: { root },
        outputFileTracingRoot: root,
      }),
};

export default nextConfig;