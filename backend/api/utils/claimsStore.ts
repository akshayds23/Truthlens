import { query, queryOne } from './database';
import { logger } from './logger';
import { v4 as uuidv4 } from 'uuid';

export interface StoredClaim {
  id: string;
  user_id: string;
  text: string;
  category: string;
  depth: string;
  llm_provider: string;
  status: string;
  job_id: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface StoredReport {
  id: string;
  claim_id: string;
  verdict: string;
  confidence: number;
  explanation: string;
  full_report_json: any;
  generated_at: Date;
  ai_service_version: string | null;
}

export interface StoredFeedback {
  id: string;
  user_id: string;
  report_id: string;
  rating: number;
  comment: string | null;
  created_at: Date;
}

export const claimsStore = {
  async createClaim(
    userId: string,
    text: string,
    category: string,
    depth: string,
    llmProvider: string,
    jobId: string
  ): Promise<StoredClaim> {
    const id = uuidv4();
    const now = new Date();

    logger.info('Creating claim with params', {
      id,
      userId,
      category,
      depth,
      llmProvider,
      jobId,
    });

    const result = await queryOne(
      `INSERT INTO claims (id, user_id, text, category, depth, llm_provider, status, job_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [id, userId, text, category, depth, llmProvider, 'pending', jobId, now, now]
    );

    logger.info('Claim created', { claimId: id, userId });
    return result as StoredClaim;
  },

  async getAnonymousUser(): Promise<string> {
    const email = 'anonymous@truthlens.ai';
    let user = await queryOne('SELECT id FROM users WHERE email = $1', [email]);
    
    if (!user) {
      const id = uuidv4();
      user = await queryOne(
        `INSERT INTO users (id, email, password, full_name, role) 
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [id, email, 'no-password', 'Anonymous User', 'user']
      );
      logger.info('Created anonymous system user', { id });
    }
    
    return user.id;
  },

  async getClaimById(claimId: string): Promise<StoredClaim | null> {
    const result = await queryOne(
      'SELECT * FROM claims WHERE id = $1 AND deleted_at IS NULL',
      [claimId]
    );
    return result as StoredClaim | null;
  },

  async getClaimsByUser(
    userId: string,
    limit: number = 10,
    offset: number = 0
  ): Promise<{ claims: StoredClaim[]; total: number }> {
    const claimsResult = await query(
      `SELECT * FROM claims 
       WHERE user_id = $1 AND deleted_at IS NULL 
       ORDER BY created_at DESC 
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    const countResult = await queryOne(
      'SELECT COUNT(*) as count FROM claims WHERE user_id = $1 AND deleted_at IS NULL',
      [userId]
    );

    return {
      claims: claimsResult.rows as StoredClaim[],
      total: parseInt(countResult.count),
    };
  },

  async updateClaimStatus(claimId: string, status: string): Promise<StoredClaim | null> {
    const now = new Date();
    const result = await queryOne(
      'UPDATE claims SET status = $1, updated_at = $2 WHERE id = $3 RETURNING *',
      [status, now, claimId]
    );
    return result as StoredClaim | null;
  },

  async softDeleteClaim(claimId: string): Promise<void> {
    const now = new Date();
    await query('UPDATE claims SET deleted_at = $1, updated_at = $2 WHERE id = $3', [
      now,
      now,
      claimId,
    ]);
    logger.info('Claim soft deleted', { claimId });
  },

  async getReportByClaim(claimId: string): Promise<StoredReport | null> {
    const result = await queryOne('SELECT * FROM reports WHERE claim_id = $1', [claimId]);
    return result as StoredReport | null;
  },

  async createReport(
    claimId: string,
    verdict: string,
    confidence: number,
    explanation: string,
    fullReportJson: any,
    aiServiceVersion?: string
  ): Promise<StoredReport> {
    const id = uuidv4();
    const now = new Date();

    const result = await queryOne(
      `INSERT INTO reports (id, claim_id, verdict, confidence, explanation, full_report_json, generated_at, ai_service_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [id, claimId, verdict, confidence, explanation, fullReportJson, now, aiServiceVersion || null]
    );

    logger.info('Report created', { reportId: id, claimId });
    return result as StoredReport;
  },

  async createFeedback(
    userId: string,
    reportId: string,
    rating: number,
    comment?: string
  ): Promise<StoredFeedback> {
    const id = uuidv4();
    const now = new Date();

    const result = await queryOne(
      `INSERT INTO feedback (id, user_id, report_id, rating, comment, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [id, userId, reportId, rating, comment || null, now]
    );

    logger.info('Feedback created', { feedbackId: id, reportId });
    return result as StoredFeedback;
  },

  async searchClaims(searchTerm: string): Promise<StoredClaim[]> {
    const likePattern = `%${searchTerm}%`;
    const result = await query(
      `SELECT * FROM claims 
       WHERE (text ILIKE $1 OR category ILIKE $1) 
       AND deleted_at IS NULL 
       ORDER BY created_at DESC 
       LIMIT 20`,
      [likePattern]
    );
    return result.rows as StoredClaim[];
  },
};
