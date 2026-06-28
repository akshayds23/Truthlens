/**
 * Evidence retrieval with hybrid search — ported from Python ai/services/retrieval.py
 * Combines: vector similarity + BM25 keyword search + source credibility scoring
 */

import { logger } from '../../utils/logger';
import { embedText } from './embeddingService';
import type { Chunk } from './embeddingService';

export interface RetrievedEvidence {
  chunk_id: string;
  text: string;
  source_id: string;
  relevance_score: number;
  vector_similarity: number;
  bm25_score: number;
  credibility: number;
  rank: number;
}

// ── Cosine Similarity ──

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  magA = Math.sqrt(magA);
  magB = Math.sqrt(magB);
  return (magA === 0 || magB === 0) ? 0 : dot / (magA * magB);
}

// ── BM25 Keyword Ranking (manual implementation) ──

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function bm25Rank(query: string, documents: { id: string; text: string }[]): Map<string, number> {
  const scores = new Map<string, number>();
  if (!documents.length) return scores;

  const queryTokens = tokenize(query);
  if (!queryTokens.length) {
    documents.forEach(d => scores.set(d.id, 0));
    return scores;
  }

  const N = documents.length;
  const k1 = 1.2;
  const b = 0.75;

  // Tokenize all documents
  const docTokens = documents.map(d => tokenize(d.text));
  const avgDl = docTokens.reduce((sum, dt) => sum + dt.length, 0) / N;

  // IDF for each query term
  const idf = new Map<string, number>();
  for (const qt of queryTokens) {
    const df = docTokens.filter(dt => dt.includes(qt)).length;
    idf.set(qt, Math.log((N - df + 0.5) / (df + 0.5) + 1));
  }

  let maxScore = 0;
  for (let i = 0; i < N; i++) {
    let score = 0;
    const dl = docTokens[i].length;
    for (const qt of queryTokens) {
      const tf = docTokens[i].filter(t => t === qt).length;
      const idfVal = idf.get(qt) || 0;
      score += idfVal * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * dl / avgDl));
    }
    scores.set(documents[i].id, score);
    maxScore = Math.max(maxScore, score);
  }

  // Normalize to 0-1
  if (maxScore > 0) {
    for (const [id, s] of scores) scores.set(id, s / maxScore);
  }

  return scores;
}

// ── Source Credibility ──

const DOMAIN_SCORES: Record<string, number> = {
  // Fact-checkers
  'snopes.com': 0.95, 'factcheck.org': 0.95, 'politifact.com': 0.94,
  'fullfact.org': 0.93, 'checkyourfact.com': 0.88,
  // Wire services
  'apnews.com': 0.95, 'reuters.com': 0.95, 'afp.com': 0.93,
  // Major newspapers
  'nytimes.com': 0.92, 'washingtonpost.com': 0.91, 'theguardian.com': 0.90,
  'wsj.com': 0.91, 'bbc.com': 0.94, 'bbc.co.uk': 0.94,
  'economist.com': 0.90, 'ft.com': 0.90,
  // Broadcast
  'cnn.com': 0.85, 'nbcnews.com': 0.86, 'pbs.org': 0.90, 'npr.org': 0.90,
  // Science
  'nature.com': 0.96, 'science.org': 0.96, 'thelancet.com': 0.95,
  'nejm.org': 0.96, 'bmj.com': 0.95, 'pubmed.ncbi.nlm.nih.gov': 0.95,
  'arxiv.org': 0.85, 'scientificamerican.com': 0.88,
  // Reference
  'wikipedia.org': 0.82, 'britannica.com': 0.90,
  // Government
  'who.int': 0.93, 'cdc.gov': 0.93, 'nih.gov': 0.93, 'nasa.gov': 0.95,
  'un.org': 0.90, 'worldbank.org': 0.90,
  // Finance
  'bloomberg.com': 0.88, 'cnbc.com': 0.84,
  // Tech
  'wired.com': 0.84, 'arstechnica.com': 0.85,
  // Low credibility
  'dailymail.co.uk': 0.45, 'nypost.com': 0.50, 'thesun.co.uk': 0.40,
  'infowars.com': 0.15, 'naturalnews.com': 0.15, 'breitbart.com': 0.35,
};

function estimateCredibility(sourceId: string): number {
  try {
    let domain = sourceId;
    if (domain.startsWith('http')) {
      domain = new URL(domain).hostname.replace('www.', '');
    }
    if (DOMAIN_SCORES[domain]) return DOMAIN_SCORES[domain];
    for (const [known, score] of Object.entries(DOMAIN_SCORES)) {
      if (domain.endsWith(known)) return score;
    }
    if (domain.endsWith('.edu') || domain.endsWith('.ac.uk')) return 0.85;
    if (domain.endsWith('.gov') || domain.endsWith('.mil')) return 0.88;
    if (domain.endsWith('.org')) return 0.65;
    return 0.50;
  } catch {
    return 0.50;
  }
}

// ── Hybrid Retrieval ──

export async function retrieveEvidence(
  query: string,
  chunks: Chunk[],
  apiKey: string,
  topK = 5,
  vectorWeight = 0.5,
  bm25Weight = 0.3,
  credibilityWeight = 0.2,
): Promise<RetrievedEvidence[]> {
  if (!chunks.length) return [];
  logger.info(`Retrieving evidence for: '${query.slice(0, 80)}' from ${chunks.length} chunks`);

  // Normalize weights
  const total = vectorWeight + bm25Weight + credibilityWeight;
  const vw = vectorWeight / total;
  const bw = bm25Weight / total;
  const cw = credibilityWeight / total;

  // Step 1: Embed query
  const queryEmbedding = await embedText(query, apiKey);

  // Step 2: Vector similarity scores
  const vectorScores = new Map<string, number>();
  for (const chunk of chunks) {
    vectorScores.set(chunk.id, chunk.embedding ? Math.max(0, cosineSimilarity(queryEmbedding, chunk.embedding)) : 0);
  }

  // Step 3: BM25 scores
  const bm25Scores = bm25Rank(query, chunks.map(c => ({ id: c.id, text: c.text })));

  // Step 4: Credibility scores
  const credScores = new Map<string, number>();
  for (const chunk of chunks) credScores.set(chunk.id, estimateCredibility(chunk.sourceId));

  // Combine
  const combined = chunks.map(chunk => {
    const vs = vectorScores.get(chunk.id) || 0;
    const bm = bm25Scores.get(chunk.id) || 0;
    const cr = credScores.get(chunk.id) || 0.5;
    return {
      chunk_id: chunk.id,
      text: chunk.text,
      source_id: chunk.sourceId,
      combined: vs * vw + bm * bw + cr * cw,
      vector_sim: vs,
      bm25: bm,
      credibility: cr,
    };
  });

  combined.sort((a, b) => b.combined - a.combined);

  return combined.slice(0, topK).map((r, i) => ({
    chunk_id: r.chunk_id,
    text: r.text,
    source_id: r.source_id,
    relevance_score: r.combined,
    vector_similarity: r.vector_sim,
    bm25_score: r.bm25,
    credibility: r.credibility,
    rank: i + 1,
  }));
}
