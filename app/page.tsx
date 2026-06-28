'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { claimsService } from '../services/api';
import type { ClaimSubmissionForm } from '../types';

const claimSchema = z.object({
  text: z.string().min(10, 'Claim must be at least 10 characters').max(500, 'Claim must be less than 500 characters'),
  category: z.enum(['health', 'politics', 'science', 'finance', 'other']),
  depth: z.enum(['quick', 'standard', 'deep']),
  llmProvider: z.enum(['openai', 'gemini', 'anthropic', 'groq', 'local']),
  apiKey: z.string().optional(),
});

type ClaimFormData = z.infer<typeof claimSchema>;

const EXAMPLE_CLAIMS = [
  "The Earth is flat",
  "Vaccines cause autism",
  "Humans share 98% of DNA with chimpanzees",
  "Climate change is entirely caused by solar cycles",
  "The Great Wall of China is visible from space",
];

export default function LandingPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<ClaimFormData>({
    resolver: zodResolver(claimSchema),
    defaultValues: {
      text: '',
      category: 'science',
      depth: 'standard',
      llmProvider: 'groq',
      apiKey: '',
    },
  });

  const claimText = watch('text');

  const onSubmit = async (data: ClaimFormData) => {
    setIsSubmitting(true);
    try {
      const response = await claimsService.submitClaim(data as ClaimSubmissionForm);
      const query = new URLSearchParams();
      if (data.apiKey) query.set('apiKey', data.apiKey);
      if (data.depth) query.set('depth', data.depth);
      if (data.llmProvider) query.set('llmProvider', data.llmProvider);
      
      router.push(`/progress/${response.claimId}?${query.toString()}`);
    } catch (error) {
      alert(`Error: ${error instanceof Error ? error.message : 'Failed to submit claim'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExampleClick = (example: string) => {
    setValue('text', example, { shouldValidate: true });
    // Trigger submission
    setValue('text', example);
    const mockData: ClaimFormData = {
      text: example,
      category: 'science',
      depth: 'standard',
      llmProvider: 'groq',
      apiKey: '',
    };
    onSubmit(mockData);
  };

  return (
    <div className="min-h-[calc(100vh-64px)] bg-gradient-mesh flex flex-col justify-between">
      {/* ── Hero ── */}
      <main className="max-w-4xl mx-auto px-6 pt-20 pb-12 w-full">
        <div className="text-center mb-12 fade-in">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-purple-100 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/20 text-purple-700 dark:text-purple-400 text-xs font-medium mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse"></span>
            Transparent Fact-Checking — Free & Open
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-tight mb-6">
            <span className="text-gray-900 dark:text-white">Verify any claim with</span>
            <br />
            <span className="gradient-text">Smart Research</span>
          </h1>

          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto leading-relaxed">
            TruthLens cross-references your claims across trusted web sources, fact-checkers, 
            and research papers to deliver transparent, cited verdicts you can actually trust.
          </p>
        </div>

        {/* ── Search Bar ── */}
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="relative max-w-2xl mx-auto mb-8 slide-up"
          style={{ animationDelay: '0.2s' }}
        >
          <div className="gradient-border glow">
            <div className="flex items-center bg-white/90 dark:bg-gray-900/90 rounded-2xl p-2 backdrop-blur-xl">
              <svg className="w-5 h-5 text-gray-500 ml-4 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                {...register('text')}
                placeholder="Enter a claim to fact-check..."
                className="flex-1 bg-transparent border-none outline-none text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 py-3 px-2 text-base"
                id="claim-search-input"
              />
              <button
                type="submit"
                disabled={isSubmitting || !claimText || claimText.trim().length < 10}
                className="btn-primary btn-lg flex-shrink-0 disabled:opacity-30 flex items-center justify-center min-w-[140px]"
                id="claim-search-submit"
              >
                {isSubmitting ? (
                  <span className="spinner"></span>
                ) : (
                  'Check Claim'
                )}
              </button>
            </div>
          </div>
          {errors.text && (
            <p className="form-error text-center mt-3">{errors.text.message}</p>
          )}

          {/* ── Advanced Toggle ── */}
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="inline-flex items-center gap-2 text-xs text-gray-500 hover:text-gray-900 dark:hover:text-gray-300 transition-colors"
            >
              <svg
                className={`w-3 h-3 transition-transform duration-200 ${showAdvanced ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              Advanced Settings
            </button>
          </div>

          {/* ── Advanced Settings Panel ── */}
          {showAdvanced && (
            <div className="card-glass mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-left fade-in slide-up">
              <div>
                <label className="form-label !mb-1 text-xs">Depth</label>
                <select {...register('depth')} className="input !py-2 !text-sm">
                  <option value="quick">Quick (Light Scan)</option>
                  <option value="standard">Standard (Balanced)</option>
                  <option value="deep">Deep (Thorough)</option>
                </select>
              </div>
              <div>
                <label className="form-label !mb-1 text-xs">Category</label>
                <select {...register('category')} className="input !py-2 !text-sm">
                  <option value="health">Health</option>
                  <option value="politics">Politics</option>
                  <option value="science">Science</option>
                  <option value="finance">Finance</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="form-label !mb-1 text-xs">LLM Provider</label>
                <select {...register('llmProvider')} className="input !py-2 !text-sm">
                  <option value="groq">Groq (Fast & Free)</option>
                  <option value="gemini">Google Gemini</option>
                  <option value="openai">OpenAI GPT-4</option>
                  <option value="anthropic">Anthropic Claude</option>
                </select>
              </div>
            </div>
          )}
        </form>

        {/* ── Example Claims ── */}
        <div className="max-w-2xl mx-auto mb-20 fade-in" style={{ animationDelay: '0.4s' }}>
          <p className="text-xs text-gray-500 mb-3 text-center">Try an example:</p>
          <div className="flex flex-wrap justify-center gap-2">
            {EXAMPLE_CLAIMS.map((example) => (
              <button
                key={example}
                onClick={() => handleExampleClick(example)}
                className="text-xs px-3 py-1.5 rounded-lg bg-gray-200 dark:bg-gray-800/50 text-gray-700 dark:text-gray-400
                           hover:text-gray-900 dark:hover:text-white hover:bg-gray-300 dark:hover:bg-gray-700/60 border border-gray-300 dark:border-gray-700/30
                           transition-all duration-200 hover:border-purple-500/30"
              >
                "{example}"
              </button>
            ))}
          </div>
        </div>

        {/* ── How It Works ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-20">
          {[
            {
              step: '01',
              title: 'Break it down',
              desc: 'We break complex claims into simple, verifiable parts to make our research more targeted and accurate.',
              icon: (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
              ),
            },
            {
              step: '02',
              title: 'Gather Evidence',
              desc: 'We scan trusted sources across the web to find relevant context, historical facts, and data.',
              icon: (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
              ),
            },
            {
              step: '03',
              title: 'Final Analysis',
              desc: 'We carefully weigh the evidence to provide a clear, cited verdict and explain our reasoning.',
              icon: (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              ),
            },
          ].map((item, i) => (
            <div
              key={item.step}
              className="card-hover text-center fade-in"
              style={{ animationDelay: `${0.5 + i * 0.15}s` }}
            >
              <div className="w-12 h-12 rounded-xl mx-auto mb-4 flex items-center justify-center bg-gradient-to-br from-purple-500/20 to-blue-500/20 border border-purple-500/20">
                <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {item.icon}
                </svg>
              </div>
              <div className="text-xs font-mono text-purple-400 mb-2">{item.step}</div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{item.title}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>

        {/* ── Trust Indicators ── */}
        <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-gray-500 mb-12">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            Free to use
          </div>
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            No data stored
          </div>
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            Citation-backed verdicts
          </div>
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            Open source
          </div>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="text-center py-8 text-xs text-gray-500 dark:text-gray-600 border-t border-gray-200 dark:border-gray-800/50 w-full mt-auto">
        <p>Empowering critical thinking through transparent research • TruthLens © {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
}
