import { fileURLToPath } from 'node:url';
const isVercel = Boolean(process.env.VERCEL);
const isMobile = process.env.MOBILE_BUILD === '1';

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(isMobile ? { output: 'export', trailingSlash: true } : isVercel ? {} : { output: 'standalone' }),
  turbopack: { root: isMobile ? fileURLToPath(new URL('../', import.meta.url)) : import.meta.dirname },
  experimental: { turbopackPluginRuntimeStrategy: 'workerThreads' },
  reactStrictMode: true,
  images: {
    ...(isMobile ? { unoptimized: true } : {}),
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
  ...(!isMobile ? {
    async rewrites() {
      const rawUrl = process.env.BACKEND_INTERNAL_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080';
      const backendUrl = rawUrl.replace(/\/+$/, '');
      return [
        { source: '/api/v1/:path*', destination: `${backendUrl}/api/v1/:path*` },
        { source: '/health', destination: `${backendUrl}/health` },
      ];
    },
  } : {}),
};
export default nextConfig;
