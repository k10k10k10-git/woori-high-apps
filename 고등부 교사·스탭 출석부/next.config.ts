import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Claude API Route를 사용하므로 output: 'export' 제외
  // Firebase Hosting 배포 시 → Firebase App Hosting 또는 Vercel 권장
};

export default nextConfig;
