import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromHeaders } from '@/lib/auth';
import { claimsStore } from '@/lib/claimsStore';
import { logger } from '@/lib/logger';
import { AppError } from '@/lib/errors';

// Mapping helpers (same as parent route)
function clipText(text: string, maxChars = 280): string {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxChars) return normalized;
  const truncated = normalized.slice(0, maxChars);
  const lastSpace = truncated.lastIndexOf(' ');
  return `${(lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated).trimEnd()}...`;
}

const mapEvidence = (items: any[] = [], isSupporting: boolean) =>
  items.map((item, index) => ({
    id: `${isSupporting ? 'support' : 'contradict'}-${index + 1}`,
    source: item.source || item.source_url || 'Unknown source',
    sourceUrl: item.source || item.source_url || '#',
    excerpt: clipText(item.text || item.evidence || ''),
    credibilityScore: typeof item.relevance === 'number' ? item.relevance : 0.8,
    isSupporting,
  }));

const mapCitations = (items: any[] = []) =>
  items.map((item, index) => ({
    id: `citation-${index + 1}`,
    url: item.source_url || item.url || '#',
    title: item.claim || item.title || `Source ${index + 1}`,
    credibilityScore: typeof item.confidence === 'number' ? item.confidence : 0.8,
    excerpt: clipText(item.evidence || ''),
  }));

const mapSubClaims = (items: any[] = []) =>
  items.map((item) => ({
    id: item.id, text: item.text,
    verdict: item.verdict || 'UNVERIFIABLE',
    confidence: typeof item.confidence === 'number' ? item.confidence : 0,
    evidence: [],
  }));

function mapReport(claimId: string, report: any) {
  const full = report?.full_report_json || {};
  return {
    id: report.id, claimId, verdict: report.verdict, confidence: report.confidence,
    reasoning: report.explanation,
    subClaims: mapSubClaims(full.sub_claims),
    supportingEvidence: mapEvidence(full.supporting_evidence, true),
    contradictingEvidence: mapEvidence(full.contradicting_evidence, false),
    citations: mapCitations(full.citations),
    createdAt: report.generated_at,
  };
}

function mapClaim(claim: any, report?: any) {
  return {
    id: claim.id, text: claim.text, category: claim.category,
    depth: claim.depth, status: claim.status,
    verdict: report?.verdict, confidence: report?.confidence,
    createdAt: claim.created_at, completedAt: report?.generated_at, report,
  };
}

// ── GET /api/claims/[id] ──
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const claim = await claimsStore.getClaimById(id);
    if (!claim) {
      return NextResponse.json({ error: 'Claim not found' }, { status: 404 });
    }
    const report = await claimsStore.getReportByClaim(id);
    const mappedReport = report ? mapReport(claim.id, report) : undefined;
    return NextResponse.json({ claim: mapClaim(claim, mappedReport), report: mappedReport });
  } catch (error: any) {
    logger.error('Error getting claim', error);
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 500 });
  }
}

// ── DELETE /api/claims/[id] ──
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = await getUserIdFromHeaders(request.headers);
    const claim = await claimsStore.getClaimById(id);
    if (!claim) {
      return NextResponse.json({ error: 'Claim not found' }, { status: 404 });
    }
    if (claim.user_id !== userId) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }
    await claimsStore.softDeleteClaim(id);
    return NextResponse.json({ status: 'success', message: 'Claim deleted successfully' });
  } catch (error: any) {
    logger.error('Error deleting claim', error);
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 500 });
  }
}
