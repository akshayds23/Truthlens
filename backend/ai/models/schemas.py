from pydantic import BaseModel, Field
from typing import List, Optional, Literal, Dict, Any
from enum import Enum


class SubClaimTypeEnum(str, Enum):
    FACTUAL = "factual"
    OPINION = "opinion"
    COMPOUND = "compound"


class ComplexityEnum(str, Enum):
    SIMPLE = "simple"
    MODERATE = "moderate"
    COMPLEX = "complex"


class VerdictEnum(str, Enum):
    TRUE = "TRUE"
    MOSTLY_TRUE = "MOSTLY_TRUE"
    MISLEADING = "MISLEADING"
    FALSE = "FALSE"
    UNVERIFIABLE = "UNVERIFIABLE"


class CategoryEnum(str, Enum):
    HEALTH = "health"
    POLITICS = "politics"
    SCIENCE = "science"
    FINANCE = "finance"
    OTHER = "other"


class DepthEnum(str, Enum):
    QUICK = "quick"
    STANDARD = "standard"
    DEEP = "deep"


class LLMProviderEnum(str, Enum):
    OPENAI = "openai"
    GEMINI = "gemini"
    ANTHROPIC = "anthropic"
    GROQ = "groq"
    LOCAL = "local"


# Request schemas
class ClaimInput(BaseModel):
    text: str = Field(..., min_length=10, max_length=5000)
    category: CategoryEnum
    depth: DepthEnum
    llmProvider: LLMProviderEnum
    apiKey: Optional[str] = None


# Response schemas
class SubClaimSchema(BaseModel):
    id: str
    text: str
    verdict: VerdictEnum
    confidence: float = Field(..., ge=0, le=1)
    explanation: Optional[str] = None


class EvidenceSchema(BaseModel):
    id: str
    text: str
    source: str
    relevance: float = Field(..., ge=0, le=1)
    extracted_at: str


class CitationSchema(BaseModel):
    id: str
    title: str
    url: str
    credibility_score: Optional[float] = Field(None, ge=0, le=1)


class FactCheckReportSchema(BaseModel):
    claim_id: str
    verdict: VerdictEnum
    confidence: float = Field(..., ge=0, le=1)
    explanation: str
    sub_claims: List[SubClaimSchema]
    supporting_evidence: List[EvidenceSchema]
    contradicting_evidence: List[EvidenceSchema]
    sources: List[CitationSchema]
    generated_at: str


class DecomposeResponseSchema(BaseModel):
    claim_id: str
    sub_claims: List[SubClaimSchema]


class ErrorResponseSchema(BaseModel):
    error: str
    detail: Optional[str] = None
    status_code: int


# Decomposition endpoint schemas (Prompt 14)
class DecomposeSubClaimSchema(BaseModel):
    """Sub-claim for decomposition endpoint"""
    id: str
    text: str
    type: SubClaimTypeEnum
    importance: int = Field(..., ge=1, le=10)

    class Config:
        json_schema_extra = {
            "example": {
                "id": "sc_1",
                "text": "Climate change is caused by CO2 emissions",
                "type": "factual",
                "importance": 9
            }
        }


class DecomposeRequest(BaseModel):
    """Request schema for /decompose-claim endpoint"""
    claim: str = Field(..., min_length=10, max_length=500)
    model: str
    api_key: str

    class Config:
        json_schema_extra = {
            "example": {
                "claim": "Climate change is a hoax and the Earth is warming because of solar activity",
                "model": "gpt-4",
                "api_key": "sk-..."
            }
        }


class DecomposeResponse(BaseModel):
    """Response schema for /decompose-claim endpoint"""
    original_claim: str
    sub_claims: List[DecomposeSubClaimSchema]
    complexity: ComplexityEnum

    class Config:
        json_schema_extra = {
            "example": {
                "original_claim": "Climate change is a hoax and the Earth is warming because of solar activity",
                "sub_claims": [
                    {
                        "id": "sc_1",
                        "text": "Climate change is a hoax",
                        "type": "opinion",
                        "importance": 8
                    },
                    {
                        "id": "sc_2",
                        "text": "The Earth is warming because of solar activity",
                        "type": "factual",
                        "importance": 9
                    }
                ],
                "complexity": "moderate"
            }
        }


# Prompt 15: Search endpoint schemas
class SearchResult(BaseModel):
    """Individual search result"""
    url: str
    title: str
    snippet: str
    provider: Literal["duckduckgo", "brave", "serper", "wikipedia"]
    relevance: float = Field(..., ge=0, le=1)
    rank: int

    class Config:
        json_schema_extra = {
            "example": {
                "url": "https://example.com/article",
                "title": "Example Article Title",
                "snippet": "This is a preview of the article content...",
                "provider": "duckduckgo",
                "relevance": 0.95,
                "rank": 1
            }
        }


class SearchRequest(BaseModel):
    """Request schema for /search endpoint"""
    query: str = Field(..., min_length=3, max_length=200)
    num_results: int = Field(default=5, ge=1, le=20)
    providers: Optional[List[str]] = Field(
        default=["duckduckgo", "brave", "serper"],
        description="List of providers to use (default: all)"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "query": "climate change effects",
                "num_results": 5,
                "providers": ["duckduckgo", "brave", "serper"]
            }
        }


class SearchResponse(BaseModel):
    """Response schema for /search endpoint"""
    query: str
    results: List[SearchResult]
    total_results: int
    providers_used: List[str]

    class Config:
        json_schema_extra = {
            "example": {
                "query": "climate change effects",
                "results": [
                    {
                        "url": "https://example.com/article1",
                        "title": "Climate Change Effects",
                        "snippet": "Article preview...",
                        "provider": "brave",
                        "relevance": 0.98,
                        "rank": 1
                    }
                ],
                "total_results": 1,
                "providers_used": ["brave"]
            }
        }


# Prompt 16: Content extraction schemas
class ExtractedContent(BaseModel):
    """Extracted content from a single source"""
    text: str
    title: str
    source: str
    method: str  # 'trafilatura', 'beautifulsoup', 'pdf', etc.
    length: int
    
    class Config:
        json_schema_extra = {
            "example": {
                "text": "Article text content here...",
                "title": "Article Title",
                "source": "https://example.com/article",
                "method": "trafilatura",
                "length": 1250
            }
        }


class ExtractRequest(BaseModel):
    """Request schema for /extract endpoint"""
    urls: List[str] = Field(..., min_items=1, max_items=10)
    
    class Config:
        json_schema_extra = {
            "example": {
                "urls": ["https://example.com/article1", "https://example.com/article2"]
            }
        }


class ExtractResponse(BaseModel):
    """Response schema for /extract endpoint"""
    urls_submitted: int
    urls_extracted: int
    extracted_content: List[ExtractedContent]
    failed_urls: List[str]
    
    class Config:
        json_schema_extra = {
            "example": {
                "urls_submitted": 2,
                "urls_extracted": 2,
                "extracted_content": [
                    {
                        "text": "Content from article 1...",
                        "title": "Article 1",
                        "source": "https://example.com/article1",
                        "method": "trafilatura",
                        "length": 1250
                    }
                ],
                "failed_urls": []
            }
        }


# Prompt 17: Chunking and embedding schemas
class ChunkSchema(BaseModel):
    """A single text chunk with embedding"""
    id: str
    text: str
    start_offset: int
    end_offset: int
    source_id: str
    claim_id: Optional[str] = None
    embedding: Optional[List[float]] = None  # Typically 384 dimensions for all-MiniLM-L6-v2
    
    class Config:
        json_schema_extra = {
            "example": {
                "id": "source_123_chunk_0",
                "text": "First 512 tokens of article...",
                "start_offset": 0,
                "end_offset": 2048,
                "source_id": "source_123",
                "claim_id": "claim_456",
                "embedding": [0.1, -0.2, 0.3]  # Truncated example
            }
        }


class EmbedRequest(BaseModel):
    """Request schema for /embed endpoint"""
    text: str = Field(..., min_length=10, max_length=50000)
    source_id: str
    claim_id: Optional[str] = None
    chunk_size: int = Field(default=512, ge=100, le=2000)  # tokens
    chunk_overlap: int = Field(default=100, ge=0, le=1000)
    
    class Config:
        json_schema_extra = {
            "example": {
                "text": "Full article text here...",
                "source_id": "https://example.com/article",
                "claim_id": "claim_abc123",
                "chunk_size": 512,
                "chunk_overlap": 100
            }
        }


class EmbedResponse(BaseModel):
    """Response schema for /embed endpoint"""
    source_id: str
    claim_id: Optional[str]
    chunks: List[ChunkSchema]
    total_chunks: int
    embedding_model: str
    
    class Config:
        json_schema_extra = {
            "example": {
                "source_id": "source_123",
                "claim_id": "claim_456",
                "chunks": [
                    {
                        "id": "source_123_chunk_0",
                        "text": "First chunk...",
                        "start_offset": 0,
                        "end_offset": 2048,
                        "source_id": "source_123",
                        "claim_id": "claim_456",
                        "embedding": [0.1, -0.2]
                    }
                ],
                "total_chunks": 5,
                "embedding_model": "sentence-transformers/all-MiniLM-L6-v2"
            }
        }


# Prompt 18: Evidence retrieval schemas
class RetrievedEvidenceSchema(BaseModel):
    """Retrieved evidence chunk with relevance scores"""
    chunk_id: str
    text: str
    source_id: str
    relevance_score: float = Field(..., ge=0, le=1)
    vector_similarity: float = Field(..., ge=0, le=1)
    bm25_score: float = Field(..., ge=0, le=1)
    credibility: float = Field(..., ge=0, le=1)
    rank: int
    
    class Config:
        json_schema_extra = {
            "example": {
                "chunk_id": "source_123_chunk_0",
                "text": "Evidence text...",
                "source_id": "https://example.com/article",
                "relevance_score": 0.92,
                "vector_similarity": 0.95,
                "bm25_score": 0.88,
                "credibility": 0.90,
                "rank": 1
            }
        }


class RetrieveRequest(BaseModel):
    """Request schema for /retrieve-evidence endpoint"""
    query: str = Field(..., min_length=5, max_length=500)
    chunks: List[ChunkSchema]
    top_k: int = Field(default=5, ge=1, le=20)
    vector_weight: float = Field(default=0.5, ge=0, le=1)
    bm25_weight: float = Field(default=0.3, ge=0, le=1)
    credibility_weight: float = Field(default=0.2, ge=0, le=1)
    
    class Config:
        json_schema_extra = {
            "example": {
                "query": "What evidence supports climate change?",
                "chunks": [
                    {
                        "id": "chunk_1",
                        "text": "Evidence text...",
                        "start_offset": 0,
                        "end_offset": 100,
                        "source_id": "source_1",
                        "embedding": [0.1, -0.2]
                    }
                ],
                "top_k": 5,
                "vector_weight": 0.5,
                "bm25_weight": 0.3,
                "credibility_weight": 0.2
            }
        }


class RetrieveResponse(BaseModel):
    """Response schema for /retrieve-evidence endpoint"""
    query: str
    evidence: List[RetrievedEvidenceSchema]
    total_evidence: int
    
    class Config:
        json_schema_extra = {
            "example": {
                "query": "What evidence supports climate change?",
                "evidence": [
                    {
                        "chunk_id": "chunk_1",
                        "text": "Evidence text...",
                        "source_id": "source_1",
                        "relevance_score": 0.92,
                        "vector_similarity": 0.95,
                        "bm25_score": 0.88,
                        "credibility": 0.90,
                        "rank": 1
                    }
                ],
                "total_evidence": 1
            }
        }


# Prompt 19: Verdict generation schemas
class CitationSchema(BaseModel):
    """Citation linking evidence to claim"""
    claim: str
    evidence: str
    source_url: str
    confidence: float = Field(..., ge=0, le=1)
    
    class Config:
        json_schema_extra = {
            "example": {
                "claim": "CO2 causes climate change",
                "evidence": "Scientific studies show CO2 emissions are primary driver...",
                "source_url": "https://example.com/article",
                "confidence": 0.95
            }
        }


class VerdictResponseSchema(BaseModel):
    """Response schema for /generate-verdict endpoint"""
    claim_id: str
    claim_text: str
    verdict: VerdictEnum
    confidence: float = Field(..., ge=0, le=1)
    explanation: str
    key_points: List[str]
    citations: List[CitationSchema]
    sub_claims_verdicts: Optional[List[Dict[str, Any]]] = None
    generated_at: str
    
    class Config:
        json_schema_extra = {
            "example": {
                "claim_id": "claim_123",
                "claim_text": "The Earth is warming",
                "verdict": "TRUE",
                "confidence": 0.92,
                "explanation": "Supported by strong scientific evidence",
                "key_points": [
                    "Temperature records show warming trend",
                    "CO2 levels correlate with temperature"
                ],
                "citations": [
                    {
                        "claim": "Earth is warming",
                        "evidence": "Global temperatures increased by 1.1°C...",
                        "source_url": "https://example.com",
                        "confidence": 0.95
                    }
                ],
                "generated_at": "2024-01-01T00:00:00Z"
            }
        }


class GenerateVerdictRequest(BaseModel):
    """Request schema for /generate-verdict endpoint"""
    claim: str = Field(..., min_length=10, max_length=500)
    claim_id: Optional[str] = None
    sub_claims: Optional[List[str]] = None
    supporting_evidence: List[Dict[str, str]] = Field(..., min_items=0)
    contradicting_evidence: List[Dict[str, str]] = Field(default_factory=list)
    missing_context: List[str] = Field(default_factory=list)
    model: str
    api_key: str
    response_length: Optional[str] = Field(default="medium")
    
    class Config:
        json_schema_extra = {
            "example": {
                "claim": "Climate change is caused by humans",
                "claim_id": "claim_123",
                "sub_claims": ["CO2 increases cause warming", "Humans increase CO2"],
                "supporting_evidence": [
                    {
                        "text": "Scientific evidence...",
                        "source": "https://example.com"
                    }
                ],
                "contradicting_evidence": [],
                "missing_context": ["Regional variations"],
                "model": "gpt-4",
                "api_key": "sk-..."
            }
        }

