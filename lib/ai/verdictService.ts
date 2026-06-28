/**
 * Verdict generation — ported from Python ai/services/verdict.py
 * Chain-of-thought LLM reasoning for accurate fact-checking verdicts.
 */

import { logger } from '@/lib/logger';
import { callLLM, parseJsonResponse } from './llmClient';

export type VerdictValue = 'TRUE' | 'MOSTLY_TRUE' | 'MISLEADING' | 'FALSE' | 'UNVERIFIABLE';

export interface Citation {
  claim: string;
  evidence: string;
  source_url: string;
  stance: 'supports' | 'contradicts' | 'neutral';
  confidence: number;
}

export interface VerdictResult {
  verdict: VerdictValue;
  confidence: number;
  explanation: string;
  key_points: string[];
  citations: Citation[];
}

const STOPWORDS = new Set([
  'the', 'and', 'that', 'with', 'from', 'this', 'have', 'into', 'they',
  'their', 'would', 'could', 'should', 'about', 'there', 'which', 'what',
  'when', 'where', 'who', 'will', 'been', 'being', 'does', 'did', 'were',
  'them', 'then', 'than', 'because', 'explicitly', 'officially', 'most',
  'many', 'much', 'such', 'some', 'your', 'after', 'before', 'within',
  'regardless', 'amount', 'claim', 'cause', 'causes',
]);

const VERDICT_PROMPT = `You are an expert fact-checker analyzing a claim against gathered evidence.

CLAIM TO VERIFY: {claim}

EVIDENCE FROM WEB SOURCES:
{evidence_text}

INSTRUCTIONS:
1. First, identify the key factual assertions in the claim.
2. For each assertion, evaluate whether the evidence supports, contradicts, or is neutral.
3. Consider the credibility of the sources (academic, government, and established news sources are more reliable).
4. Look for consensus across multiple sources.
5. Generate your verdict based ONLY on the provided evidence. Do NOT use knowledge not present in the evidence.
6. Every citation MUST reference a source URL from the evidence above. Do NOT invent URLs.

Respond with ONLY a valid JSON object (no markdown, no extra text):
{{
    "verdict": "TRUE|MOSTLY_TRUE|MISLEADING|FALSE|UNVERIFIABLE",
    "confidence": <float between 0.0 and 1.0>,
    "explanation": "<2-4 sentence explanation of your verdict, referencing specific evidence>",
    "key_points": [
        "<key finding 1 with source reference>",
        "<key finding 2 with source reference>",
        "<key finding 3 with source reference>"
    ],
    "citations": [
        {{
            "claim": "<specific part of the original claim this citation addresses>",
            "evidence": "<relevant quote or paraphrase from the source>",
            "source_url": "<exact URL from the evidence above>",
            "stance": "supports|contradicts|neutral",
            "confidence": <0.0-1.0>
        }}
    ]
}}`;

function formatEvidence(evidenceList: { text: string; source: string; relevance: number }[]): string {
  if (!evidenceList.length) return 'No evidence found.';
  return evidenceList.map((e, i) =>
    `[Source ${i + 1}] (${e.source})\nRelevance: ${e.relevance.toFixed(2)}\nContent: ${e.text.slice(0, 800)}\n`
  ).join('\n---\n');
}

function extractClaimTerms(claim: string): string[] {
  const terms = claim.toLowerCase().match(/[a-z0-9]+/g) || [];
  const unique: string[] = [];
  for (const t of terms) {
    if (t.length < 4 || STOPWORDS.has(t) || unique.includes(t)) continue;
    unique.push(t);
    if (unique.length >= 8) break;
  }
  return unique;
}

function citationMatchesClaim(claim: string, evidence: { text: string; source: string }): boolean {
  const terms = extractClaimTerms(claim);
  if (!terms.length) return true;
  const haystack = `${evidence.text} ${evidence.source}`.toLowerCase();
  const overlap = terms.filter(t => haystack.includes(t)).length;
  return overlap >= Math.min(2, terms.length);
}

function clipText(text: string, maxChars = 600): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxChars) return cleaned;
  return cleaned.slice(0, maxChars).replace(/\s\S*$/, '') + '...';
}

function groundCitations(
  claim: string,
  llmCitations: any[],
  allEvidence: { text: string; source: string; relevance: number }[],
): Citation[] {
  if (!allEvidence.length) return [];

  const evidenceBySource = new Map<string, { text: string; source: string; relevance: number }>();
  for (const e of allEvidence) {
    if (e.source && !evidenceBySource.has(e.source)) evidenceBySource.set(e.source, e);
  }

  // Try to ground LLM citations to real evidence
  const grounded: Citation[] = [];
  for (const c of llmCitations) {
    const url = String(c.source_url || '').trim();
    if (!url || !evidenceBySource.has(url)) continue;
    const matched = evidenceBySource.get(url)!;
    if (!citationMatchesClaim(claim, matched)) continue;
    grounded.push({
      claim: c.claim || claim,
      evidence: clipText(matched.text || c.evidence || ''),
      source_url: url,
      stance: c.stance || 'neutral',
      confidence: c.confidence ?? matched.relevance ?? 0.8,
    });
  }
  if (grounded.length) return grounded.slice(0, 5);

  // Fallback: build from top evidence
  return allEvidence.slice(0, 5)
    .filter(e => e.source && citationMatchesClaim(claim, e))
    .map(e => ({
      claim, evidence: clipText(e.text), source_url: e.source,
      stance: 'neutral' as const, confidence: e.relevance ?? 0.8,
    }));
}

export async function generateVerdict(
  claim: string,
  allEvidence: { text: string; source: string; relevance: number }[],
  model: string,
  apiKey: string,
): Promise<VerdictResult> {
  try {
    const evidenceText = formatEvidence(allEvidence);
    if (!evidenceText || evidenceText === 'No evidence found.') {
      return {
        verdict: 'UNVERIFIABLE', confidence: 0.1,
        explanation: 'Insufficient evidence was gathered to verify this claim.',
        key_points: ['No relevant evidence found from web sources'], citations: [],
      };
    }

    const prompt = VERDICT_PROMPT.replace('{claim}', claim).replace('{evidence_text}', evidenceText);
    const response = await callLLM(model, apiKey, [
      { role: 'system', content: 'You are an expert fact-checker. Analyze evidence carefully and provide accurate verdicts. Always respond with valid JSON only. NEVER invent or hallucinate source URLs — only cite URLs from the evidence provided to you.' },
      { role: 'user', content: prompt },
    ], 0.2, 2000);

    const data = parseJsonResponse(response);
    const validVerdicts: VerdictValue[] = ['TRUE', 'MOSTLY_TRUE', 'MISLEADING', 'FALSE', 'UNVERIFIABLE'];
    if (!validVerdicts.includes(data.verdict)) data.verdict = 'UNVERIFIABLE';
    if (typeof data.confidence !== 'number' || data.confidence < 0 || data.confidence > 1) data.confidence = 0.5;

    const citations = groundCitations(claim, data.citations || [], allEvidence);

    logger.info(`Verdict: ${data.verdict} (confidence: ${data.confidence.toFixed(2)}, citations: ${citations.length})`);
    return {
      verdict: data.verdict,
      confidence: data.confidence,
      explanation: data.explanation || '',
      key_points: data.key_points || [],
      citations,
    };
  } catch (e: any) {
    logger.error(`Verdict generation failed: ${e.message}`);
    return {
      verdict: 'UNVERIFIABLE', confidence: 0, explanation: `Error: ${e.message}`,
      key_points: [], citations: [],
    };
  }
}
