-- PostgreSQL Schema for TruthLens AI (Neon-compatible version)
-- Removes pgvector extension (not supported on Neon Free)

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enums (drop if exist first)
DROP TYPE IF EXISTS user_role CASCADE;
DROP TYPE IF EXISTS verdict_type CASCADE;
DROP TYPE IF EXISTS claim_category CASCADE;
DROP TYPE IF EXISTS claim_depth CASCADE;
DROP TYPE IF EXISTS claim_status CASCADE;
DROP TYPE IF EXISTS llm_provider CASCADE;

CREATE TYPE user_role AS ENUM ('user', 'admin', 'moderator');
CREATE TYPE verdict_type AS ENUM ('TRUE', 'MOSTLY_TRUE', 'MISLEADING', 'FALSE', 'UNVERIFIABLE');
CREATE TYPE claim_category AS ENUM ('health', 'politics', 'science', 'finance', 'other');
CREATE TYPE claim_depth AS ENUM ('quick', 'standard', 'deep');
CREATE TYPE claim_status AS ENUM ('pending', 'processing', 'completed', 'failed');
CREATE TYPE llm_provider AS ENUM ('openai', 'gemini', 'anthropic', 'groq', 'local');

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    role user_role DEFAULT 'user',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_is_active ON users(is_active);

-- Claims table
CREATE TABLE IF NOT EXISTS claims (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    category claim_category NOT NULL,
    depth claim_depth NOT NULL,
    llm_provider llm_provider NOT NULL,
    status claim_status DEFAULT 'pending',
    job_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

CREATE INDEX idx_claims_user_id ON claims(user_id);
CREATE INDEX idx_claims_status ON claims(status);
CREATE INDEX idx_claims_created_at ON claims(created_at);
CREATE INDEX idx_claims_user_created ON claims(user_id, created_at DESC);
CREATE INDEX idx_claims_deleted_at ON claims(deleted_at);

-- Sub-claims table
CREATE TABLE IF NOT EXISTS sub_claims (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    verdict verdict_type,
    confidence FLOAT CHECK (confidence >= 0 AND confidence <= 1),
    explanation TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sub_claims_claim_id ON sub_claims(claim_id);
CREATE INDEX idx_sub_claims_verdict ON sub_claims(verdict);

-- Sources table
CREATE TABLE IF NOT EXISTS sources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    url VARCHAR(2048) UNIQUE,
    title VARCHAR(512),
    domain VARCHAR(255),
    credibility_score FLOAT CHECK (credibility_score >= 0 AND credibility_score <= 1),
    last_scraped TIMESTAMP,
    content_hash VARCHAR(64),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sources_url ON sources(url);
CREATE INDEX idx_sources_domain ON sources(domain);
CREATE INDEX idx_sources_credibility ON sources(credibility_score DESC);

-- Evidence chunks table (without pgvector - using TEXT for embedding representation)
CREATE TABLE IF NOT EXISTS evidence_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_id UUID REFERENCES sources(id) ON DELETE CASCADE,
    claim_id UUID REFERENCES claims(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    embedding_json TEXT,
    start_offset INTEGER,
    end_offset INTEGER,
    relevance_score FLOAT CHECK (relevance_score >= 0 AND relevance_score <= 1),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_evidence_chunks_source_id ON evidence_chunks(source_id);
CREATE INDEX idx_evidence_chunks_claim_id ON evidence_chunks(claim_id);

-- Reports table (fact-check results)
CREATE TABLE IF NOT EXISTS reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    claim_id UUID UNIQUE NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    verdict verdict_type NOT NULL,
    confidence FLOAT CHECK (confidence >= 0 AND confidence <= 1),
    explanation TEXT,
    full_report_json JSONB,
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ai_service_version VARCHAR(64)
);

CREATE INDEX idx_reports_claim_id ON reports(claim_id);
CREATE INDEX idx_reports_verdict ON reports(verdict);
CREATE INDEX idx_reports_generated_at ON reports(generated_at DESC);

-- Feedback table
CREATE TABLE IF NOT EXISTS feedback (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_feedback_user_id ON feedback(user_id);
CREATE INDEX idx_feedback_report_id ON feedback(report_id);
CREATE INDEX idx_feedback_rating ON feedback(rating);

-- Create audit trail table (optional, for future use)
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(255) NOT NULL,
    resource_type VARCHAR(64),
    resource_id UUID,
    changes JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at DESC);

-- Add comments for documentation
COMMENT ON TABLE users IS 'User accounts and authentication';
COMMENT ON TABLE claims IS 'Fact-check claims submitted by users';
COMMENT ON TABLE sub_claims IS 'Decomposed sub-claims from main claims';
COMMENT ON TABLE sources IS 'Web sources and references used for evidence';
COMMENT ON TABLE evidence_chunks IS 'Extracted text chunks from sources (embeddings as JSON)';
COMMENT ON TABLE reports IS 'Final fact-check reports with verdicts';
COMMENT ON TABLE feedback IS 'User feedback on verdict accuracy';

COMMENT ON COLUMN claims.deleted_at IS 'Soft delete timestamp for audit trail';
COMMENT ON COLUMN evidence_chunks.embedding_json IS 'Vector embedding stored as JSON array (384 dimensions for all-MiniLM-L6-v2)';
COMMENT ON COLUMN reports.full_report_json IS 'Denormalized full report as JSONB for easy querying';

