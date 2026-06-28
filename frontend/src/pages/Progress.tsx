import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams, Link, useLocation } from 'react-router-dom';
import { claimsService } from '../services/api';

// The 7-step AI/ML pipeline stages
const PIPELINE_STAGES = [
  {
    id: 1,
    label: 'Decomposing Claim',
    detail: 'LLM breaks the claim into verifiable sub-claims',
    icon: '🧩',
    durationMs: 2000,
  },
  {
    id: 2,
    label: 'Semantic Search',
    detail: 'Querying Serper / Wikipedia / DuckDuckGo for evidence',
    icon: '🔍',
    durationMs: 3000,
  },
  {
    id: 3,
    label: 'Extracting Content',
    detail: 'Scraping & parsing articles with Trafilatura + BeautifulSoup',
    icon: '📄',
    durationMs: 4000,
  },
  {
    id: 4,
    label: 'Chunking Text',
    detail: 'Splitting source material into overlapping context windows',
    icon: '✂️',
    durationMs: 1500,
  },
  {
    id: 5,
    label: 'Generating Embeddings',
    detail: 'Encoding chunks via sentence-transformers (all-MiniLM-L6-v2)',
    icon: '🧠',
    durationMs: 3000,
  },
  {
    id: 6,
    label: 'Hybrid Evidence Retrieval',
    detail: 'Ranking evidence with BM25 + cosine similarity + credibility score',
    icon: '📊',
    durationMs: 1500,
  },
  {
    id: 7,
    label: 'Generating Verdict',
    detail: 'LLM reasons over evidence with chain-of-thought prompting',
    icon: '⚖️',
    durationMs: 6000,
  },
];

// Verdict color map
const VERDICT_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  TRUE: { bg: 'bg-emerald-500/20 border-emerald-500/40', text: 'text-emerald-400', label: 'TRUE' },
  MOSTLY_TRUE: { bg: 'bg-emerald-500/20 border-emerald-500/40', text: 'text-emerald-400', label: 'MOSTLY TRUE' },
  MISLEADING: { bg: 'bg-yellow-500/20 border-yellow-500/40', text: 'text-yellow-400', label: 'MISLEADING' },
  FALSE: { bg: 'bg-red-500/20 border-red-500/40', text: 'text-red-400', label: 'FALSE' },
  UNVERIFIABLE: { bg: 'bg-gray-700/50 border-gray-600/40', text: 'text-gray-400', label: 'UNVERIFIABLE' },
};

export default function Progress() {
  const { claimId } = useParams<{ claimId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as { claimText?: string; apiKey?: string; llmProvider?: string; depth?: string } | null;

  const [error, setError] = useState<string | null>(null);
  const [activeStage, setActiveStage] = useState(0);   // index into PIPELINE_STAGES (0-based)
  const [completedStages, setCompletedStages] = useState<number[]>([]);
  const [similarMatch, setSimilarMatch] = useState<{
    match: boolean;
    similarity: number;
    claim_id?: string;
    original_text?: string;
    verdict?: string;
  } | null>(null);

  const startTimeRef = useRef(Date.now());
  const stageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorTimeRef = useRef<number | null>(null);

  // ── Stream-based processing and stage tracking ──
  useEffect(() => {
    if (!claimId) return;
    let active = true;
    let stageTimer: ReturnType<typeof setTimeout> | null = null;

    const startSimulation = (fromStageIndex = 0) => {
      if (!active) return;
      let stageIndex = fromStageIndex;

      const advance = () => {
        if (stageIndex >= PIPELINE_STAGES.length) return;
        setActiveStage(stageIndex);
        const stageDuration = PIPELINE_STAGES[stageIndex].durationMs;
        stageTimer = setTimeout(() => {
          const completedStage = stageIndex;
          setCompletedStages((prev) =>
            prev.includes(completedStage) ? prev : [...prev, completedStage]
          );
          stageIndex += 1;
          advance();
        }, stageDuration);
      };

      advance();
    };

    // Start stream
    claimsService.processClaimStream(
      claimId,
      {
        apiKey: locationState?.apiKey,
        depth: locationState?.depth,
        llmProvider: locationState?.llmProvider,
      },
      (event) => {
        if (!active) return;
        if (event.stage !== undefined) {
          const targetIndex = event.stage - 1;
          setActiveStage(targetIndex);
          setCompletedStages((prev) => {
            const next = [...prev];
            for (let i = 0; i < targetIndex; i++) {
              if (!next.includes(i)) next.push(i);
            }
            return next;
          });
        }
        if (event.status === 'completed') {
          navigate(`/results/${claimId}`);
        }
        if (event.error) {
          setError(event.error);
        }
      }
    ).catch((err) => {
      if (!active) return;
      console.warn('Process stream finished or failed, using simulation/polling fallback:', err);
      // Fallback: Start simulation from the current active stage
      startSimulation(activeStage);
    });

    return () => {
      active = false;
      if (stageTimer) clearTimeout(stageTimer);
    };
  }, [claimId, locationState, navigate]);

  // ── Stop timers if error occurs ──
  useEffect(() => {
    if (error && !errorTimeRef.current) {
      errorTimeRef.current = Date.now();
      if (stageTimerRef.current) clearTimeout(stageTimerRef.current);
    }
  }, [error]);

  // ── Poll the API for completion ──
  useEffect(() => {
    if (!claimId) return;
    let active = true;

    const poll = async () => {
      try {
        const response = await claimsService.getClaimById(claimId);
        if (!active) return;

        if (response.report || response.claim.status === 'completed') {
          navigate(`/results/${claimId}`);
        } else if (response.claim.status === 'failed') {
          setError('Claim processing failed. Please submit it again.');
        }
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Failed to load claim status');
      }
    };

    void poll();
    const intervalId = window.setInterval(() => void poll(), 3000);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [claimId, navigate]);

  // ── Similar-claims check disabled on t2.micro (1GB RAM) ──
  // Running this concurrently with the main embedding pipeline causes OOM.
  // To re-enable on higher-spec hardware, uncomment the block below.
  //
  // useEffect(() => {
  //   const claimText = locationState?.claimText;
  //   if (!claimText) return;
  //   claimsService.checkSimilarClaim(claimText).then((result) => {
  //     if (result.match && result.claim_id !== claimId) {
  //       setSimilarMatch(result);
  //     }
  //   }).catch(() => {/* non-fatal */});
  // }, [claimId, locationState?.claimText]);

  // Compute overall progress %
  const totalDuration = PIPELINE_STAGES.reduce((s, p) => s + p.durationMs, 0);
  const elapsed = (errorTimeRef.current || Date.now()) - startTimeRef.current;
  const stageProgress = (activeStage / PIPELINE_STAGES.length) * 100;
  const progress = error
    ? 100
    : Math.max(stageProgress, Math.min((elapsed / totalDuration) * 100, 98));

  return (
    <div className="min-h-screen bg-gradient-mesh flex flex-col">


      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-10 space-y-6">

        {/* ── Title ── */}
        <div className="text-center mb-12 fade-in">
          <h1 className="text-3xl sm:text-4xl font-black text-gray-900 dark:text-white mb-2">
            {error ? 'Processing Failed' : 'AI Research in Progress'}
          </h1>
          <p className="text-gray-400 text-sm">
            {error ? error : 'We are gathering evidence and cross-referencing sources...'}
          </p>
        </div>

        {/* ── Semantic Similarity Banner ── */}
        {similarMatch?.match && similarMatch.verdict && (
          <div
            className={`rounded-xl border p-4 flex items-start gap-4 fade-in ${
              VERDICT_STYLE[similarMatch.verdict]?.bg ?? 'bg-gray-700/50 border-gray-600/40'
            }`}
          >
            <span className="text-2xl mt-0.5">🔁</span>
            <div className="flex-1">
              <p className="text-gray-900 dark:text-white text-sm font-semibold mb-0.5">
                We've seen a similar claim before&nbsp;
                <span className="text-gray-400 font-normal">
                  ({Math.round(similarMatch.similarity * 100)}% similar)
                </span>
              </p>
              <p className="text-gray-300 text-xs truncate mb-2">
                "{similarMatch.original_text}"
              </p>
              <div className="flex items-center gap-3">
                <span
                  className={`text-xs font-bold uppercase tracking-wider ${
                    VERDICT_STYLE[similarMatch.verdict]?.text ?? 'text-gray-400'
                  }`}
                >
                  Previously: {VERDICT_STYLE[similarMatch.verdict]?.label ?? similarMatch.verdict}
                </span>
                <Link
                  to={`/results/${similarMatch.claim_id}`}
                  className="text-xs text-blue-400 hover:text-blue-300 underline underline-offset-2"
                >
                  View cached result →
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* ── Live Pipeline Diagram ── */}
        <div className="card space-y-1 slide-up">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
            AI Pipeline — Step {Math.min(activeStage + 1, 7)} / 7
          </h2>

          {PIPELINE_STAGES.map((stage, idx) => {
            const isFailed = !!error && activeStage === idx;
            const isDone = completedStages.includes(idx) && !isFailed;
            const isActive = !error && activeStage === idx && !isDone;
            const isPending = !isDone && !isActive && !isFailed;

            return (
              <div
                key={stage.id}
                className={`
                  flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-500
                  ${isDone ? 'bg-emerald-500/10 border border-emerald-500/20' : ''}
                  ${isActive ? 'bg-purple-500/10 border border-purple-500/30 shadow-lg shadow-purple-500/5' : ''}
                  ${isFailed ? 'bg-red-500/10 border border-red-500/30 shadow-lg shadow-red-500/5' : ''}
                  ${isPending ? 'opacity-30' : ''}
                `}
              >
                {/* Step indicator */}
                <div className={`
                  w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-base
                  transition-all duration-500
                  ${isDone ? 'bg-emerald-500/30' : ''}
                  ${isActive ? 'bg-purple-500/30 ring-2 ring-purple-400/50 animate-pulse' : ''}
                  ${isFailed ? 'bg-red-500/30 ring-2 ring-red-400/50' : ''}
                  ${isPending ? 'bg-gray-800' : ''}
                `}>
                  {isFailed ? '❌' : isDone ? '✅' : stage.icon}
                </div>

                {/* Label */}
                <div className="flex-1 mt-1.5">
                  <p className={`text-sm font-semibold leading-snug ${isDone ? 'text-emerald-500 dark:text-emerald-400' : isActive ? 'text-gray-900 dark:text-white' : isFailed ? 'text-red-600 dark:text-red-400' : 'text-gray-400 dark:text-gray-500'}`}>
                    {stage.label}
                  </p>
                  {(isActive || isDone || isFailed) && (
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{stage.detail}</p>
                  )}
                </div>

                {/* Status indicator */}
                <div className="shrink-0">
                  {isFailed ? (
                    <span className="text-xs text-red-500 font-medium">Failed</span>
                  ) : isDone ? (
                    <span className="text-xs text-emerald-500 font-medium">Done</span>
                  ) : isActive ? (
                    <span className="flex items-center gap-1.5 text-xs text-purple-400 font-medium">
                      <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                      Running
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Progress Bar ── */}
        <div className="card">
          <div className="flex justify-between items-center mb-2 px-1">
            <span className="text-sm font-bold text-gray-900 dark:text-white">{Math.round(progress)}%</span>
            <span className="text-xs font-medium text-purple-600 dark:text-purple-400">Research Progress</span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-2.5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${
                error ? 'bg-red-500' : 'bg-gradient-to-r from-purple-500 to-blue-500'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>

          <p className="text-xs text-gray-600 mt-4 text-center">
            {error
              ? 'An error occurred during processing.'
              : 'Typical research time: 30s–2min depending on depth setting.'}
          </p>

          {error && (
            <div className="text-center mt-4">
              <button
                onClick={() => navigate('/')}
                className="btn-primary btn-sm"
              >
                ← Try Another Claim
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
