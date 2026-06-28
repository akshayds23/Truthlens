/**
 * Embedding service — replaces Python fastembed (local ONNX model)
 * Uses Google Gemini text-embedding-004 API (free tier: 1500 RPM)
 * Also includes text chunking logic (ported from Python TextChunker)
 */

import { logger } from '@/lib/logger';

const DEFAULT_CHUNK_SIZE = 512;   // tokens
const DEFAULT_CHUNK_OVERLAP = 100; // tokens

export interface Chunk {
  id: string;
  text: string;
  startOffset: number;
  endOffset: number;
  sourceId: string;
  claimId?: string;
  embedding?: number[];
}

// ── Text Chunking ──

function normalizeText(text: string): string {
  // Remove control characters, normalize unicode whitespace
  return text
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function chunkText(
  text: string,
  sourceId: string,
  claimId?: string,
  chunkSize = DEFAULT_CHUNK_SIZE,
  chunkOverlap = DEFAULT_CHUNK_OVERLAP,
): Chunk[] {
  const normalized = normalizeText(text);
  if (!normalized) return [];

  const chunkSizeChars = chunkSize * 4; // ~4 chars per token
  const chunkOverlapChars = chunkOverlap * 4;
  const separator = '\n\n';

  const segments = normalized.split(separator).map(s => s.trim()).filter(s => s);
  if (!segments.length) return [{ id: `${sourceId}_chunk_0`, text: normalized, startOffset: 0, endOffset: normalized.length, sourceId, claimId }];

  const chunks: Chunk[] = [];
  let currentChunk = '';
  let startOffset = 0;
  let chunkId = 0;

  for (const segment of segments) {
    if (currentChunk && currentChunk.length + segment.length > chunkSizeChars) {
      const chunkText = currentChunk.trim();
      if (chunkText) {
        chunks.push({
          id: `${sourceId}_chunk_${chunkId}`,
          text: chunkText,
          startOffset,
          endOffset: startOffset + chunkText.length,
          sourceId,
          claimId,
        });
        chunkId++;
      }
      const overlap = currentChunk.length > chunkOverlapChars
        ? currentChunk.slice(-chunkOverlapChars)
        : '';
      currentChunk = overlap + separator + segment;
      startOffset = Math.max(0, startOffset + chunkText.length - overlap.length);
    } else {
      currentChunk += (currentChunk ? separator : '') + segment;
    }
  }

  // Last chunk
  const lastChunk = currentChunk.trim();
  if (lastChunk) {
    chunks.push({
      id: `${sourceId}_chunk_${chunkId}`,
      text: lastChunk,
      startOffset,
      endOffset: startOffset + lastChunk.length,
      sourceId,
      claimId,
    });
  }

  return chunks;
}

// ── Gemini Embedding API ──

export async function embedTexts(texts: string[], apiKey: string): Promise<number[][]> {
  if (!texts.length) return [];

  if (!apiKey) {
    logger.warn('No GEMINI_API_KEY provided; returning mock embeddings (768-dim zero vectors) for testing.');
    return texts.map(() => new Array(768).fill(0));
  }

  // Batch embed — Gemini supports up to 100 texts per request
  const batches: string[][] = [];
  for (let i = 0; i < texts.length; i += 50) {
    batches.push(texts.slice(i, i + 50));
  }

  const allEmbeddings: number[][] = [];

  for (const batch of batches) {
    const requests = batch.map(text => ({
      model: 'models/text-embedding-004',
      content: { parts: [{ text }] },
    }));

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContents?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini embedding error ${res.status}: ${errText}`);
    }

    const data: any = await res.json();
    for (const emb of data.embeddings) {
      allEmbeddings.push(emb.values);
    }
  }

  return allEmbeddings;
}

export async function embedText(text: string, apiKey: string): Promise<number[]> {
  if (!apiKey) {
    logger.warn('No GEMINI_API_KEY provided; returning mock embedding (768-dim zero vector) for testing.');
    return new Array(768).fill(0);
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/text-embedding-004',
        content: { parts: [{ text }] },
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini embedding error ${res.status}: ${errText}`);
  }

  const data: any = await res.json();
  return data.embedding.values;
}

// ── Full Pipeline: Chunk → Embed ──

export async function chunkAndEmbed(
  text: string,
  sourceId: string,
  claimId: string,
  apiKey: string,
): Promise<Chunk[]> {
  const chunks = chunkText(text, sourceId, claimId);
  if (!chunks.length) return [];

  logger.info(`Embedding ${chunks.length} chunks from ${sourceId}`);
  const texts = chunks.map(c => c.text);
  const embeddings = await embedTexts(texts, apiKey);

  for (let i = 0; i < chunks.length; i++) {
    chunks[i].embedding = embeddings[i];
  }

  return chunks;
}
