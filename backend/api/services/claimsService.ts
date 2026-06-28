import { logger } from '../utils/logger';
import { claimsStore } from '../utils/claimsStore';
import { AppError } from '../utils/errors';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/environment';
import { orchestrate } from './ai/orchestrator';
import { resolveModelName } from './ai/llmClient';

export interface CreateClaimRequest {
  text: string;
  category: string;
  depth: string;
  llmProvider: string;
  apiKey?: string;
}

export interface FeedbackRequest {
  rating: number;
  comment?: string;
}

export interface CreateClaimResponse {
  claimId: string;
  jobId: string;
}

export interface ClaimWithReport {
  claim: any;
  report?: any;
}

export interface ClaimsListResponse {
  claims: any[];
  total: number;
  page: number;
  limit: number;
}

const clipText = (text: string, maxChars = 280): string => {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }

  const truncated = normalized.slice(0, maxChars);
  const lastSpace = truncated.lastIndexOf(' ');
  const clipped = lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;
  return `${clipped.trimEnd()}...`;
};

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

const mapClaim = (claim: any, report?: any) => ({
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
});

const mapReport = (claimId: string, report: any) => {
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
};

const resolveApiKey = (provider: string, apiKey?: string): string => {
  if (apiKey?.trim()) {
    return apiKey.trim();
  }

  const providerMap: Record<string, string | undefined> = {
    groq: process.env.GROQ_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    gemini: process.env.GEMINI_API_KEY,
    local: process.env.GROQ_API_KEY,
  };

  return providerMap[provider] || '';
};

const processClaimAsync = async (
  claimId: string,
  data: CreateClaimRequest
): Promise<void> => {
  try {
    await claimsStore.updateClaimStatus(claimId, 'processing');

    const apiKey = resolveApiKey(data.llmProvider, data.apiKey);
    const model = resolveModelName(data.llmProvider);

    // Call TypeScript orchestrator directly — no Python service needed
    const reportJson = await orchestrate(
      data.text,
      claimId,
      model,
      apiKey,
      env.GEMINI_API_KEY,
      env.SERPER_API_KEY || undefined,
      data.depth || 'standard',
    );

    await claimsStore.createReport(
      claimId,
      reportJson.verdict || 'UNVERIFIABLE',
      typeof reportJson.confidence === 'number' ? reportJson.confidence : 0,
      reportJson.explanation || 'No explanation returned',
      reportJson,
      'ai-service-v0.2.0-ts'
    );

    await claimsStore.updateClaimStatus(claimId, 'completed');
    logger.info('Claim processed successfully', { claimId });
  } catch (error) {
    await claimsStore.updateClaimStatus(claimId, 'failed');
    logger.error('Claim processing failed', { claimId, error });
  }
};


  const generateMarkdownReport = (report: any): string => {
  const lines = [
    `# Fact-Check Report`,
    ``,
    `**Verdict:** ${report.verdict}`,
    `**Confidence:** ${(report.confidence * 100).toFixed(1)}%`,
    ``,
    `## Explanation`,
    report.explanation,
    ``,
    `**Generated:** ${report.generated_at}`,
  ];

  if (report.full_report_json?.sources?.length) {
    lines.push(``, `## Sources`);
    report.full_report_json.sources.forEach((source: any, index: number) => {
      lines.push(`${index + 1}. [${source.title}](${source.url})`);
    });
  }

  return lines.join('\n');
};

export const claimsService = {
  async createClaim(
    userId: string,
    data: CreateClaimRequest
  ): Promise<CreateClaimResponse> {
    logger.info('Creating claim', { userId, category: data.category });

    // Validate user exists (simple check)
    if (!userId) {
      throw new AppError(401, 'User not authenticated');
    }

    // Generate job ID for async processing
    const jobId = `job-${uuidv4()}`;

    // Create claim in database
    const claim = await claimsStore.createClaim(
      userId,
      data.text,
      data.category,
      data.depth,
      data.llmProvider,
      jobId
    );

    logger.info('Claim created successfully', { claimId: claim.id, jobId });

    const isVercel = process.env.VERCEL === '1';
    if (!isVercel) {
      void processClaimAsync(claim.id, data);
    } else {
      logger.info('Vercel environment detected; skipping background process queue. Client stream will handle execution.');
    }

    return {
      claimId: claim.id,
      jobId,
    };
  },

  async getClaimById(claimId: string): Promise<ClaimWithReport> {
    logger.info('Getting claim', { claimId });

    const claim = await claimsStore.getClaimById(claimId);
    if (!claim) {
      throw new AppError(404, 'Claim not found');
    }

    // Get associated report if it exists
    const report = await claimsStore.getReportByClaim(claimId);

    const mappedReport = report ? mapReport(claim.id, report) : undefined;

    return {
      claim: mapClaim(claim, mappedReport),
      report: mappedReport,
    };
  },

  async getClaimsByUser(
    userId: string,
    page: number = 1,
    limit: number = 10
  ): Promise<ClaimsListResponse> {
    logger.info('Getting claims for user', { userId, page, limit });

    if (page < 1) {
      page = 1;
    }
    if (limit < 1 || limit > 100) {
      limit = 10;
    }

    const offset = (page - 1) * limit;
    const { claims, total } = await claimsStore.getClaimsByUser(userId, limit, offset);
    const mappedClaims = await Promise.all(
      claims.map(async (claim) => {
        const report = await claimsStore.getReportByClaim(claim.id);
        const mappedReport = report ? mapReport(claim.id, report) : undefined;
        return mapClaim(claim, mappedReport);
      })
    );

    return {
      claims: mappedClaims,
      total,
      page,
      limit,
    };
  },

  async deleteClaim(claimId: string, userId: string): Promise<void> {
    logger.info('Deleting claim', { claimId, userId });

    const claim = await claimsStore.getClaimById(claimId);
    if (!claim) {
      throw new AppError(404, 'Claim not found');
    }

    // Verify ownership
    if (claim.user_id !== userId) {
      throw new AppError(403, 'Not authorized to delete this claim');
    }

    await claimsStore.softDeleteClaim(claimId);
  },

  async submitFeedback(
    userId: string,
    claimId: string,
    data: FeedbackRequest
  ): Promise<void> {
    logger.info('Submitting feedback', { userId, claimId, rating: data.rating });

    // Verify claim exists
    const claim = await claimsStore.getClaimById(claimId);
    if (!claim) {
      throw new AppError(404, 'Claim not found');
    }

    // Get report for this claim
    const report = await claimsStore.getReportByClaim(claimId);
    if (!report) {
      throw new AppError(404, 'No report found for this claim');
    }

    // Create feedback
    await claimsStore.createFeedback(userId, report.id, data.rating, data.comment);
  },

  async exportReport(
    claimId: string,
    format: string = 'json'
  ): Promise<any> {
    logger.info('Exporting report', { claimId, format });

    const report = await claimsStore.getReportByClaim(claimId);
    if (!report) {
      throw new AppError(404, 'No report found for this claim');
    }

    switch (format) {
      case 'json':
        return mapReport(claimId, report);
      case 'markdown':
        return generateMarkdownReport(report);
      case 'pdf':
        // For MVP, return JSON with message about PDF in Phase 2
        return {
          message: 'PDF export coming in Phase 2',
          data: report,
        };
      default:
        throw new AppError(400, 'Invalid export format');
    }
  },

  async searchClaims(searchQuery: string): Promise<any[]> {
    logger.info('Searching claims', { query: searchQuery });

    if (!searchQuery || searchQuery.trim().length === 0) {
      throw new AppError(400, 'Search query is required');
    }

    return await claimsStore.searchClaims(searchQuery);
  },

  async processClaimStream(
    claimId: string,
    data: { apiKey?: string; depth?: string; llmProvider?: string },
    onProgress: (stage: number, detail: string) => void
  ): Promise<void> {
    const claim = await claimsStore.getClaimById(claimId);
    if (!claim) {
      throw new AppError(404, 'Claim not found');
    }

    if (claim.status === 'completed') {
      onProgress(7, 'Complete');
      return;
    }

    if (claim.status === 'processing') {
      logger.info(`Claim ${claimId} is already processing. Stream request will wait for completion.`);
      onProgress(1, 'Connecting to existing research pipeline...');
      
      while (true) {
        const currentClaim = await claimsStore.getClaimById(claimId);
        if (!currentClaim || currentClaim.status === 'completed' || currentClaim.status === 'failed') {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      return;
    }

    await claimsStore.updateClaimStatus(claimId, 'processing');

    const provider = data.llmProvider || claim.llm_provider;
    const apiKey = resolveApiKey(provider, data.apiKey);
    const model = resolveModelName(provider);

    const reportJson = await orchestrate(
      claim.text,
      claimId,
      model,
      apiKey,
      env.GEMINI_API_KEY,
      env.SERPER_API_KEY || undefined,
      data.depth || claim.depth || 'standard',
      onProgress
    );

    if (reportJson.error) {
      throw new Error(reportJson.error);
    }

    await claimsStore.createReport(
      claimId,
      reportJson.verdict || 'UNVERIFIABLE',
      typeof reportJson.confidence === 'number' ? reportJson.confidence : 0,
      reportJson.explanation || 'No explanation returned',
      reportJson,
      'ai-service-v0.2.0-ts'
    );

    await claimsStore.updateClaimStatus(claimId, 'completed');
  },
};

