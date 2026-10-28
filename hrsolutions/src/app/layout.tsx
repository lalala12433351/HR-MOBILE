import React from 'react';
import type { Metadata, Viewport } from 'next';
import './globals.css';
import './mobile.css';
import './mobile-v2.css';
import './mobile-figma.css';
import { AppShell } from '@/components/layout/AppShell';

export const metadata: Metadata = {
  title: 'Pixbe | Modern Workforce & Human Resource Management',
  description:
    'Manage your HR tasks smarter, faster, and easier — all in one place with Pixbe.',
};

export const viewport: Viewport = {
  themeColor: '#f3f5f7',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en-GB"
      className="font-sans"
      data-theme="light"
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,200..800;1,200..800&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased font-sans">
        <AppShell>{children}</AppShell>
      {/* impeccable-live-start */}
<script src="http://localhost:8400/live.js?token=1e104352-1d35-4001-bd47-d81a37cae413"></script>
{/* impeccable-live-end */}
</body>
    </html>
  );
}
