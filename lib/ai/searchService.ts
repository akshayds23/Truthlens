/**
 * Multi-provider search service — ported from Python ai/utils/search_providers.py
 * Providers: DuckDuckGo (free), Serper (API key), Wikipedia (free)
 */

import { logger } from '@/lib/logger';
import * as cheerio from 'cheerio';

export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  provider: string;
  relevance: number;
  rank: number;
}

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

// ── DuckDuckGo HTML Scraper ──

async function searchDuckDuckGo(query: string, numResults: number): Promise<SearchResult[]> {
  try {
    const res = await fetch('https://html.duckduckgo.com/html/', {
      method: 'POST',
      headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `q=${encodeURIComponent(query)}`,
      redirect: 'follow',
    });
    if (!res.ok) return [];

    const html = await res.text();
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];

    $('a.result__a').each((i, el) => {
      if (i >= numResults) return false;
      const href = $(el).attr('href')?.trim() || '';
      const title = $(el).text().trim();
      const container = $(el).closest('.result');
      const snippet = container.find('.result__snippet').text().trim();
      if (!href) return;

      results.push({
        url: href,
        title,
        snippet,
        provider: 'duckduckgo',
        relevance: 1.0 - i * 0.05,
        rank: i + 1,
      });
    });

    logger.info(`DuckDuckGo: Found ${results.length} results for '${query}'`);
    return results;
  } catch (e: any) {
    logger.error(`DuckDuckGo search failed: ${e.message}`);
    return [];
  }
}

// ── Serper (Google Search API) ──

async function searchSerper(query: string, numResults: number, apiKey: string): Promise<SearchResult[]> {
  try {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, num: Math.min(numResults, 20) }),
    });
    if (res.status === 401) { logger.error('Serper: Invalid API key'); return []; }
    if (res.status === 429) { logger.warn('Serper: Rate limited'); return []; }
    if (!res.ok) return [];

    const data: any = await res.json();
    const results: SearchResult[] = (data.organic || []).map((r: any, i: number) => ({
      url: r.link || '',
      title: r.title || '',
      snippet: r.snippet || '',
      provider: 'serper',
      relevance: 1.0 - i * 0.05,
      rank: i + 1,
    }));

    logger.info(`Serper: Found ${results.length} results for '${query}'`);
    return results;
  } catch (e: any) {
    logger.error(`Serper search failed: ${e.message}`);
    return [];
  }
}

// ── Wikipedia ──

async function searchWikipedia(query: string, numResults: number): Promise<SearchResult[]> {
  try {
    const params = new URLSearchParams({
      action: 'query', list: 'search', srsearch: query,
      utf8: '', format: 'json', srlimit: String(Math.min(numResults, 10)),
    });
    const res = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, {
      headers: { 'User-Agent': 'TruthLens/1.0' },
    });
    if (!res.ok) return [];

    const data: any = await res.json();
    const results: SearchResult[] = (data.query?.search || []).map((item: any, i: number) => {
      const snippetText = cheerio.load(item.snippet || '').text();
      return {
        url: `https://en.wikipedia.org/wiki/${item.title.replace(/ /g, '_')}`,
        title: `${item.title} - Wikipedia`,
        snippet: snippetText,
        provider: 'wikipedia',
        relevance: 1.0 - i * 0.05,
        rank: i + 1,
      };
    });

    logger.info(`Wikipedia: Found ${results.length} results for '${query}'`);
    return results;
  } catch (e: any) {
    logger.error(`Wikipedia search failed: ${e.message}`);
    return [];
  }
}

// ── Provider Pool with Fallback Chain ──

export async function searchWithFallback(
  query: string,
  numResults: number,
  serperKey?: string,
): Promise<{ results: SearchResult[]; providersUsed: string[] }> {
  const chain: { name: string; fn: () => Promise<SearchResult[]> }[] = [];

  if (serperKey && serperKey.length > 10) {
    chain.push({ name: 'serper', fn: () => searchSerper(query, numResults, serperKey) });
  }
  chain.push({ name: 'wikipedia', fn: () => searchWikipedia(query, numResults) });
  chain.push({ name: 'duckduckgo', fn: () => searchDuckDuckGo(query, numResults) });

  const allResults: SearchResult[] = [];
  const seenUrls = new Set<string>();
  const providersUsed: string[] = [];

  for (const provider of chain) {
    try {
      const results = await Promise.race([
        provider.fn(),
        new Promise<SearchResult[]>(resolve => setTimeout(() => resolve([]), 10000)),
      ]);

      for (const r of results) {
        if (!seenUrls.has(r.url)) {
          seenUrls.add(r.url);
          allResults.push(r);
        }
      }

      if (allResults.length > 0) providersUsed.push(provider.name);
      if (allResults.length >= numResults) break;
    } catch (e: any) {
      logger.warn(`Search provider ${provider.name} failed: ${e.message}`);
    }
  }

  return { results: allResults.slice(0, numResults), providersUsed };
}
