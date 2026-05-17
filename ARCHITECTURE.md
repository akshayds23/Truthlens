# TruthLens AI - Architecture & Design

## 1. High-Level System Architecture

### Architectural Diagram (ASCII)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER (Browser)                       │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ Frontend: React + TypeScript + Tailwind CSS                    │ │
│  │ ├─ Claim Submission Page → Category, Depth, LLM Provider       │ │
│  │ ├─ Real-time Progress Tracker → Pipeline status updates        │ │
│  │ ├─ Results Dashboard → Verdict, Evidence, Citations            │ │
│  │ ├─ Claim History → View, Delete, Export reports               │ │
│  │ └─ Settings → LLM providers, API keys, preferences             │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                                ▲
                                │ HTTPS + WebSocket
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     REVERSE PROXY (Nginx)                            │
│  ├─ TLS/SSL Termination (Let's Encrypt)                             │
│  ├─ Load Balancing                                                   │
│  ├─ Static file serving (React build)                               │
│  └─ WebSocket upgrade for real-time progress                        │
└─────────────────────────────────────────────────────────────────────┘
                                ▲
                ┌───────────────┴────────────────┐
                ▼                                 ▼
┌─────────────────────────────┐    ┌─────────────────────────────┐
│   API GATEWAY (Node.js)      │    │   AI SERVICE (Python)       │
│   ├─ Port: 3000              │    │   ├─ Port: 8000             │
│   ├─ Express with TypeScript  │    │   ├─ FastAPI               │
│   │                           │    │   │                        │
│   │ CONTROLLERS:              │    │   │ SERVICES:               │
│   ├─ Auth Controller          │    │   ├─ Claim Decomposition   │
│   ├─ Claims Controller        │    │   ├─ Search Agent          │
│   ├─ Providers Controller     │    │   ├─ Content Extractor     │
│   │                           │    │   ├─ Embeddings            │
│   │ MIDDLEWARE:               │    │   ├─ Evidence Retrieval    │
│   ├─ JWT Authentication       │    │   ├─ Verdict Generation    │
│   ├─ Error Handling           │    │   └─ Report Assembly       │
│   ├─ Rate Limiting            │    │                            │
│   └─ CORS/Security            │    │   INTEGRATIONS:            │
│                               │    │   ├─ LangChain (LLMs)      │
│   SERVICES:                   │    │   ├─ Search APIs           │
│   ├─ User Auth Service        │    │   │  ├─ DuckDuckGo         │
│   ├─ Claims Service           │    │   │  ├─ Serper             │
│   ├─ AI Orchestration         │    │   │  └─ Brave Search       │
│   └─ LLM Proxy (SafeKey)      │    │   ├─ BeautifulSoup (web)   │
│                               │    │   ├─ Trafilatura (content) │
│                               │    │   ├─ Sentence-transformers │
│                               │    │   └─ Chroma (vector store) │
└─────────────────────────────┘    └─────────────────────────────┘
        ▲                                     ▲
        │                                     │
        │ PostgreSQL Queries                  │
        │ JWT Validation, Sessions            │ Embeddings, Vector Queries
        │                                     │
        └─────────────────┬───────────────────┘
                          ▼
        ┌─────────────────────────────────┐
        │  DATA LAYER (PostgreSQL)        │
        │  ├─ Users table                 │
        │  ├─ Claims & Sub-claims         │
        │  ├─ Sources & Evidence          │
        │  ├─ Reports & Verdicts          │
        │  ├─ User Feedback               │
        │  └─ Vector Embeddings (pgvector)│
        │                                 │
        │  VECTOR STORE (Chroma - MVP)    │
        │  ├─ Embedding vectors           │
        │  ├─ Chunk metadata              │
        │  └─ Source references           │
        └─────────────────────────────────┘
                          ▲
                          │
        ┌─────────────────────────────────┐
        │  CACHING (Redis - Optional)     │
        │  ├─ Session cache               │
        │  ├─ Embedding cache             │
        │  └─ Search results cache        │
        └─────────────────────────────────┘
```

---

## 2. Data Flow: User Journey

### A Single Claim Processing Pipeline

```
USER SUBMITS CLAIM
    │
    ├─ Claim: "Climate change is entirely driven by solar cycles"
    ├─ Category: "Science"
    ├─ Depth: "Standard"
    └─ LLM: "OpenAI GPT-4" (via user API key)
    ▼
[FRONTEND] Submit claim via API
    ▼
[API GATEWAY: POST /api/claims]
    ├─ Validate JWT token (authentication)
    ├─ Validate claim input (length, content)
    ├─ Create claim record in DB (status: pending)
    ├─ Return claim_id + job_id
    └─ Start async processing
    ▼
[AI SERVICE: /generate-verdict endpoint]
    ├─ STAGE 1: Decompose Claim
    │   ├─ Input: Full claim text
    │   ├─ LLM Call: "Break this claim into 3-5 sub-claims"
    │   └─ Output: ["Solar cycles drive climate", "Humans don't affect climate", ...]
    │
    ├─ STAGE 2: Search & Gather Evidence
    │   ├─ For each sub-claim:
    │   │   ├─ Generate 2-3 search queries
    │   │   ├─ Query DuckDuckGo → Get 5 URLs
    │   │   ├─ Query Serper → Get 5 URLs
    │   │   └─ Query Brave → Get 5 URLs
    │   ├─ Dedup URLs, prioritize by source credibility
    │   └─ Collect ~30-50 sources
    │
    ├─ STAGE 3: Extract & Process Content
    │   ├─ For each URL:
    │   │   ├─ Fetch web page
    │   │   ├─ Extract clean text (BeautifulSoup)
    │   │   ├─ Remove boilerplate (trafilatura)
    │   │   └─ Store source + content
    │   └─ ~500-2000 KB of raw text
    │
    ├─ STAGE 4: Chunk & Embed
    │   ├─ Split content into 512-token chunks (overlapping)
    │   ├─ Generate embeddings (all-MiniLM-L6-v2)
    │   ├─ Store chunks + embeddings in Chroma
    │   └─ ~100-200 chunks total
    │
    ├─ STAGE 5: Retrieve Relevant Evidence
    │   ├─ For each sub-claim:
    │   │   ├─ Embed sub-claim
    │   │   ├─ Hybrid search in Chroma (vector + keyword)
    │   │   ├─ Retrieve top-5 relevant chunks
    │   │   └─ Assign relevance + credibility scores
    │   └─ ~25-50 evidence chunks per sub-claim
    │
    ├─ STAGE 6: Generate Verdict
    │   ├─ LLM Input:
    │   │   ├─ Original claim
    │   │   ├─ Sub-claims
    │   │   ├─ Retrieved evidence (with citations)
    │   │   └─ User's LLM choice (OpenAI/Gemini/etc)
    │   ├─ Prompt: "Fact-check this claim based on evidence..."
    │   └─ LLM Output:
    │       ├─ Verdict: "MOSTLY FALSE"
    │       ├─ Confidence: 0.85
    │       ├─ Reasoning: "While solar cycles do influence climate..."
    │       ├─ Sub-verdicts (for each sub-claim)
    │       └─ Citation references [1][2][3]...
    │
    ├─ STAGE 7: Assemble Report
    │   ├─ Combine all outputs
    │   ├─ Format citations with source links
    │   ├─ Create summary + detailed breakdown
    │   └─ Store report in DB
    │
    └─ Update claim status → "completed"
    ▼
[FRONTEND: Real-time updates via WebSocket]
    ├─ Claim submitted → Processing
    ├─ Decomposing claim → 20%
    ├─ Searching sources → 40%
    ├─ Extracting content → 60%
    ├─ Generating verdict → 85%
    └─ Retrieving results → 100% ✓
    ▼
[RESULTS DASHBOARD]
    ├─ Verdict: "MOSTLY FALSE" ⚠️
    ├─ Confidence: 85%
    ├─ Summary: "While solar cycles influence climate, 97% of climate scientists agree..."
    │
    ├─ Sub-Claim Breakdown:
    │   ├─ "Solar cycles drive climate" → FALSE (high confidence)
    │   │   Evidence: [7 sources]
    │   ├─ "Humans don't affect climate" → FALSE (very high confidence)
    │   │   Evidence: [12 sources]
    │   └─ "Climate sensitivity to solar is primary" → MISLEADING
    │       Evidence: [5 sources]
    │
    ├─ Supporting Evidence (Pro-claim):
    │   └─ [3 sources showing solar cycle effects]
    │
    ├─ Contradicting Evidence (Against claim):
    │   └─ [15 sources showing human-caused climate change]
    │
    └─ Citations:
        [1] IPCC Assessment Report 6 (2021)
        [2] NASA Climate Research Data
        [3] ... [12 total sources]
```

---

## 3. API Endpoints Overview

### Frontend → API Gateway

```
AUTH ENDPOINTS
  POST   /api/auth/register          → Register user
  POST   /api/auth/login             → Login user
  POST   /api/auth/refresh           → Refresh JWT token
  GET    /api/auth/me                → Get current user info
  POST   /api/auth/logout            → Logout user

CLAIMS ENDPOINTS
  POST   /api/claims                 → Submit new claim (returns claim_id + job_id)
  GET    /api/claims                 → List user's claim history (paginated)
  GET    /api/claims/:id             → Get specific claim details + report
  DELETE /api/claims/:id             → Delete a claim
  POST   /api/claims/:id/feedback    → Submit user feedback (True/False/etc)
  POST   /api/claims/:id/export      → Export report (PDF/Markdown)

PROVIDERS ENDPOINTS
  POST   /api/providers/test-key     → Validate LLM API key (OpenAI, Gemini, etc)
  GET    /api/providers              → List supported LLM providers
  POST   /api/providers/usage        → Get API usage stats

WEBSOCKET ENDPOINT
  WS     /ws/claims/:job_id          → Real-time progress updates
```

### API Gateway → AI Service

```
FACT-CHECKING ENDPOINTS
  POST   /decompose-claim            → Break claim into sub-claims
  POST   /generate-verdict           → Full orchestration (all stages)
  POST   /retrieve-evidence          → Hybrid search in vector store
  POST   /evaluate-sources           → Credibility scoring

EMBEDDING ENDPOINTS
  POST   /embed-text                 → Generate embeddings for query
  POST   /search-similar             → Find similar chunks in vector store
```

---

## 4. Component Interactions

### A. Authentication Flow

```
User Registration/Login
  │
  ├─ Frontend: POST /api/auth/login {email, password}
  │
  ├─ API Gateway:
  │   ├─ Hash password with bcrypt
  │   ├─ Compare with DB hash
  │   ├─ Generate JWT token (exp: 24h)
  │   ├─ Return {token, refreshToken, user}
  │   └─ Set refresh token as secure HTTP-only cookie
  │
  └─ Frontend:
      ├─ Store JWT in localStorage (or sessionStorage)
      ├─ Include JWT in Authorization header for all requests
      └─ Show authenticated UI
```

### B. Claim Submission Flow

```
User submits claim via React Form
  │
  ├─ Frontend Form Validation:
  │   ├─ Claim length: 10-500 chars (Zod validation)
  │   ├─ Category: one of [health, politics, science, finance, other]
  │   ├─ Depth: one of [quick, standard, deep]
  │   ├─ Provider: [openai, gemini, anthropic, groq, local]
  │   └─ Optional API key validation
  │
  ├─ POST /api/claims
  │   {
  │     "text": "Climate change is entirely driven by solar cycles",
  │     "category": "science",
  │     "depth": "standard",
  │     "llm_provider": "openai",
  │     "api_key": "sk-..." (optional)
  │   }
  │
  ├─ API Gateway:
  │   ├─ JWT token validation
  │   ├─ Input validation
  │   ├─ Create claim record: {id, user_id, text, status: "processing", created_at}
  │   ├─ Safely store encrypted API key (if provided)
  │   ├─ Send to AI Service via queue or HTTP call
  │   └─ Return {claim_id: "c123", job_id: "j456"}
  │
  ├─ Frontend:
  │   ├─ Receive claim_id + job_id
  │   ├─ Redirect to /progress/:job_id
  │   └─ Open WebSocket to /ws/claims/:job_id
  │
  └─ AI Service (async):
      ├─ Process claim through 7 stages
      ├─ Emit progress: 0%, 20%, 40%, 60%, 80%, 100%
      ├─ Store report in DB
      ├─ Emit completion event
      └─ Close connection
```

### C. LLM Provider Proxy

```
User provides OpenAI API key (or uses default)
  │
  ├─ Frontend: Submit claim with LLM provider + optional API key
  │
  ├─ API Gateway (LLM Proxy):
  │   ├─ Validate API key format (starts with "sk-", etc)
  │   ├─ Encrypt key before storing (AES-256)
  │   ├─ Pass claim + encrypted key to AI Service
  │   └─ Remove key from logs/monitoring
  │
  ├─ AI Service:
  │   ├─ Decrypt user's API key (only during processing)
  │   ├─ Use LangChain to call LLM:
  │   │   ├─ LLM = OpenAI (if "openai" provider + user key)
  │   │   ├─ LLM = Gemini (if "gemini" provider + user key)
  │   │   ├─ LLM = Anthropic (if "anthropic" provider + user key)
  │   │   └─ LLM = Groq (if "groq" provider + user key)
  │   ├─ Call decomposition endpoint
  │   ├─ Call verdict generation endpoint
  │   └─ Discard API key after use
  │
  └─ Result:
      ├─ Verdict generated using user's LLM
      ├─ API key never exposed to frontend
      └─ No residual key in logs
```

---

## 5. Microservice Communication

### Synchronous (HTTP/REST)

```
API Gateway ←→ AI Service

POST /decompose-claim
  Request: {claim: str, llm_provider: str, api_key: str}
  Response: {sub_claims: List[str]}

POST /generate-verdict
  Request: {claim, sub_claims, depth, llm_provider, api_key}
  Response: {verdict, confidence, reasoning, citations, report_json}
```

### Asynchronous (via Database/Queue)

```
Frontend → API Gateway → AI Service (via task queue or DB polling)

1. Frontend submits claim
2. API Gateway creates claim record + stores job metadata
3. AI Service polls for new jobs (or receives via Celery/RabbitMQ)
4. AI Service processes and updates claim status in DB
5. Frontend polls /api/claims/:id for updates (or WebSocket)
```

### Real-time Updates (WebSocket)

```
Frontend ←→ API Gateway (upgraded to WebSocket)
                    ↓
                AI Service (sends progress via API)
                    ↓
         API Gateway broadcasts to WebSocket clients

Client connects: ws://api.truthlens.io/ws/claims/j123
Server emits:
  {type: "progress", stage: "decomposing", percent: 20}
  {type: "progress", stage: "searching", percent: 40}
  {type: "progress", stage: "extracting", percent: 60}
  {type: "progress", stage: "embedding", percent: 80}
  {type: "progress", stage: "generating_verdict", percent: 100}
  {type: "complete", report_id: "r789"}
```

---

## 6. Technology Integration Matrix

| Component | Technology | Why Chosen | Alternatives |
|-----------|-----------|-----------|--------------|
| Frontend | React 18 + TypeScript | Type safety, component reusability | Vue, Svelte, Angular |
| Styling | Tailwind CSS | Utility-first, rapid development | Material-UI, styled-components |
| State | React Context | Minimal overhead for MVP | Redux, Zustand, Jotai |
| Routing | React Router v6 | Latest, hooks-based, nested routes | Next.js, TanStack Router |
| API Client | Fetch API | Built-in, modern, fetch support | Axios, TanStack Query |
| Form | React Hook Form + Zod | Performant, type-safe validation | Formik, React Final Form |
| Backend | Express.js + TypeScript | Lightweight, large ecosystem | Fastify, Hapi, NestJS |
| Authentication | JWT + bcrypt | Stateless, scalable, secure | OAuth, Sessions, Passport |
| API Docs | Swagger/OpenAPI | Auto-generated docs | OpenAPI Generator |
| Python Service | FastAPI | Async, automatic docs, performance | Flask, Django, Starlette |
| LLM Chain | LangChain | Unified provider interface | LlamaIndex, Semantic Kernel |
| Web Scraping | BeautifulSoup + trafilatura | Easy parsing, content extraction | Selenium, Playwright, Scrapy |
| Embeddings | sentence-transformers | Free, local, high quality | OpenAI embeddings, Cohere |
| Vector Store | Chroma (MVP) | Easy local setup, SQLite fallback | Weaviate, Pinecone, Milvus |
| Database | PostgreSQL + pgvector | ACID compliance, vector extension | MySQL, MongoDB, Elasticsearch |
| Caching | Redis (optional) | Fast key-value, sessions, rate limits | Memcached, in-memory |
| Containers | Docker + Compose | Reproducible, multi-service orchestration | Podman, Kubernetes |
| Proxy | Nginx | Performant, TLS termination, load balancing | Apache, Caddy, Traefik |
| SSL | Let's Encrypt + Certbot | Free, automated renewal, widely supported | Paid SSL certificates |
| Deployment | AWS EC2 | Flexible, scalable, cost-effective | DigitalOcean, Linode, GCP |
| CI/CD | GitHub Actions | Native to GitHub, free tier | GitLab CI, Jenkins, CircleCI |

---

## 7. Data Model Overview

### Users Table
```sql
users {
  id: UUID,
  email: string (unique),
  password_hash: string,
  full_name: string,
  settings: JSON {
    default_llm_provider: "openai" | "gemini" | "anthropic" | "groq",
    dark_mode: boolean,
    auto_export: boolean
  },
  api_keys_encrypted: JSON {  -- encrypted
    openai: string,
    gemini: string,
    anthropic: string,
    groq: string
  },
  created_at: timestamp,
  updated_at: timestamp
}
```

### Claims Table
```sql
claims {
  id: UUID,
  user_id: UUID (fk → users),
  text: string,
  category: "health" | "politics" | "science" | "finance" | "other",
  depth: "quick" | "standard" | "deep",
  status: "pending" | "processing" | "completed" | "failed",
  llm_provider: "openai" | "gemini" | "anthropic" | "groq" | "local",
  created_at: timestamp,
  completed_at: timestamp (nullable)
}
```

### Reports Table
```sql
reports {
  id: UUID,
  claim_id: UUID (fk → claims),
  verdict: "TRUE" | "MOSTLY_TRUE" | "MISLEADING" | "FALSE" | "UNVERIFIABLE",
  confidence: float (0.0-1.0),
  reasoning: text,
  sub_verdicts: JSON [
    {
      sub_claim: string,
      verdict: string,
      confidence: float,
      evidence: [...]
    }
  ],
  supporting_evidence: JSON [...],
  contradicting_evidence: JSON [...],
  citations: JSON [
    {
      id: string,
      source_url: string,
      source_title: string,
      credibility_score: float,
      excerpt: string
    }
  ],
  created_at: timestamp
}
```

### Evidence Chunks (in Chroma)
```
{
  id: string,
  text: string (512-token chunk),
  embedding: vector[384],  -- from all-MiniLM-L6-v2
  metadata: {
    source_id: UUID,
    source_url: string,
    source_title: string,
    chunk_index: int,
    claim_id: UUID,
    credibility_score: float
  }
}
```

---

## 8. Error Handling & Recovery

### User-Facing Errors

```
❌ Claim submission fails
   → Show: "Failed to submit claim. Please try again."
   → Log: Error details for debugging

❌ Search API fails (DuckDuckGo down)
   → Fallback: Try Serper API
   → Fallback: Try Brave API
   → Fallback: Show partial results with warning

❌ LLM API timeout
   → Show: "Verdict generation took too long. Please try again."
   → Retry: Auto-retry up to 2 times

❌ Content extraction fails
   → Skip that source, continue with others
   → Log which sources failed

❌ Invalid API key
   → Show: "Invalid {provider} API key. Please update in Settings."
   → Guide: Link to get a new key
```

### System-Level Resilience

```
AI Service crashes during processing
  → Claim marked "failed" in DB
  → Retry signal sent to frontend
  → User can resubmit from history

API Gateway down
  → Nginx returns 503 Service Unavailable
  → Frontend shows: "Server is temporarily unavailable"
  → Retry with exponential backoff

PostgreSQL connection pool exhausted
  → Queue requests
  → Show: "System is processing high volume. Please wait."
  → Monitor and scale if needed

Chroma vector store unresponsive
  → Fallback to BM25 keyword search only
  → Show warning: "Using keyword search only"
```

---

## 9. Security Considerations

| Aspect | Implementation |
|--------|-----------------|
| **API Keys** | Encrypted at rest, decrypted only during use, never logged |
| **JWT Tokens** | Short-lived (24h), refresh token in secure HTTP-only cookie |
| **Passwords** | Bcrypt with salt, min 12 chars in validation |
| **HTTPS/TLS** | Enforced via Nginx, certificate via Let's Encrypt |
| **CORS** | Restricted to trusted frontend domains |
| **Rate Limiting** | 10 claims/hour per user, 100 requests/min per IP |
| **SQL Injection** | Parameterized queries via ORMs (Prisma, SQLAlchemy) |
| **XSS Protection** | React auto-escapes, CSP headers via Helmet |
| **Secret Management** | .env files (local), AWS Secrets Manager (production) |
| **Audit Logging** | Log user actions, API calls, errors |
| **Data Privacy** | GDPR compliance: user data deletion, data export |

---

## 10. Scalability Path

### MVP (Current Design)
- Single API Gateway instance
- Single AI Service instance
- Single PostgreSQL instance
- Chroma in-memory (SQLite fallback)
- Nginx acts as proxy/load balancer

### Phase 2: Horizontal Scaling
```
Nginx (Load Balancer)
  ├─ API Gateway #1
  ├─ API Gateway #2
  ├─ API Gateway #3
  │
  └─ AI Service #1
  └─ AI Service #2
  └─ AI Service #3
  
  ├─ PostgreSQL (primary) + replica
  ├─ Redis (for session/caching)
  └─ Chroma (distributed or Milvus)
```

### Phase 3: Cloud-Native (Kubernetes)
- Deploy via EKS (AWS Elastic Kubernetes Service)
- Horizontal pod autoscaling based on CPU/memory
- CloudFront CDN for static assets
- RDS managed PostgreSQL
- ElastiCache for Redis
- S3 for report storage/export

---

## Summary

This architecture provides:
✅ **Modular Design** — Frontend, API, AI service decoupled
✅ **Scalability** — Easy to add more instances or services
✅ **Security** — Encrypted keys, JWT auth, HTTPS, rate limiting
✅ **Resilience** — Fallbacks for failed services/APIs
✅ **Real-time UX** — WebSocket progress updates
✅ **Flexible LLMs** — User brings their own key or uses local models
✅ **Evidence-Backed** — All verdicts cited and traceable
