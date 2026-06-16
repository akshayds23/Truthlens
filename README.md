# TruthLens

**TruthLens** is an advanced, open-source AI fact-checking platform. It leverages multiple LLMs, web scraping, and vector embeddings to autonomously research, decompose, and verify claims in real time.

![TruthLens Architecture](https://img.shields.io/badge/Architecture-React%20%7C%20Node.js%20%7C%20FastAPI-blue)
![License](https://img.shields.io/badge/License-MIT-green)

---

## 🌟 Key Features

- **Automated Claim Decomposition**: Breaks down complex statements into verifiable sub-claims.
- **Deep Web Research**: Autonomously searches the web using Serper, Brave, DuckDuckGo, or Wikipedia as a fallback.
- **AI-Powered Fact-Checking**: Uses LLMs (Groq, OpenAI, Anthropic, or Local models) to process retrieved evidence.
- **Semantic Vector Search**: Implements local vector store (InMemoryVectorStore / Chroma) for evidence retrieval without requiring complex C++ build chains.
- **Public & Open**: No authentication required! Fully open to guest submissions, allowing anonymous public fact-checking.

## 🏗️ Architecture

TruthLens runs on a distributed microservice architecture:
1. **Frontend**: React (Vite) + TailwindCSS for a beautiful, responsive, real-time UI.
2. **API Gateway**: Node.js + Express handling routing, historical database queries, and rate-limiting.
3. **AI Service**: Python + FastAPI handling orchestration, embedding, web scraping (Playwright/Trafilatura), and LLM execution.
4. **Database**: PostgreSQL for storing claims, users, sources, and reports.

---

## 🚀 Quickstart Guide

### Prerequisites
- Node.js (v18+)
- Python 3.11+
- PostgreSQL database (Local or Cloud like Neon/Railway)

### 1. Database Setup
Ensure you have a PostgreSQL database running. TruthLens uses `schema.sql` to initialize tables automatically via the Express API gateway startup script.

### 2. Environment Variables
You need to configure the backend environment. Navigate to the `backend` folder and create/edit your `.env` file based on `.env.example`.

**Crucial API Keys:**
Because TruthLens is a bring-your-own-keys platform, you need to provide your API keys to power the backend:
```env
# Database
DATABASE_URL=postgresql://user:password@host/database

# LLM Providers (Provide at least one)
OPENAI_API_KEY=your_openai_key
GROQ_API_KEY=your_groq_key
ANTHROPIC_API_KEY=your_anthropic_key

# Search Providers (Recommended to avoid DuckDuckGo rate-limits)
SERPER_API_KEY=your_serper_key
```

### 3. Install & Run

TruthLens includes a convenient PowerShell script to start all services simultaneously.

1. Install backend Python dependencies:
```bash
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
playwright install chromium
```

2. Install Node dependencies:
```bash
# In backend
npm install

# In frontend
cd ../frontend
npm install
```

3. Launch the platform! From the root directory:
```powershell
.\start-local.ps1
```

This script will boot:
- The Python FastAPI AI Orchestrator on `:8000`
- The Node.js API Gateway on `:5000`
- The React Frontend on `:5173` / `:5174`

---

## 🛠️ Research Modes

TruthLens allows you to scale the depth of your research:
- **Quick**: 3 searches, 5 max URLs, very fast.
- **Standard**: 5 searches, 10 max URLs, balanced.
- **Deep**: 8 searches, 18 max URLs, thorough web extraction (optimized to run in under 2 minutes).

## 🌍 Recent Updates (June 2026)
- **Public Fact-Checking**: Stripped out mandatory login and JWT requirements. Anyone can submit claims anonymously.
- **Wikipedia Fallback**: Added a robust Wikipedia Search API provider for when DuckDuckGo rate-limits local IP addresses.
- **Optimized Depth Settings**: Drastically scaled down "Deep" mode to preserve API credits and reduce latency while maintaining high accuracy.

---

## License
MIT License. Feel free to fork, modify, and deploy!

