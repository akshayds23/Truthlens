import type { AuthResponse, Claim, FactCheckReport, ClaimSubmissionForm, User } from '../types';

const isLocalHost =
  typeof window !== 'undefined' &&
  ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';

function getConfiguredApiHostname(baseUrl: string) {
  try {
    return baseUrl ? new URL(baseUrl).hostname : '';
  } catch (_error) {
    return '';
  }
}

const configuredApiHostname = getConfiguredApiHostname(configuredApiBaseUrl);
const isLocalConfiguredApi = ['localhost', '127.0.0.1', '::1'].includes(configuredApiHostname);
const API_BASE_URL =
  configuredApiBaseUrl && (isLocalHost || !isLocalConfiguredApi)
    ? configuredApiBaseUrl
    : isLocalHost
      ? 'http://localhost:5000'
      : '';

function normalizeClaim(raw: any): Claim {
  return {
    id: raw.id,
    text: raw.text,
    category: raw.category,
    depth: raw.depth,
    status: raw.status,
    verdict: raw.verdict,
    confidence: raw.confidence,
    createdAt: raw.createdAt ?? raw.created_at,
    completedAt: raw.completedAt ?? raw.completed_at,
    report: raw.report,
  };
}

function normalizeReport(raw: any): FactCheckReport {
  return {
    id: raw.id,
    claimId: raw.claimId ?? raw.claim_id,
    verdict: raw.verdict,
    confidence: raw.confidence,
    reasoning: raw.reasoning ?? raw.explanation ?? '',
    subClaims: raw.subClaims ?? raw.sub_claims ?? [],
    supportingEvidence: raw.supportingEvidence ?? raw.supporting_evidence ?? [],
    contradictingEvidence: raw.contradictingEvidence ?? raw.contradicting_evidence ?? [],
    citations: raw.citations ?? [],
    createdAt: raw.createdAt ?? raw.generated_at ?? new Date().toISOString(),
  };
}

// Utility function to make requests
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    if (response.status === 401) {
      // Token expired, clear storage
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    const error = await response.json();
    throw new Error(error.error || `API error: ${response.status}`);
  }

  return response.json();
}

function getAuthHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {
    ...extraHeaders,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
}

function downloadBlob(blob: Blob, fileName: string) {
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(objectUrl);
}

function getFileNameFromDisposition(contentDisposition: string | null, fallback: string): string {
  if (!contentDisposition) {
    return fallback;
  }

  const match = contentDisposition.match(/filename="?([^"]+)"?/i);
  return match?.[1] || fallback;
}

// Authentication endpoints
export const authService = {
  register: async (email: string, password: string, fullName: string) => {
    const response = await apiRequest<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, fullName }),
    });
    localStorage.setItem('token', response.token);
    localStorage.setItem('user', JSON.stringify(response.user));
    return response;
  },

  login: async (email: string, password: string) => {
    const response = await apiRequest<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    localStorage.setItem('token', response.token);
    localStorage.setItem('user', JSON.stringify(response.user));
    return response;
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  },

  getCurrentUser: async () => {
    return apiRequest<User>('/api/auth/me');
  },

  refreshToken: async () => {
    const response = await apiRequest<AuthResponse>('/api/auth/refresh', {
      method: 'POST',
    });
    localStorage.setItem('token', response.token);
    return response;
  },
};

// Claims endpoints
export const claimsService = {
  submitClaim: async (formData: ClaimSubmissionForm) => {
    const response = await apiRequest<{ claimId: string; jobId: string }>(
      '/api/claims',
      {
        method: 'POST',
        body: JSON.stringify(formData),
      }
    );
    return response;
  },

  processClaimStream: async (
    claimId: string,
    body: { apiKey?: string; depth?: string; llmProvider?: string },
    onEvent: (event: { stage?: number; detail?: string; status?: string; error?: string }) => void
  ) => {
    const token = localStorage.getItem('token');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}/api/claims/${claimId}/process`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Process request failed' }));
      throw new Error(err.error || `Process request failed: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('ReadableStream not supported in this browser');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith('data: ')) {
          try {
            const data = JSON.parse(trimmed.slice(6));
            onEvent(data);
          } catch (e) {
            console.error('Failed to parse SSE line', trimmed, e);
          }
        }
      }
    }
  },


  checkSimilarClaim: async (text: string): Promise<{
    match: boolean;
    similarity: number;
    claim_id?: string;
    original_text?: string;
    verdict?: string;
  }> => {
    try {
      const response = await fetch(`${API_BASE_URL}/ai/similar-claims`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!response.ok) return { match: false, similarity: 0 };
      return response.json();
    } catch (_e) {
      return { match: false, similarity: 0 };
    }
  },

  getClaimHistory: async (page = 1, limit = 10) => {
    const response = await apiRequest<{ claims: any[]; total: number; page: number; limit: number }>(
      `/api/claims?page=${page}&limit=${limit}`
    );
    return {
      ...response,
      claims: response.claims.map(normalizeClaim),
    };
  },

  getClaimById: async (claimId: string) => {
    const response = await apiRequest<{ claim: any; report?: any }>(
      `/api/claims/${claimId}`
    );
    return {
      claim: normalizeClaim(response.claim),
      report: response.report ? normalizeReport(response.report) : undefined,
    };
  },

  deleteClaim: async (claimId: string) => {
    return apiRequest<{ success: boolean }>(`/api/claims/${claimId}`, {
      method: 'DELETE',
    });
  },

  exportReport: async (claimId: string, format: 'pdf' | 'markdown' | 'json') => {
    const response = await fetch(
      `${API_BASE_URL}/api/claims/${claimId}/export?format=${format}`,
      {
        method: 'POST',
        headers: getAuthHeaders(),
      }
    );

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const error = await response.json();
        throw new Error(error.error || `API error: ${response.status}`);
      }

      throw new Error(`Export failed with status ${response.status}`);
    }

    if (format === 'markdown') {
      const blob = await response.blob();
      const fileName = getFileNameFromDisposition(
        response.headers.get('content-disposition'),
        `report-${claimId}.md`
      );
      downloadBlob(blob, fileName);
      return { success: true };
    }

    const payload = await response.json();

    if (format === 'json') {
      const blob = new Blob([JSON.stringify(payload.data, null, 2)], {
        type: 'application/json',
      });
      downloadBlob(blob, `report-${claimId}.json`);
      return { success: true };
    }

    const blob = new Blob([JSON.stringify(payload.data ?? payload, null, 2)], {
      type: 'application/json',
    });
    downloadBlob(blob, `report-${claimId}.json`);
    return { success: true };
  },

  submitFeedback: async (claimId: string, feedback: any) => {
    return apiRequest<{ success: boolean }>(
      `/api/claims/${claimId}/feedback`,
      {
        method: 'POST',
        body: JSON.stringify(feedback),
      }
    );
  },
};

// LLM Provider endpoints
export const providersService = {
  listProviders: async () => {
    return apiRequest<{ providers: string[] }>('/api/providers');
  },

  testApiKey: async (provider: string, apiKey: string) => {
    return apiRequest<{ valid: boolean }>(
      '/api/providers/test-key',
      {
        method: 'POST',
        body: JSON.stringify({ provider, apiKey }),
      }
    );
  },
};

