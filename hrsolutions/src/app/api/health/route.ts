import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    app: 'Unified Business Operating System (Acme OS)',
    framework: 'Next.js 15+ App Router',
    timestamp: new Date().toISOString(),
  });
}
