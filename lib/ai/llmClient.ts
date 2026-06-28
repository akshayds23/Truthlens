/**
 * Multi-provider LLM Client — ported from Python ai/utils/llm_client.py
 * Supports: OpenAI, Anthropic, Google Gemini, Groq
 */

import { logger } from '@/lib/logger';

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 3000, 6000];

const GROQ_MODELS = [
  'openai/gpt-oss-20b', 'openai/gpt-oss-safeguard-20b',
  'mixtral', 'llama', 'groq/compound-mini', 'groq/compound',
  'llama-3.3-70b-versatile', 'llama-3.1-8b-instant',
  'llama-3-70b', 'mixtral-8x7b-32768',
];

type LLMProvider = 'openai' | 'anthropic' | 'gemini' | 'groq';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

function detectProvider(model: string): LLMProvider {
  const lower = model.toLowerCase();
  for (const gm of GROQ_MODELS) {
    if (lower.includes(gm.toLowerCase())) return 'groq';
  }
  if (['gpt-4', 'gpt-3.5'].some(m => lower.includes(m))) return 'openai';
  if (lower.includes('claude')) return 'anthropic';
  if (lower.includes('gemini')) return 'gemini';
  return 'groq'; // default fallback
}

export const DECOMPOSITION_PROMPT = `You are an expert at breaking down complex claims into atomic, testable sub-claims.

Analyze the following claim and break it down into 2-8 sub-claims. Each sub-claim should be:
- Atomic (a single testable statement)
- Specific enough to search for evidence
- Factual, opinion-based, or compound
- Rated on importance (1-10)

Also classify the claim type: statistical, historical, scientific, political, medical, economic, or general.

Claim: {claim}

Respond with ONLY a valid JSON object (no markdown, no extra text) in this exact format:
{{
  "sub_claims": [
    {{
      "text": "specific, searchable sub-claim text",
      "type": "factual|opinion|compound",
      "importance": 1-10
    }}
  ],
  "complexity": "simple|moderate|complex",
  "claim_type": "statistical|historical|scientific|political|medical|economic|general"
}}`;

async function callOpenAI(model: string, apiKey: string, messages: ChatMessage[], temperature: number, maxTokens: number): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
  });
  if (res.status === 401) throw new Error('Invalid or expired OpenAI API key');
  if (res.status === 429) throw new Error('Rate limited by OpenAI API');
  if (!res.ok) throw new Error(`OpenAI API error: ${res.status}`);
  const data: any = await res.json();
  return data.choices[0].message.content;
}

async function callAnthropic(model: string, apiKey: string, messages: ChatMessage[], temperature: number, maxTokens: number): Promise<string> {
  const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n');
  const nonSystem = messages.filter(m => m.role !== 'system');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: maxTokens, system: system || undefined, messages: nonSystem, temperature }),
  });
  if (res.status === 401) throw new Error('Invalid or expired Anthropic API key');
  if (res.status === 429) throw new Error('Rate limited by Anthropic API');
  if (!res.ok) throw new Error(`Anthropic API error: ${res.status}`);
  const data: any = await res.json();
  return data.content[0].text;
}

async function callGemini(model: string, apiKey: string, messages: ChatMessage[], temperature: number, maxTokens: number): Promise<string> {
  const modelId = model.includes('/') ? model : 'gemini-2.0-flash';
  const prompt = messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature, maxOutputTokens: maxTokens },
      }),
    }
  );
  if (res.status === 401) throw new Error('Invalid or expired Gemini API key');
  if (res.status === 429) throw new Error('Rate limited by Gemini API');
  if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);
  const data: any = await res.json();
  return data.candidates[0].content.parts[0].text;
}

async function callGroq(model: string, apiKey: string, messages: ChatMessage[], temperature: number, maxTokens: number): Promise<string> {
  const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
  });
  if (res.status === 401) throw new Error('Invalid or expired Groq API key');
  if (res.status === 429) throw new Error('Rate limited by Groq API');
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Groq API error ${res.status}: ${text}`);
  }
  const data: any = await res.json();
  return data.choices[0].message.content;
}

export async function callLLM(
  model: string,
  apiKey: string,
  messages: ChatMessage[],
  temperature = 0.3,
  maxTokens = 2000
): Promise<string> {
  const provider = detectProvider(model);
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      switch (provider) {
        case 'openai': return await callOpenAI(model, apiKey, messages, temperature, maxTokens);
        case 'anthropic': return await callAnthropic(model, apiKey, messages, temperature, maxTokens);
        case 'gemini': return await callGemini(model, apiKey, messages, temperature, maxTokens);
        case 'groq': return await callGroq(model, apiKey, messages, temperature, maxTokens);
      }
    } catch (e: any) {
      if (['Invalid', 'expired', 'API key'].some(kw => e.message?.includes(kw))) throw e;
      lastError = e;
      if (attempt < MAX_RETRIES - 1) {
        logger.warn(`LLM call attempt ${attempt + 1} failed: ${e.message}. Retrying...`);
        await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
      }
    }
  }
  throw new Error(`LLM call failed after ${MAX_RETRIES} attempts: ${lastError?.message}`);
}

export function parseJsonResponse(content: string): any {
  let cleaned = content.trim();
  if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
  if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}') + 1;
    if (start >= 0 && end > start) {
      try { return JSON.parse(cleaned.slice(start, end)); } catch { /* fall through */ }
    }
    throw new Error('Invalid JSON response from LLM');
  }
}

export function resolveModelName(provider: string): string {
  const defaults: Record<string, string> = {
    openai: 'gpt-4',
    gemini: 'gemini-2.0-flash',
    anthropic: 'claude-3-sonnet',
    groq: 'openai/gpt-oss-20b',
    local: 'openai/gpt-oss-20b',
  };
  return defaults[provider.toLowerCase()] || provider;
}
