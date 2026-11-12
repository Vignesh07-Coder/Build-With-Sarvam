import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Consume @tattva/contracts' TypeScript source directly (no separate
  // build step for internal packages — ADR-001).
  transpilePackages: ['@tattva/contracts'],
};

export default nextConfig;
