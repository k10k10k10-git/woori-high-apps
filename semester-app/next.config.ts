import type { NextConfig } from "next";

// 빌드마다 고유한 ID — 새 버전 배포 감지(UpdateBanner)에 사용.
// Vercel은 커밋 SHA를 제공하므로 그걸 쓰고, 로컬 빌드는 타임스탬프로 대체한다.
const BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA || String(Date.now());

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_BUILD_ID: BUILD_ID },
  async redirects() {
    return [
      {
        source: "/",
        destination: "https://woorihigh-app.vercel.app/semesters",
        permanent: false,
      },
      {
        source: "/semester/:path*",
        destination: "https://woorihigh-app.vercel.app/semester/:path*",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
