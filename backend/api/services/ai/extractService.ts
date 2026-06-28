/**
 * Web content extraction — replaces Python trafilatura + Playwright + BeautifulSoup
 * Uses cheerio (Node.js equivalent of BeautifulSoup) for HTML parsing.
 * No Playwright, no headless browser, no 500MB Chromium binary.
 */

import { logger } from '../../utils/logger';
import * as cheerio from 'cheerio';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const DOWNLOAD_TIMEOUT = 3500;

export interface ExtractedContent {
  text: string;
  title: string;
  source: string;
  method: string;
  length: number;
}

function extractArticleText(html: string): string | null {
  try {
    const $ = cheerio.load(html);

    // Remove unwanted elements
    $('script, style, nav, footer, aside, meta, noscript, header, iframe, form').remove();

    // Remove ads, sidebars, cookie banners, social widgets
    $('[class*="ad"], [class*="advert"], [class*="sidebar"], [class*="related"], [class*="comment"], [class*="cookie"], [class*="banner"], [class*="social"], [class*="share"], [class*="newsletter"], [class*="popup"], [class*="modal"], [class*="promo"], [class*="sponsor"]').remove();

    // Find main content in priority order
    const mainContent = $('article').first().length ? $('article').first()
      : $('main').first().length ? $('main').first()
      : $('[class*="content"]').first().length ? $('[class*="content"]').first()
      : $('[class*="article"]').first().length ? $('[class*="article"]').first()
      : $('body');

    if (!mainContent.length) return null;

    const text = mainContent.text();
    const lines = text.split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 20 || l.endsWith('.') || l.endsWith('!') || l.endsWith('?') || l.endsWith(':'));

    return lines.join('\n');
  } catch (e: any) {
    logger.error(`HTML parsing error: ${e.message}`);
    return null;
  }
}

function extractTitle(html: string, url: string): string {
  try {
    const $ = cheerio.load(html);
    const title = $('title').first().text().trim();
    if (title) return title;
    const ogTitle = $('meta[property="og:title"]').attr('content')?.trim();
    if (ogTitle) return ogTitle;
    return url.split('/').pop() || url;
  } catch {
    return url;
  }
}

export async function extractFromUrl(url: string): Promise<ExtractedContent | null> {
  try {
    if (!url.startsWith('http://') && !url.startsWith('https://')) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT);

    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      redirect: 'follow',
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return null;
    const html = await res.text();
    if (!html || html.length < 200) return null;

    const text = extractArticleText(html);
    if (!text || text.trim().length < 100) return null;

    const title = extractTitle(html, url);
    logger.info(`Extracted ${text.length} chars from ${url}`);

    return {
      text: text.trim(),
      title,
      source: url,
      method: 'cheerio',
      length: text.length,
    };
  } catch (e: any) {
    if (e.name === 'AbortError') {
      logger.warn(`Extraction timeout for ${url}`);
    } else {
      logger.warn(`Extraction failed for ${url}: ${e.message}`);
    }
    return null;
  }
}

export async function extractFromUrls(urls: string[]): Promise<ExtractedContent[]> {
  logger.info(`Extracting content from ${urls.length} URLs`);

  // Process in batches of 4 concurrent requests
  const batchSize = 4;
  const extracted: ExtractedContent[] = [];

  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize);
    const results = await Promise.allSettled(batch.map(url => extractFromUrl(url)));
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) extracted.push(r.value);
    }
  }

  logger.info(`Extracted from ${extracted.length}/${urls.length} URLs`);
  return extracted;
}
