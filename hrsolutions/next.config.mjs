const isVercel = Boolean(process.env.VERCEL);

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(isVercel ? {} : { output: 'standalone' }),
  // Parent repo also has a lockfile; without this, Hostinger/Turbopack infers the
  // workspace root as the monorepo and PostCSS dies compiling globals.css.
  turbopack: {
    root: import.meta.dirname,
  },
  // Hostinger blocks the loopback port Turbopack uses to reach its PostCSS child
  // process, which panics on globals.css ("node process exited before we could
  // connect"). Worker threads keep that work inside the Next.js process.
  experimental: {
    turbopackPluginRuntimeStrategy: 'workerThreads',
  },
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  async rewrites() {
    const rawUrl = process.env.BACKEND_INTERNAL_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080';
    const backendUrl = rawUrl.replace(/\/+$/, '');
    return [
      {
        source: '/api/v1/:path*',
        destination: `${backendUrl}/api/v1/:path*`,
      },
      {
        source: '/health',
        destination: `${backendUrl}/health`,
      },
    ];
  },
};

export default nextConfig;


