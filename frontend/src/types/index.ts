// Claim types
export interface Claim {
  id: string;
  text: string;
  category: 'health' | 'politics' | 'science' | 'finance' | 'other';
  depth: 'quick' | 'standard' | 'deep';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  verdict?: string;
  confidence?: number;
  createdAt: string;
  completedAt?: string;
  report?: FactCheckReport;
}

export interface SubClaim {
  id: string;
  text: string;
  verdict: string;
  confidence: number;
  evidence: Evidence[];
}

export interface Evidence {
  id: string;
  source: string;
  sourceUrl: string;
  excerpt: string;
  credibilityScore: number;
  isSupporting: boolean;
}

export interface FactCheckReport {
  id: string;
  claimId: string;
  verdict: 'TRUE' | 'MOSTLY_TRUE' | 'MISLEADING' | 'FALSE' | 'UNVERIFIABLE';
  confidence: number;
  reasoning: string;
  subClaims: SubClaim[];
  supportingEvidence: Evidence[];
  contradictingEvidence: Evidence[];
  citations: Citation[];
  createdAt: string;
}

export interface Citation {
  id: string;
  url: string;
  title: string;
  credibilityScore: number;
  excerpt?: string;
}

// User types
export interface User {
  id: string;
  email: string;
  fullName: string;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  refreshToken: string;
  user: User;
}

// API Response wrapper
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Form submission
export interface ClaimSubmissionForm {
  text: string;
  category: 'health' | 'politics' | 'science' | 'finance' | 'other';
  depth: 'quick' | 'standard' | 'deep';
  llmProvider: 'openai' | 'gemini' | 'anthropic' | 'groq' | 'local';
  apiKey?: string;
}

