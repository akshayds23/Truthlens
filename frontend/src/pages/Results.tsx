import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useApp } from '../store/appContext';
import { claimsService } from '../services/api';
import type { Evidence } from '../types';
import { downloadPDF, downloadJSON, downloadMarkdown } from '../utils/export';

function ConfidenceGauge({ confidence }: { confidence: number }) {
  const percent = Math.round(confidence * 100);
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (confidence * circumference);

  const getColor = () => {
    if (percent >= 80) return 'stroke-emerald-400';
    if (percent >= 60) return 'stroke-yellow-400';
    if (percent >= 40) return 'stroke-orange-400';
    return 'stroke-red-400';
  };

  return (
    <div className="confidence-ring flex-shrink-0">
      <svg width="140" height="140" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="54" fill="none" strokeWidth="6" className="stroke-gray-200 dark:stroke-gray-800" />
        <circle
          cx="60" cy="60" r="54" fill="none" strokeWidth="6"
          className={getColor()}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1s ease-out' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-black text-gray-900 dark:text-white">{percent}%</span>
        <span className="text-xs text-gray-500 font-medium">confidence</span>
      </div>
    </div>
  );
}

function VerdictBadge({ verdict }: { verdict: string }) {
  const config: Record<string, { label: string; class: string }> = {
    TRUE: { label: 'TRUE', class: 'badge-true' },
    MOSTLY_TRUE: { label: 'MOSTLY TRUE', class: 'badge-true' },
    MISLEADING: { label: 'MISLEADING', class: 'badge-misleading' },
    FALSE: { label: 'FALSE', class: 'badge-false' },
    UNVERIFIABLE: { label: 'UNVERIFIABLE', class: 'badge-unverifiable' },
  };
  const c = config[verdict] || config.UNVERIFIABLE;
  return <span className={`${c.class} text-sm px-4 py-1.5`}>{c.label}</span>;
}

export default function Results() {
  const navigate = useNavigate();
  const { claimId } = useParams<{ claimId: string }>();
  const { currentReport, setCurrentReport } = useApp();
  const [claim, setClaim] = useState<any>(null);
  const [expandedSubClaim, setExpandedSubClaim] = useState<string | null>(null);
  const [loading, setLoading] = useState(!currentReport);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  useEffect(() => {
    if (!claimId) {
      setLoading(false);
      setError('Missing claim ID');
      return;
    }

    const loadReport = async () => {
      try {
        setLoading(true);
        const response = await claimsService.getClaimById(claimId);
        if (response.report) {
          setCurrentReport(response.report);
          setClaim(response.claim);
          setError(null);
        } else if (currentReport?.claimId === claimId) {
          // Report already in context, just fetch claim info
          setClaim(response.claim);
          setError(null);
        } else {
          setError('This claim is still processing.');
        }
      } catch (err) {
        // If we already have the report in context, just use it
        if (currentReport?.claimId === claimId) {
          setError(null);
        } else {
          setError(err instanceof Error ? err.message : 'Failed to load results');
        }
      } finally {
        setLoading(false);
      }
    };
    void loadReport();
  }, [claimId]);

  const handleShare = async () => {
    const url = `${window.location.origin}/report/${claimId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const textarea = document.createElement('textarea');
      textarea.value = url;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="spinner w-8 h-8 mx-auto mb-4 border-gray-300 dark:border-gray-700"></div>
          <p className="text-gray-500">Loading results...</p>
        </div>
      </div>
    );
  }

  if (!currentReport) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center card max-w-md mx-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">No Results</h1>
          <p className="text-gray-500 mb-6">{error || 'Submit a claim to see results'}</p>
          <button onClick={() => navigate('/')} className="btn-primary">
            Check a Claim
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-64px)] md:h-[calc(100vh-64px)] bg-gray-50 dark:bg-gray-950 flex flex-col md:overflow-hidden">
      
      {/* ── Sub Header ── */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between shrink-0 bg-white/50 dark:bg-gray-900/50 backdrop-blur">
        <h1 className="text-lg font-bold text-gray-800 dark:text-gray-200 truncate pr-4">Fact Check Report</h1>
        <div className="flex items-center gap-2 relative">
          <button onClick={handleShare} className="btn-secondary btn-sm flex items-center gap-2">
            {copied ? '✓ Copied!' : '🔗 Share'}
          </button>
          
          <button 
            onClick={() => setShowExportMenu(!showExportMenu)} 
            className="btn-secondary btn-sm flex items-center gap-2"
          >
            Export ▾
          </button>
          
          {showExportMenu && (
            <div className="absolute top-10 right-0 w-32 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden text-sm fade-in">
              <button onClick={() => { downloadPDF({ ...currentReport, claimText: claim?.text }); setShowExportMenu(false); }} className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300">PDF</button>
              <button onClick={() => { downloadMarkdown({ ...currentReport, claimText: claim?.text }); setShowExportMenu(false); }} className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300">Markdown</button>
              <button onClick={() => { downloadJSON({ ...currentReport, claimText: claim?.text }); setShowExportMenu(false); }} className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300">JSON</button>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
        {/* ── Left Column: Verdict & Summary ── */}
        <div className="w-full md:w-[400px] lg:w-[450px] p-6 shrink-0 md:border-r border-gray-200 dark:border-gray-800 md:overflow-y-auto bg-white dark:bg-gray-900/30">
          <div className="card glow mb-6 fade-in flex flex-col items-center text-center">
            <div className="mb-6">
              <ConfidenceGauge confidence={currentReport.confidence} />
            </div>
            <VerdictBadge verdict={currentReport.verdict} />
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mt-5 mb-2 leading-snug">
              "{claim?.text || 'Fact Check Report'}"
            </h2>
          </div>

          <div className="fade-in" style={{ animationDelay: '0.1s' }}>
            <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-2 uppercase tracking-wider">Analysis Summary</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed bg-gray-100/50 dark:bg-gray-800/30 p-4 rounded-xl border border-gray-200/50 dark:border-gray-700/50">
              {currentReport.reasoning}
            </p>
          </div>
        </div>

        {/* ── Right Column: Sub-Claims & Evidence ── */}
        <div className="w-full flex-1 p-6 md:overflow-y-auto">
          <div className="max-w-3xl mx-auto space-y-8">
            
            {/* ── Sub-Claims ── */}
            {currentReport.subClaims?.length > 0 && (
              <div className="slide-up" style={{ animationDelay: '0.2s' }}>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  Sub-Claims Analysis
                </h3>
                <div className="space-y-3">
                  {currentReport.subClaims.map((sub: any) => (
                    <div
                      key={sub.id}
                      className="card-hover cursor-pointer border-gray-200 dark:border-gray-800"
                      onClick={() => setExpandedSubClaim(expandedSubClaim === sub.id ? null : sub.id)}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <p className="font-medium text-gray-800 dark:text-gray-200 mb-2">{sub.text}</p>
                          <div className="flex gap-3 items-center">
                            <VerdictBadge verdict={sub.verdict} />
                            <span className="text-xs text-gray-500 mono">
                              {(sub.confidence * 100).toFixed(0)}% confident
                            </span>
                          </div>
                        </div>
                        <svg
                          className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${expandedSubClaim === sub.id ? 'rotate-180' : ''}`}
                          fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>

                      {expandedSubClaim === sub.id && sub.evidence?.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-800/50 space-y-3 fade-in">
                          {sub.evidence.map((ev: Evidence) => (
                            <div key={ev.id} className="bg-gray-50 dark:bg-gray-800/30 rounded-xl p-3 border border-gray-100 dark:border-transparent">
                              <p className="text-sm text-gray-700 dark:text-gray-300 mb-1">{ev.excerpt}</p>
                              <a
                                href={ev.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-purple-600 dark:text-purple-400 hover:underline"
                              >
                                → {ev.source}
                              </a>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Evidence ── */}
            {(currentReport.supportingEvidence?.length > 0 || currentReport.contradictingEvidence?.length > 0) && (
              <div className="slide-up" style={{ animationDelay: '0.3s' }}>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                  </svg>
                  Evidence
                </h3>

                {currentReport.supportingEvidence?.length > 0 && (
                  <div className="mb-6">
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold mb-2 uppercase tracking-wider">Supporting</p>
                    <div className="space-y-3">
                      {currentReport.supportingEvidence.map((ev: any, idx: number) => (
                        <div key={idx} className="card p-4 border-l-4 border-l-emerald-500 border-gray-200 dark:border-gray-800">
                          <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">{ev.text || ev.excerpt}</p>
                          <div className="flex items-center justify-between">
                            <a href={ev.url || ev.sourceUrl} target="_blank" rel="noopener noreferrer"
                               className="text-xs text-purple-600 dark:text-purple-400 hover:underline truncate max-w-xs">
                              {ev.source || ev.title}
                            </a>
                            <span className="text-xs text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                              Relevance: {((ev.relevance || 1) * 100).toFixed(0)}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {currentReport.contradictingEvidence?.length > 0 && (
                  <div className="mb-6">
                    <p className="text-xs text-red-600 dark:text-red-400 font-semibold mb-2 uppercase tracking-wider">Contradicting</p>
                    <div className="space-y-3">
                      {currentReport.contradictingEvidence.map((ev: any, idx: number) => (
                        <div key={idx} className="card p-4 border-l-4 border-l-red-500 border-gray-200 dark:border-gray-800">
                          <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">{ev.text || ev.excerpt}</p>
                          <div className="flex items-center justify-between">
                            <a href={ev.url || ev.sourceUrl} target="_blank" rel="noopener noreferrer"
                               className="text-xs text-purple-600 dark:text-purple-400 hover:underline truncate max-w-xs">
                              {ev.source || ev.title}
                            </a>
                            <span className="text-xs text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                              Relevance: {((ev.relevance || 1) * 100).toFixed(0)}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Sources ── */}
            {currentReport.citations?.length > 0 && (
              <div className="slide-up" style={{ animationDelay: '0.4s' }}>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  Sources Used
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {currentReport.citations.map((source: any, idx: number) => (
                    <a
                      key={idx}
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="card-hover p-4 flex flex-col justify-between border-gray-200 dark:border-gray-800"
                    >
                      <span className="text-sm font-medium text-gray-800 dark:text-gray-200 line-clamp-2 mb-2">{source.title}</span>
                      <div className="flex items-center justify-between mt-auto">
                        <span className="text-xs text-gray-500 truncate max-w-[120px]">
                          {new URL(source.url).hostname.replace('www.', '')}
                        </span>
                        {source.credibilityScore && (
                          <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
                            {(source.credibilityScore * 100).toFixed(0)}% credibility
                          </span>
                        )}
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

