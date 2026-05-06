# TruthLens AI - Project Context & Architecture (2-Service Simplified)

## Project Summary
TruthLens AI is an autonomous fact-checking platform that uses AI, web search, vector embeddings, and LLM reasoning to verify claims and provide citation-backed verdicts.

**Current Architecture: 2 Services** (Simplified for easier deployment)
- Frontend (React 18 + TypeScript)
- Backend (Express API Gateway + FastAPI AI Service combined)
- Database (PostgreSQL with pgvector)

### Core Value Proposition
- **Autonomous Fact-Checking**: Decomposes claims, searches for evidence, extracts information, and generates verified verdicts
- **Flexible LLM Options**: OpenAI, Anthropic, Google Gemini, Groq (all equally supported)
- **Citation-Backed**: All verdicts include source citations and evidence trails
- **Full-Stack Application**: Modern web UI, robust API layer, unified backend service
- **Simple Deployment**: 3 Docker containers only (frontend + backend + database)

## Technology Stack

### Frontend
- **Framework**: React 18+ with TypeScript
- **Styling**: Tailwind CSS
- **State Management**: Zustand / React Context
- **Routing**: React Router v6+
- **Form Validation**: React Hook Form + Zod
- **Build Tool**: Vite or Create React App

### Backend (API Gateway + AI Service Combined)
- **API Framework**: Express.js with TypeScript (Port 5000)
- **AI Framework**: FastAPI with Python 3.11+ (Internal Port 8000)
- **Authentication**: JWT with bcrypt
- **Database Driver**: node-postgres (pg), SQLAlchemy (Python)
- **Security**: Helmet, CORS, Rate Limiting
- **LLM Integration**: LangChain, LiteLLM
- **Embeddings**: sentence-transformers (all-MiniLM-L6-v2)
- **Search Providers**: DuckDuckGo (free), Serper API (free tier), Brave Search (free tier)
- **Web Scraping**: BeautifulSoup, trafilatura
- **Communication**: Express proxies /fact-check/* requests to internal FastAPI service

### Data Layer
- **Primary Database**: PostgreSQL 15+ with pgvector extension
- **Vector Store Alternative**: Chroma (for local dev)
- **Caching**: Redis (optional, Phase 2)
- **ORM**: Prisma (Node.js), SQLAlchemy (Python)

### DevOps & Deployment
- **Containerization**: Docker + Docker Compose
- **Services**: 3 Docker containers only:
  1. **frontend** - React app (port 3000)
  2. **backend** - Express + FastAPI combined (port 5000)
  3. **postgres** - PostgreSQL 16 + pgvector (port 5432)
- **Orchestration**: Docker Compose (simplified from 6 containers)
- **Cloud Hosting**: AWS EC2 (t3.small or larger)
- **Reverse Proxy**: Optional Nginx for production with TLS/Let's Encrypt
- **CI/CD**: GitHub Actions

## Project Phases

### Phase 1: MVP (Core Functionality)
1. Project Planning & Architecture ✓
2. Frontend Foundation (React setup, UI components)
3. API Gateway (Express, auth, claim endpoints)
4. AI Service Core (claim decomposition, search, retrieval)
5. Database Setup (PostgreSQL + pgvector)
6. Docker Containerization
7. Basic Deployment

### Phase 2: Advanced Features
1. Multi-Agent Workflows (LangGraph)
2. Multilingual Support
3. Redis Caching & Performance
4. Advanced Analytics
5. Browser Extension

### Phase 3: Production Hardening
1. Comprehensive Testing & Evaluation
2. CI/CD Pipeline
3. Security Hardening
4. Scalability & Monitoring
5. Documentation & User Guide

## Key Decisions

### Architecture Pattern
- **Simplified 2-Service Design**: Combined API Gateway (Express) + AI Service (FastAPI) in single backend container
  - Express listens on port 5000 (external)
  - FastAPI runs on port 8000 (internal, proxied through Express)
- **Event-Driven**: Claims flow through pipeline with status updates
- **Real-Time Updates**: Polling for progress tracking (WebSocket optional in Phase 2)
- **Advantages**: Easier deployment, lower memory usage, faster startup, fewer moving parts

### LLM Strategy
- Support multiple LLM providers (OpenAI, Gemini, Anthropic, Groq)
- Allow users to bring their own API keys (BYOK)
- Fallback to local open-source models (Ollama/Llama)
- Secure proxying of API keys through backend

### Search Strategy
- Primary: Free tier APIs (DuckDuckGo, Serper free, Brave)
- Fallback: SearXNG or local search
- Rate limiting & caching to optimize costs

### Data Pipeline
1. **Claim Decomposition**: LLM breaks claim into sub-claims
2. **Search**: Generate queries from sub-claims
3. **Extraction**: Fetch & clean web content
4. **Embedding**: Chunk text → embed → store in pgvector
5. **Retrieval**: Hybrid search (vector + BM25 + credibility)
6. **Verdict**: LLM analyzes evidence → verdict + confidence
7. **Citation**: Format sources with evidence references

## File Structure (Current 2-Service Implementation)

```
truthlens/
├── frontend/                       # React 18 + TypeScript
│   ├── src/
│   │   ├── components/            # Reusable UI components
│   │   ├── pages/                 # Route pages (Claim, Progress, Results, History, Settings)
│   │   ├── hooks/                 # Custom React hooks
│   │   ├── services/              # API client (axios)
│   │   ├── store/                 # React Context state management
│   │   └── utils/                 # Validation, formatting, helpers
│   ├── Dockerfile                 # Multi-stage React build
│   └── package.json
│
├── api-gateway/                    # Express.js API (now part of backend)
│   ├── src/
│   │   ├── controllers/           # Route handlers (auth, claims, providers)
│   │   ├── routes/                # API route definitions
│   │   ├── services/              # Business logic (auth, claims, AI proxy)
│   │   ├── middleware/            # JWT, validation, error handling
│   │   ├── models/                # Database models (Prisma)
│   │   ├── utils/                 # JWT, hashing, logger
│   │   └── server.ts              # Express entry point
│   ├── Dockerfile                 # (Old, merged into Dockerfile.backend)
│   └── package.json
│
├── ai-service/                     # FastAPI AI (now part of backend)
│   ├── app/
│   │   ├── routers/               # FastAPI endpoints (/fact-check/*)
│   │   ├── services/              # Core fact-checking logic
│   │   ├── agents/                # LangChain/LangGraph agents
│   │   ├── models/                # Pydantic schemas
│   │   ├── utils/                 # LLM client, search providers, embedding
│   │   └── main.py                # FastAPI entry point
│   ├── Dockerfile                 # (Old, merged into Dockerfile.backend)
│   └── requirements.txt
│
├── database/
│   ├── migrations/                # Alembic migration scripts
│   ├── versions/                  # Migration versions
│   └── schema.sql                 # Database schema definition
│
├── docker-compose.yml             # Simplified 2-service orchestration
├── Dockerfile.backend             # New: Combined Express + FastAPI build
├── entrypoint.sh                  # Backend startup script (runs both services)
├── .env.example                   # Environment configuration template
├── README-2SERVICE.md             # Quick start guide for 2-service setup
└── context.md                     # This file (project context)
```

## Environment Variables (2-Service Configuration)

### Shared .env (All services)
```
# Database Configuration
DB_USER=truthlens
DB_PASSWORD=truthlens_dev
DB_NAME=truthlens
DATABASE_URL=postgresql://truthlens:truthlens_dev@postgres:5432/truthlens

# Node.js Configuration
NODE_ENV=development
PORT=5000

# JWT Authentication
JWT_SECRET=your_super_secret_key_change_in_production
JWT_EXPIRE=7d

# Python/FastAPI Configuration
PYTHONUNBUFFERED=1
LOG_LEVEL=INFO

# LLM Providers (at least ONE required)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=AIza...
GROQ_API_KEY=gsk_...

# Search Providers (Optional)
BRAVE_SEARCH_API_KEY=...
SERPER_API_KEY=...

# Vector Store Configuration
VECTOR_STORE_TYPE=chroma              # or postgresql (with pgvector)
EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
```

### Frontend (.env.local)
```
VITE_API_URL=http://localhost:5000
```

### Docker Environment
```
# In docker-compose.yml:
VITE_API_URL=http://backend:5000    # Inside Docker network
```

## Success Criteria

- ✅ Users can submit claims via web UI
- ✅ System decomposes claims into sub-claims
- ✅ AI service searches web, extracts evidence
- ✅ Verdicts are generated with confidence scores
- ✅ Full source citations included in reports
- ✅ Deployable on AWS EC2 via Docker
- ✅ Comprehensive API documentation
- ✅ Test coverage > 80%

## Challenges & Mitigations

| Challenge | Mitigation |
|-----------|-----------|
| LLM cost | Free tier APIs, local models, usage limits |
| Web scraping blocks | Rotate user agents, use multiple providers, scraping API fallback |
| Embedding latency | Batch processing, caching, async operations |
| False positives | Hybrid retrieval (keyword + vector), credibility scoring |
| Multilingual support | Multilingual embedding models, translation API (Phase 2) |

## Next Steps
1. Execute Phase 1 Prompt 1-3: Architecture & Requirements
2. Set up project directory structure
3. Build frontend & backend stubs
4. Implement AI service core pipeline
5. Integrate PostgreSQL + pgvector
6. Dockerize all components
7. Deploy to local Docker first, then AWS
