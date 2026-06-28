import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromHeaders } from '@/lib/auth';
import { claimsStore } from '@/lib/claimsStore';
import { logger } from '@/lib/logger';
import { randomUUID } from 'crypto';
import { orchestrate } from '@/lib/ai/orchestrator';
import { resolveModelName } from '@/lib/ai/llmClient';

// ── Mapping helpers ──

function clipText(text: string, maxChars = 280): string {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxChars) return normalized;
  const truncated = normalized.slice(0, maxChars);
  const lastSpace = truncated.lastIndexOf(' ');
  const clipped = lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;
  return `${clipped.trimEnd()}...`;
}

const mapEvidence = (items: any[] = [], isSupporting: boolean) =>
  items.map((item, index) => ({
    id: `${isSupporting ? 'support' : 'contradict'}-${index + 1}`,
    source: item.source || item.source_url || 'Unknown source',
    sourceUrl: item.source || item.source_url || '#',
    excerpt: clipText(item.text || item.evidence || ''),
    credibilityScore: typeof item.relevance === 'number' ? item.relevance : typeof item.confidence === 'number' ? item.confidence : 0.8,
    isSupporting,
  }));

const mapCitations = (items: any[] = []) =>
  items.map((item, index) => ({
    id: `citation-${index + 1}`,
    url: item.source_url || item.url || '#',
    title: item.claim || item.title || item.source_url || item.url || `Source ${index + 1}`,
    credibilityScore: typeof item.confidence === 'number' ? item.confidence : 0.8,
    excerpt: clipText(item.evidence || ''),
  }));

const mapSubClaims = (items: any[] = []) =>
  items.map((item) => ({
    id: item.id,
    text: item.text,
    verdict: item.verdict || 'UNVERIFIABLE',
    confidence: typeof item.confidence === 'number' ? item.confidence : 0,
    evidence: [],
  }));

function mapReport(claimId: string, report: any) {
  const full = report?.full_report_json || {};
  const supportingEvidence = mapEvidence(full.supporting_evidence, true);
  const contradictingEvidence = mapEvidence(full.contradicting_evidence, false);

  return {
    id: report.id,
    claimId,
    verdict: report.verdict,
    confidence: report.confidence,
    reasoning: report.explanation,
    subClaims: mapSubClaims(full.sub_claims),
    supportingEvidence,
    contradictingEvidence,
    citations: mapCitations(full.citations),
    createdAt: report.generated_at,
  };
}

function mapClaim(claim: any, report?: any) {
  return {
    id: claim.id,
    text: claim.text,
    category: claim.category,
    depth: claim.depth,
    status: claim.status,
    verdict: report?.verdict,
    confidence: report?.confidence,
    createdAt: claim.created_at,
    completedAt: report?.generated_at,
    report,
  };
}

function resolveApiKey(provider: string, apiKey?: string): string {
  if (apiKey?.trim()) return apiKey.trim();
  const providerMap: Record<string, string | undefined> = {
    groq: process.env.GROQ_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    gemini: process.env.GEMINI_API_KEY,
    local: process.env.GROQ_API_KEY,
  };
  return providerMap[provider] || '';
}

// ── POST /api/claims — Create a new claim ──
export async function POST(request: NextRequest) {
  try {
    const userId = await getUserIdFromHeaders(request.headers);
    const body = await request.json();
    const { text, category, depth, llmProvider, apiKey } = body;

    if (!text || text.length < 10) {
      return NextResponse.json({ error: 'Claim text must be at least 10 characters' }, { status: 400 });
    }

    const jobId = `job-${randomUUID()}`;
    const claim = await claimsStore.createClaim(userId, text, category || 'other', depth || 'standard', llmProvider || 'groq', jobId);

    logger.info('Claim created', { claimId: claim.id, jobId });

    // On Vercel (or any serverless), the client stream handles execution.
    // In local dev, fire-and-forget background processing.
    const isVercel = process.env.VERCEL === '1';
    if (!isVercel) {
      processClaimAsync(claim.id, { text, category, depth, llmProvider, apiKey });
    }

    return NextResponse.json({ claimId: claim.id, jobId }, { status: 201 });
  } catch (error: any) {
    logger.error('Error creating claim', error);
    return NextResponse.json({ error: error.message || 'Failed to create claim' }, { status: error.statusCode || 500 });
  }
}

async function processClaimAsync(claimId: string, data: any) {
  try {
    await claimsStore.updateClaimStatus(claimId, 'processing');
    const apiKey = resolveApiKey(data.llmProvider, data.apiKey);
    const model = resolveModelName(data.llmProvider);

    const reportJson = await orchestrate(
      data.text, claimId, model, apiKey,
      process.env.GEMINI_API_KEY || '',
      process.env.SERPER_API_KEY || undefined,
      data.depth || 'standard',
    );

    await claimsStore.createReport(
      claimId,
      reportJson.verdict || 'UNVERIFIABLE',
      typeof reportJson.confidence === 'number' ? reportJson.confidence : 0,
      reportJson.explanation || 'No explanation returned',
      reportJson,
      'ai-service-v2.0-nextjs'
    );
    await claimsStore.updateClaimStatus(claimId, 'completed');
    logger.info('Claim processed successfully', { claimId });
  } catch (error) {
    await claimsStore.updateClaimStatus(claimId, 'failed');
    logger.error('Claim processing failed', { claimId, error });
  }
}

// ── GET /api/claims — List user claims ──
export async function GET(request: NextRequest) {
  try {
    const userId = await getUserIdFromHeaders(request.headers);
    const { searchParams } = new URL(request.url);
    let page = parseInt(searchParams.get('page') || '1');
    let limit = parseInt(searchParams.get('limit') || '10');
    if (page < 1) page = 1;
    if (limit < 1 || limit > 100) limit = 10;

    const offset = (page - 1) * limit;
    const { claims, total } = await claimsStore.getClaimsByUser(userId, limit, offset);

    const mappedClaims = await Promise.all(
      claims.map(async (claim) => {
        const report = await claimsStore.getReportByClaim(claim.id);
        const mappedReport = report ? mapReport(claim.id, report) : undefined;
        return mapClaim(claim, mappedReport);
      })
    );

    return NextResponse.json({ claims: mappedClaims, total, page, limit });
  } catch (error: any) {
    logger.error('Error getting claims', error);
    return NextResponse.json({ error: error.message || 'Failed to get claims' }, { status: error.statusCode || 500 });
  }
}
