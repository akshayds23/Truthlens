import { NextRequest } from 'next/server';
import { claimsStore } from '@/lib/claimsStore';
import { logger } from '@/lib/logger';
import { orchestrate } from '@/lib/ai/orchestrator';
import { resolveModelName } from '@/lib/ai/llmClient';

export const maxDuration = 60;

function resolveApiKey(provider: string, apiKey?: string): string {
  if (apiKey?.trim()) return apiKey.trim();
  const map: Record<string, string | undefined> = {
    groq: process.env.GROQ_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    gemini: process.env.GEMINI_API_KEY,
    local: process.env.GROQ_API_KEY,
  };
  return map[provider] || '';
}

// ── POST /api/claims/[id]/process — Stream SSE progress ──
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: claimId } = await params;
  const body = await request.json().catch(() => ({}));
  const { apiKey, depth, llmProvider } = body;

  logger.info(`Starting process stream for claim ${claimId}`);

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const claim = await claimsStore.getClaimById(claimId);
        if (!claim) {
          sendEvent({ error: 'Claim not found' });
          controller.close();
          return;
        }

        if (claim.status === 'completed') {
          sendEvent({ stage: 7, detail: 'Complete' });
          sendEvent({ status: 'completed' });
          controller.close();
          return;
        }

        if (claim.status === 'processing') {
          sendEvent({ stage: 1, detail: 'Connecting to existing research pipeline...' });
          // Poll until done
          while (true) {
            const current = await claimsStore.getClaimById(claimId);
            if (!current || current.status === 'completed' || current.status === 'failed') break;
            await new Promise((r) => setTimeout(r, 1000));
          }
          sendEvent({ status: 'completed' });
          controller.close();
          return;
        }

        await claimsStore.updateClaimStatus(claimId, 'processing');

        const provider = llmProvider || claim.llm_provider;
        const resolvedApiKey = resolveApiKey(provider, apiKey);
        const model = resolveModelName(provider);

        const reportJson = await orchestrate(
          claim.text, claimId, model, resolvedApiKey,
          process.env.GEMINI_API_KEY || '',
          process.env.SERPER_API_KEY || undefined,
          depth || claim.depth || 'standard',
          (stage: number, detail: string) => {
            sendEvent({ stage, detail });
          }
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
          'ai-service-v2.0-nextjs'
        );

        await claimsStore.updateClaimStatus(claimId, 'completed');
        sendEvent({ status: 'completed' });
      } catch (err: any) {
        logger.error(`Error in process stream for ${claimId}:`, err);
        sendEvent({ error: err.message || 'Processing failed' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
