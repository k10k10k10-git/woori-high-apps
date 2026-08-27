import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Static export for Firebase Hosting
  output: 'export',

  // Required for static export — disables Next.js image optimization
  // (Firebase Hosting serves images directly)
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
