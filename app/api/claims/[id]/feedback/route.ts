import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromHeaders } from '@/lib/auth';
import { claimsStore } from '@/lib/claimsStore';
import { logger } from '@/lib/logger';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = await getUserIdFromHeaders(request.headers);
    const body = await request.json();
    const { rating, comment } = body;

    if (!rating || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'Rating must be between 1 and 5' }, { status: 400 });
    }

    const claim = await claimsStore.getClaimById(id);
    if (!claim) {
      return NextResponse.json({ error: 'Claim not found' }, { status: 404 });
    }

    const report = await claimsStore.getReportByClaim(id);
    if (!report) {
      return NextResponse.json({ error: 'No report found for this claim' }, { status: 404 });
    }

    await claimsStore.createFeedback(userId, report.id, rating, comment);
    return NextResponse.json({ status: 'success', message: 'Feedback submitted successfully' });
  } catch (error: any) {
    logger.error('Error submitting feedback', error);
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 500 });
  }
}
