import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { title, headers, rows } = await req.json();
    if (!headers || !rows) {
      return NextResponse.json({ error: 'Headers and rows required' }, { status: 400 });
    }

    const csvContent = [
      headers.join(','),
      ...rows.map((row: any[]) =>
        row.map((val) => `"${String(val ?? '').replace(/"/g, '""')}"`).join(',')
      ),
    ].join('\n');

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${title || 'report'}.csv"`,
      },
    });
  } catch (err: any) {
    console.error('CSV Export Error:', err);
    return NextResponse.json({ error: 'Failed to generate export file' }, { status: 500 });
  }
}
