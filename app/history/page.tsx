'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { claimsService } from '../../services/api';
import { useApp } from '../../store/appContext';
import type { Claim, FactCheckReport } from '../../types';

export default function History() {
  const router = useRouter();
  const { isAuthenticated } = useApp();

  const [claims, setClaims] = useState<(Claim & { report?: FactCheckReport })[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterVerdict, setFilterVerdict] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'date' | 'confidence'>('date');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  useEffect(() => {
    fetchClaims();
  }, []);

  const fetchClaims = async (showLoadingSpinner = true) => {
    try {
      if (showLoadingSpinner) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      const response = await claimsService.getClaimHistory();
      setClaims(response.claims);
      setError(null);
    } catch (err) {
      setError('Failed to load claim history');
      console.error(err);
    } finally {
      if (showLoadingSpinner) {
        setLoading(false);
      } else {
        setRefreshing(false);
      }
    }
  };

  const handleDelete = async (claimId: string) => {
    if (!window.confirm('Are you sure you want to delete this claim?')) {
      return;
    }

    try {
      await claimsService.deleteClaim(claimId);
      setClaims(claims.filter((claim) => claim.id !== claimId));
    } catch (err) {
      setError('Failed to delete claim');
      console.error(err);
    }
  };

  const handleExport = async (claimId: string, format: 'json' | 'markdown' | 'pdf') => {
    try {
      await claimsService.exportReport(claimId, format);
    } catch (err) {
      setError(`Failed to export as ${format.toUpperCase()}`);
      console.error(err);
    }
  };

  let filtered = [...claims];

  if (filterVerdict !== 'all' && filterCategory === 'all') {
    filtered = filtered.filter((claim) => claim.report?.verdict === filterVerdict);
  }

  if (filterCategory !== 'all' && filterVerdict === 'all') {
    filtered = filtered.filter((claim) => claim.category === filterCategory);
  }

  if (filterVerdict !== 'all' && filterCategory !== 'all') {
    filtered = filtered.filter(
      (claim) => claim.report?.verdict === filterVerdict && claim.category === filterCategory,
    );
  }

  if (sortBy === 'date') {
    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } else {
    filtered.sort((a, b) => (b.report?.confidence || 0) - (a.report?.confidence || 0));
  }

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const startIdx = (currentPage - 1) * itemsPerPage;
  const endIdx = startIdx + itemsPerPage;
  const paginatedClaims = filtered.slice(startIdx, endIdx);

  const getVerdictColor = (verdict?: string) => {
    switch (verdict) {
      case 'TRUE':
        return 'badge-true';
      case 'MOSTLY_TRUE':
      case 'MISLEADING':
        return 'badge-misleading';
      case 'FALSE':
        return 'badge-false';
      case 'UNVERIFIABLE':
      default:
        return 'badge-unverifiable';
    }
  };

  const getConfidenceColor = (confidence?: number) => {
    if (!confidence) return 'text-gray-500';
    if (confidence >= 0.8) return 'text-green-600';
    if (confidence >= 0.6) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="section">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-3xl sm:text-4xl font-bold">Claim History</h1>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => fetchClaims(false)}
            disabled={loading || refreshing}
            className="btn btn-secondary"
          >
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <Link href="/" className="btn btn-primary">
            Check New Claim
          </Link>
        </div>
      </div>

      {error && (
        <div className="card mb-6 border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20">
          <p className="text-red-700 dark:text-red-200">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="card py-12 text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading claims...</p>
        </div>
      ) : claims.length === 0 ? (
        <div className="card py-12 text-center">
          <p className="mb-6 text-gray-600 dark:text-gray-400">No claims found yet</p>
          <Link href="/" className="btn btn-primary">
            Submit Your First Claim
          </Link>
        </div>
      ) : (
        <>
          <div className="card mb-6">
            <h2 className="mb-4 text-xl font-semibold">Filters & Sorting</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="form-group">
                <label className="form-label">Category</label>
                <select
                  value={filterCategory}
                  onChange={(e) => {
                    setFilterCategory(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="input"
                >
                  <option value="all">All Categories</option>
                  <option value="health">Health</option>
                  <option value="politics">Politics</option>
                  <option value="science">Science</option>
                  <option value="finance">Finance</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Verdict</label>
                <select
                  value={filterVerdict}
                  onChange={(e) => {
                    setFilterVerdict(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="input"
                >
                  <option value="all">All Verdicts</option>
                  <option value="TRUE">True</option>
                  <option value="MOSTLY_TRUE">Mostly True</option>
                  <option value="MISLEADING">Misleading</option>
                  <option value="FALSE">False</option>
                  <option value="UNVERIFIABLE">Unverifiable</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Sort By</label>
                <select
                  value={sortBy}
                  onChange={(e) => {
                    setSortBy(e.target.value as 'date' | 'confidence');
                    setCurrentPage(1);
                  }}
                  className="input"
                >
                  <option value="date">Latest First</option>
                  <option value="confidence">Highest Confidence</option>
                </select>
              </div>
            </div>
            <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
              Showing {paginatedClaims.length > 0 ? startIdx + 1 : 0} -{' '}
              {Math.min(endIdx, filtered.length)} of {filtered.length} claims
            </p>
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="px-4 py-3 text-left font-semibold">Claim</th>
                  <th className="px-4 py-3 text-left font-semibold">Category</th>
                  <th className="px-4 py-3 text-left font-semibold">Verdict</th>
                  <th className="px-4 py-3 text-left font-semibold">Confidence</th>
                  <th className="px-4 py-3 text-left font-semibold">Date</th>
                  <th className="px-4 py-3 text-left font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedClaims.map((claim) => (
                  <tr
                    key={claim.id}
                    className="border-b border-gray-200 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/50"
                  >
                    <td className="px-4 py-3">
                      <p className="max-w-xs truncate text-sm">{claim.text}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm capitalize">{claim.category}</span>
                    </td>
                    <td className="px-4 py-3">
                      {claim.report ? (
                        <span className={`badge ${getVerdictColor(claim.report.verdict)}`}>
                          {claim.report.verdict.replace(/_/g, ' ')}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-500">Processing...</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {claim.report ? (
                        <span
                          className={`text-sm font-medium ${getConfidenceColor(claim.report.confidence)}`}
                        >
                          {(claim.report.confidence * 100).toFixed(0)}%
                        </span>
                      ) : (
                        <span className="text-sm text-gray-500">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {new Date(claim.createdAt).toLocaleDateString()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => router.push(`/results/${claim.id}`)}
                          className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
                        >
                          View
                        </button>
                        <button
                          onClick={() => handleExport(claim.id, 'json')}
                          className="text-sm text-gray-600 hover:text-gray-700 dark:text-gray-400"
                          title="Export as JSON"
                        >
                          JSON
                        </button>
                        <button
                          onClick={() => handleExport(claim.id, 'markdown')}
                          className="text-sm text-gray-600 hover:text-gray-700 dark:text-gray-400"
                          title="Export as Markdown"
                        >
                          MD
                        </button>
                        <button
                          onClick={() => handleDelete(claim.id)}
                          className="text-sm text-red-600 hover:text-red-700 dark:text-red-400"
                          title="Delete claim"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center space-x-2">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="btn btn-secondary btn-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>

              <div className="flex items-center space-x-2">
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .slice(Math.max(0, currentPage - 2), Math.min(totalPages, currentPage + 2))
                  .map((page) => (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                        page === currentPage
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600'
                      }`}
                    >
                      {page}
                    </button>
                  ))}
              </div>

              <button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="btn btn-secondary btn-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
