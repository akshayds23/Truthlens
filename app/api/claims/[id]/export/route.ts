import { NextRequest, NextResponse } from 'next/server';
import { claimsStore } from '@/lib/claimsStore';
import { logger } from '@/lib/logger';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'json';

    const report = await claimsStore.getReportByClaim(id);
    if (!report) {
      return NextResponse.json({ error: 'No report found for this claim' }, { status: 404 });
    }

    if (format === 'markdown') {
      const lines = [
        `# Fact-Check Report`, '',
        `**Verdict:** ${report.verdict}`,
        `**Confidence:** ${(report.confidence * 100).toFixed(1)}%`, '',
        `## Explanation`, report.explanation, '',
        `**Generated:** ${report.generated_at}`,
      ];
      const md = lines.join('\n');
      return new Response(md, {
        headers: {
          'Content-Type': 'text/markdown',
          'Content-Disposition': `attachment; filename="report-${id}.md"`,
        },
      });
    }

    // JSON export
    const full = report.full_report_json || {};
    return NextResponse.json({ status: 'success', data: { ...report, ...full } });
  } catch (error: any) {
    logger.error('Error exporting report', error);
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 500 });
  }
}
