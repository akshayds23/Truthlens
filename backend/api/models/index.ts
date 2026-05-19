// Database models will be defined here
// This is a stub for future ORM integration (Prisma, TypeORM, etc.)

export interface User {
  id: string;
  email: string;
  password: string;
  name: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Claim {
  id: string;
  user_id: string;
  text: string;
  category: 'health' | 'politics' | 'science' | 'finance' | 'other';
  depth: 'quick' | 'standard' | 'deep';
  llm_provider: 'openai' | 'gemini' | 'anthropic' | 'groq' | 'local';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  job_id?: string;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date;
}

export interface FactCheckReport {
  id: string;
  claim_id: string;
  verdict: 'TRUE' | 'MOSTLY_TRUE' | 'MISLEADING' | 'FALSE' | 'UNVERIFIABLE';
  confidence: number;
  explanation: string;
  full_report_json?: any;
  generated_at: Date;
  ai_service_version?: string;
}

export interface Provider {
  id: string;
  name: string;
  url: string;
  category: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// TODO: Implement actual model definitions with Prisma or TypeORM
