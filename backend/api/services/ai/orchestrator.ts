/**
 * Full fact-checking orchestrator — ported from Python ai/services/orchestration.py
 * Pipeline: decompose → search → extract → embed → retrieve → verdict → report
 */

import { logger } from '../../utils/logger';
import { callLLM, parseJsonResponse, DECOMPOSITION_PROMPT } from './llmClient';
import { searchWithFallback, type SearchResult } from './searchService';
import { extractFromUrls, type ExtractedContent } from './extractService';
import { chunkAndEmbed, type Chunk } from './embeddingService';
import { retrieveEvidence, type RetrievedEvidence } from './retrievalService';
import { generateVerdict, type VerdictResult } from './verdictService';

interface SubClaim {
  id: string;
  text: string;
  type: string;
  importance: number;
}

interface DepthSettings {
  numSearches: number;
  topKEvidence: number;
  maxUrls: number;
  batchSize: number;
  targetSources: number;
  subClaimLimit: number;
  evidencePerSubclaim: number;
}

const DEPTH_SETTINGS: Record<string, DepthSettings> = {
  quick: { numSearches: 3, topKEvidence: 3, maxUrls: 5, batchSize: 3, targetSources: 3, subClaimLimit: 2, evidencePerSubclaim: 2 },
  standard: { numSearches: 5, topKEvidence: 5, maxUrls: 10, batchSize: 4, targetSources: 5, subClaimLimit: 3, evidencePerSubclaim: 3 },
  deep: { numSearches: 8, topKEvidence: 8, maxUrls: 18, batchSize: 5, targetSources: 8, subClaimLimit: 4, evidencePerSubclaim: 4 },
};

const STOPWORDS = new Set([
  'the', 'and', 'that', 'with', 'from', 'this', 'have', 'into', 'they',
  'their', 'would', 'could', 'should', 'about', 'there', 'which', 'what',
  'when', 'where', 'who', 'will', 'been', 'being', 'does', 'did', 'were',
]);

const ABBREVIATIONS: Record<string, string> = {
  'U.S.': 'United States', 'U.S': 'United States', 'Fed': 'Federal Reserve',
  'SCOTUS': 'Supreme Court of the United States', 'WHO': 'World Health Organization',
  'CDC': 'Centers for Disease Control', 'FDA': 'Food and Drug Administration',
};

function normalizeQuery(query: string): string {
  let n = query.trim();
  for (const [src, tgt] of Object.entries(ABBREVIATIONS)) n = n.replace(src, tgt);
  return n.replace(/["'`]/g, '').replace(/[^A-Za-z0-9\s:/-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildSearchQueries(claim: string, subClaims: SubClaim[], numSearches: number): string[] {
  const raw: string[] = [];
  const nc = normalizeQuery(claim);
  if (nc) {
    raw.push(nc, `${nc} fact check`, `is it true that ${nc}`);
  }
  for (const sc of subClaims.slice(0, 5)) {
    const sct = normalizeQuery(sc.text);
    if (sct) { raw.push(sct, `${sct} evidence research`); }
  }
  // Deduplicate
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const q of raw) {
    const key = q.toLowerCase().trim();
    if (!seen.has(key)) { seen.add(key); deduped.push(q); }
  }
  return deduped.slice(0, Math.max(numSearches, 5));
}

function extractTerms(text: string): string[] {
  const terms = (text.toLowerCase().match(/[a-z0-9]+/g) || []);
  const unique: string[] = [];
  for (const t of terms) {
    if (t.length < 4 || STOPWORDS.has(t) || unique.includes(t)) continue;
    unique.push(t);
    if (unique.length >= 8) break;
  }
  return unique;
}

function evidenceMatchesQuery(query: string, evidence: RetrievedEvidence): boolean {
  const terms = extractTerms(query);
  if (!terms.length) return true;
  const haystack = `${evidence.text} ${evidence.source_id}`.toLowerCase();
  return terms.filter(t => haystack.includes(t)).length >= Math.min(2, terms.length);
}

export interface FactCheckReport {
  claim_id: string;
  claim_text: string;
  verdict: string;
  confidence: number;
  explanation: string;
  key_points: string[];
  citations: any[];
  sub_claims: any[];
  evidence_summary: { total_sources: number; sub_claims_analyzed: number; evidence_count: number };
  research_depth: string;
  generated_at: string;
  error?: string;
}

export async function orchestrate(
  claim: string,
  claimId: string,
  model: string,
  apiKey: string,
  geminiApiKey: string,
  serperApiKey?: string,
  depth = 'standard',
  onProgress?: (stage: number, detail: string) => void
): Promise<FactCheckReport> {
  logger.info(`Starting pipeline for claim ${claimId}: ${claim.slice(0, 80)}...`);

  try {
    const settings = DEPTH_SETTINGS[depth] || DEPTH_SETTINGS.standard;

    // Step 1: Decompose claim
    onProgress?.(1, 'Decomposing claim...');
    logger.info('Step 1/7: Decomposing claim...');
    let subClaims: SubClaim[];
    let claimType = 'general';
    try {
      const prompt = DECOMPOSITION_PROMPT.replace('{claim}', claim);
      const response = await callLLM(model, apiKey, [
        { role: 'system', content: 'You are an expert at breaking down complex claims into atomic, testable sub-claims. Always respond with valid JSON only.' },
        { role: 'user', content: prompt },
      ]);
      const result = parseJsonResponse(response);
      subClaims = (result.sub_claims || [])
        .filter((sc: any) => sc.text && sc.text.length >= 5)
        .map((sc: any, i: number) => ({
          id: `sc_${i + 1}`,
          text: sc.text.trim(),
          type: ['factual', 'opinion', 'compound'].includes(sc.type) ? sc.type : 'factual',
          importance: Math.min(10, Math.max(1, parseInt(sc.importance) || 5)),
        }));
      claimType = result.claim_type || 'general';
      if (!subClaims.length) throw new Error('No sub-claims');
    } catch (e: any) {
      logger.warn(`Decomposition failed: ${e.message}, using claim as single sub-claim`);
      subClaims = [{ id: 'sc_1', text: claim, type: 'factual', importance: 10 }];
    }
    logger.info(`Generated ${subClaims.length} sub-claims (type: ${claimType})`);

    // Step 2: Search
    onProgress?.(2, 'Searching for evidence...');
    logger.info(`Step 2/7: Searching for evidence (${settings.numSearches} queries)...`);
    const queries = buildSearchQueries(claim, subClaims, settings.numSearches);
    const allUrls: string[] = [];
    const seenUrls = new Set<string>();

    for (const query of queries.slice(0, settings.numSearches)) {
      try {
        const { results } = await searchWithFallback(query, settings.numSearches, serperApiKey);
        for (const r of results) {
          if (r.url && !seenUrls.has(r.url)) { seenUrls.add(r.url); allUrls.push(r.url); }
        }
      } catch (e: any) {
        logger.warn(`Search error: ${e.message}`);
      }
    }
    logger.info(`Found ${allUrls.length} unique URLs`);

    // Step 3: Extract content
    onProgress?.(3, 'Extracting content from sources...');
    logger.info('Step 3/7: Extracting content from sources...');
    const extracted: ExtractedContent[] = [];
    for (let i = 0; i < Math.min(allUrls.length, settings.maxUrls); i += settings.batchSize) {
      const batch = allUrls.slice(i, i + settings.batchSize);
      const batchResults = await extractFromUrls(batch);
      extracted.push(...batchResults);
      if (extracted.length >= settings.targetSources) break;
    }
    logger.info(`Extracted content from ${extracted.length} sources`);

    // Step 4 & 5: Chunk, embed (using Gemini API)
    onProgress?.(4, 'Chunking content...');
    logger.info('Step 4/7: Chunking and embedding content...');
    const allChunks: Chunk[] = [];
    for (const source of extracted) {
      try {
        const chunks = await chunkAndEmbed(source.text, source.source, claimId, geminiApiKey);
        allChunks.push(...chunks);
      } catch (e: any) {
        logger.warn(`Embedding error for ${source.source}: ${e.message}`);
      }
    }
    onProgress?.(5, 'Generating embeddings...');
    logger.info(`Step 5/7: Generated ${allChunks.length} embedded chunks`);

    // Step 6: Retrieve evidence
    onProgress?.(6, 'Retrieving relevant evidence...');
    logger.info('Step 6/7: Retrieving relevant evidence...');
    const evidenceBySubclaim: Record<string, RetrievedEvidence[]> = {};
    for (const sc of subClaims.slice(0, settings.subClaimLimit)) {
      try {
        evidenceBySubclaim[sc.id] = await retrieveEvidence(
          sc.text, allChunks, geminiApiKey, settings.topKEvidence
        );
      } catch (e: any) {
        logger.warn(`Retrieval failed for sub-claim: ${e.message}`);
        evidenceBySubclaim[sc.id] = [];
      }
    }

    // Step 7: Generate verdict
    onProgress?.(7, 'Generating verdict...');
    logger.info('Step 7/7: Generating verdict (chain-of-thought)...');
    const allEvidence: { text: string; source: string; relevance: number }[] = [];
    const seenTexts = new Set<string>();
    const scMap = new Map(subClaims.map(sc => [sc.id, sc.text]));

    for (const [scId, evidenceList] of Object.entries(evidenceBySubclaim)) {
      const queryText = scMap.get(scId) || claim;
      for (const ev of evidenceList.slice(0, settings.evidencePerSubclaim)) {
        if (!evidenceMatchesQuery(queryText, ev)) continue;
        const key = ev.text.slice(0, 100).toLowerCase().trim();
        if (seenTexts.has(key)) continue;
        seenTexts.add(key);
        allEvidence.push({ text: ev.text, source: ev.source_id, relevance: ev.relevance_score });
      }
    }

    const verdict = await generateVerdict(claim, allEvidence, model, apiKey);

    // Assemble report
    const sources = new Set<string>();
    for (const evList of Object.values(evidenceBySubclaim)) {
      for (const ev of evList) sources.add(ev.source_id);
    }

    const augmentedSubClaims = subClaims.map(sc => {
      const scEvidence = (evidenceBySubclaim[sc.id] || []).slice(0, 3).map(ev => ({
        id: ev.chunk_id, excerpt: ev.text, source: ev.source_id,
        sourceUrl: ev.source_id, relevance: ev.relevance_score,
      }));
      return { ...sc, verdict: verdict.verdict, confidence: verdict.confidence, evidence: scEvidence };
    });

    const report: FactCheckReport = {
      claim_id: claimId,
      claim_text: claim,
      verdict: verdict.verdict,
      confidence: verdict.confidence,
      explanation: verdict.explanation,
      key_points: verdict.key_points,
      citations: verdict.citations,
      sub_claims: augmentedSubClaims,
      evidence_summary: {
        total_sources: sources.size,
        sub_claims_analyzed: subClaims.length,
        evidence_count: Object.values(evidenceBySubclaim).reduce((sum, e) => sum + e.length, 0),
      },
      research_depth: depth,
      generated_at: new Date().toISOString(),
    };

    logger.info(`Pipeline complete. Verdict: ${report.verdict}`);
    return report;
  } catch (e: any) {
    logger.error(`Pipeline failed: ${e.message}`);
    return {
      claim_id: claimId, claim_text: claim, verdict: 'UNVERIFIABLE', confidence: 0,
      explanation: `Error: ${e.message}`, key_points: [], citations: [],
      sub_claims: [], evidence_summary: { total_sources: 0, sub_claims_analyzed: 0, evidence_count: 0 },
      research_depth: depth, generated_at: new Date().toISOString(), error: e.message,
    };
  }
}
