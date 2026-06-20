# TruthLens AI — Production Upgrade Plan (v2)

## Cleanup Completed ✅

Deleted **43+ unnecessary files** from the project:
- 22 root markdown docs (PROMPT_*, COMPLETION_*, REFACTORING_*, etc.)
- 13 backend test/debug scripts (test-groq*.ps1, verify-db.js, check-app.js, etc.)
- 2 duplicate config files (api-package.json, api-tsconfig.json)
- Build artifacts (backend/dist, frontend/dist)
- All `__pycache__` directories
- Empty `agents/` directory

**Clean project structure now:**
```
truthlens/
├── .env / .env.example
├── ARCHITECTURE.md / context.md
├── docker-compose.yml / entrypoint.sh
├── start-local.bat / start-local.ps1
├── backend/
│   ├── ai/          # Python FastAPI AI service
│   ├── api/         # Express.js API gateway
│   ├── migrations/  # SQL schemas
│   ├── package.json / requirements.txt
│   └── Dockerfile
└── frontend/
    ├── src/         # React 18 + TypeScript
    ├── package.json / vite.config.ts
    └── Dockerfile
```

---

## Root Cause Analysis: Why Accuracy is Low

| # | Bug | File | Line | Impact |
|---|-----|------|------|--------|
| 1 | **Evidence truncated to 200 chars** in verdict prompt | `verdict.py` | 174 | LLM gets 1-2 sentences max — impossible to reason |
| 2 | **Naive stance classification**: relevance > 0.7 = supporting, else contradicting | `orchestration.py` | 397 | Vector similarity ≠ stance. Contradicting evidence often has HIGH similarity |
| 3 | **Fake BM25**: just counts term matches, no IDF weighting | `retrieval.py` | 43-57 | Common words dominate, specific terms ignored |
| 4 | **Only 9 domains** in credibility list | `retrieval.py` | 64-74 | 99.9% of sources score 0.5 (useless) |
| 5 | **trafilatura fails on JS-rendered pages** — many modern sites return empty content | `extract.py` | 78-86 | Missing evidence from major sources (news sites, fact-checkers) |
| 6 | **Search queries too generic**: just appends "fact check" to claim | `orchestration.py` | 243 | Low recall — misses targeted evidence |
| 7 | **Groq `responses.create()` API** — wrong OpenAI API method | `llm_client.py` | 491 | May fail or produce worse results with Groq |

---

## Open Questions

> [!IMPORTANT]
> 1. **Which LLM for free tier?** Gemini 2.0 Flash has a generous free tier (15 RPM, 1M tokens/day). Do you have a **Gemini API key**? If not, we'll use your existing Groq key as default.
> 2. **Deployment target?** Vercel (frontend) + Railway/Render (backend) is free and easy. Or do you want Docker/EC2?
> 3. **Domain?** Do you have one, or use something like `truthlens.vercel.app`?

> [!WARNING]
> **Security**: Your Groq API key (`gsk_5x0M4F5PDf...`) is exposed on line 61 of `.env` as a raw string (not assigned to any variable). This must be fixed before public deployment.

---

## Phase 1: Playwright Web Scraping (High Impact)

**Why Playwright over trafilatura/BeautifulSoup alone?**
- Modern news sites (CNN, BBC, NYT) render content via JavaScript — trafilatura gets empty HTML
- Fact-checking sites (Snopes, PolitiFact) use heavy JS rendering
- Playwright renders the full page in headless Chromium, then we extract from the rendered DOM
- Anti-bot protection bypass with `playwright-stealth`

### Architecture: 3-Tier Extraction with Smart Fallback

```
URL arrives
  │
  ├─ Is it a PDF?  → pdfplumber (existing, keep)
  │
  ├─ Try trafilatura first (fast, no browser needed)
  │   ├─ Got >200 chars of clean content? → ✅ Done
  │   └─ Failed or insufficient? → Fall through
  │
  ├─ Try Playwright (headless Chromium)
  │   ├─ Launch browser context (pooled, not per-URL)
  │   ├─ Navigate with stealth (anti-detection)
  │   ├─ Wait for networkidle (JS fully rendered)
  │   ├─ Block images/CSS/fonts (speed optimization)
  │   ├─ Extract rendered HTML → parse with BeautifulSoup
  │   ├─ Got >200 chars? → ✅ Done
  │   └─ Failed? → Fall through
  │
  └─ Fallback: BeautifulSoup on raw HTML (existing, keep)
```

---

#### [MODIFY] [requirements.txt](file:///d:/Truthlens/backend/requirements.txt)

Add Playwright and stealth dependencies:
```diff
+playwright==1.49.1
+playwright-stealth==1.0.6
+rank-bm25==0.2.2
```

After install: `playwright install chromium` to download the browser binary.

#### [MODIFY] [extract.py](file:///d:/Truthlens/backend/ai/services/extract.py)

Major rewrite of the `ContentExtractor` class:

1. **Add `PlaywrightExtractor` class** with:
   - Browser context pooling (reuse browser instance across extractions)
   - `playwright-stealth` integration for anti-bot evasion
   - Resource blocking (images, CSS, fonts, media) for speed
   - `wait_until="networkidle"` for JS-rendered content
   - Smart timeout handling (15s per page)
   - Proper async cleanup

2. **Modify `extract_from_url()`** to use 3-tier fallback:
   - Try trafilatura first (fastest, ~200ms)
   - If fails, try Playwright (slower, ~3-5s, but gets JS content)
   - If fails, try raw BeautifulSoup (last resort)

3. **Add `extract_from_urls()` batch optimization**:
   - Single browser instance for all URLs in a batch
   - Parallel page contexts (up to 4 concurrent tabs)
   - Close browser after batch completes

4. **Add extraction quality scoring**:
   - Word count, paragraph count, content-to-boilerplate ratio
   - Skip pages with very low quality scores

---

## Phase 2: Accuracy Overhaul (AI Pipeline)

Every single stage of the pipeline gets improved.

---

#### [MODIFY] [verdict.py](file:///d:/Truthlens/backend/ai/services/verdict.py)

**Critical fix — evidence truncation:**
```diff
- text = evidence.get('text', '')[:200]  # Limit length
+ text = evidence.get('text', '')[:800]  # Provide enough context for reasoning
```

**Better verdict prompt (chain-of-thought):**
- Replace the current single-shot prompt with a structured chain-of-thought prompt
- Ask the LLM to: (1) identify key factual assertions, (2) evaluate each against evidence, (3) classify evidence stance, (4) synthesize a verdict
- Remove the arbitrary supporting/contradicting split — let the LLM do stance classification
- Include source URLs in the evidence so the LLM can reference them
- Add explicit instruction to cite ONLY from provided evidence (no hallucination)

**Grounded citations fix:**
- Current `_ground_citations()` is good but evidence text is too short to be useful
- Expand citation excerpts to 600 chars

#### [MODIFY] [orchestration.py](file:///d:/Truthlens/backend/ai/services/orchestration.py)

**Remove broken stance classification:**
```diff
- # Simple heuristic: if relevance > 0.7, it's supporting
- if evidence.relevance_score > 0.7:
-     supporting_evidence.append(...)
- else:
-     contradicting_evidence.append(...)
+ # Pass ALL evidence to verdict LLM — let it classify stance
+ all_evidence.append({
+     'text': evidence.text,
+     'source': evidence.source_id,
+     'relevance': evidence.relevance_score
+ })
```

**Better search query generation:**
- Use LLM to generate 3 types of queries per sub-claim:
  1. Neutral/informational query
  2. Query seeking supporting evidence
  3. Query seeking contradicting evidence
- Add claim-type-specific query templates (statistical → "data statistics", medical → "clinical study research")

**Increase evidence limits:**
```diff
  "standard": {
-     "num_searches": 5,
-     "top_k_evidence": 5,
-     "max_urls": 20,
+     "num_searches": 8,
+     "top_k_evidence": 8,
+     "max_urls": 25,
      "batch_size": 5,
-     "target_sources": 5,
+     "target_sources": 8,
```

#### [MODIFY] [retrieval.py](file:///d:/Truthlens/backend/ai/services/retrieval.py)

**Replace naive BM25 with real BM25:**
```diff
+ from rank_bm25 import BM25Okapi
+ import re

  class BM25Ranker:
-     @staticmethod
-     def rank_by_keywords(query, documents):
-         query_terms = set(query.lower().split())
-         # ... naive term counting
+     def rank_by_keywords(self, query, documents):
+         tokenized_docs = [self._tokenize(d['text']) for d in documents]
+         bm25 = BM25Okapi(tokenized_docs)
+         query_tokens = self._tokenize(query)
+         scores = bm25.get_scores(query_tokens)
+         # Normalize to 0-1
+         max_score = max(scores) if max(scores) > 0 else 1
+         return {d['id']: s / max_score for d, s in zip(documents, scores)}
```

**Expand credibility scoring to 100+ domains:**
- Major news wire services (AP, Reuters, AFP)
- Top fact-checkers (Snopes, PolitiFact, FactCheck.org, Full Fact, etc.)
- Academic publishers (Nature, Science, Lancet, PNAS, etc.)
- Government sources (.gov, .gov.uk, WHO, CDC, FDA, etc.)
- Major newspapers with known editorial standards
- Known low-credibility domains (tabloids, known misinformation) → score 0.2
- Add domain freshness bonus (recent articles score higher for current events)

#### [MODIFY] [decompose.py](file:///d:/Truthlens/backend/ai/services/decompose.py)

- Improve decomposition prompt to produce more **specific, verifiable** sub-claims
- Add claim type classification (statistical, historical, scientific, political, medical)
- Return claim type so search queries can be tailored

#### [MODIFY] [llm_client.py](file:///d:/Truthlens/backend/ai/utils/llm_client.py)

**Fix Groq API call:**
```diff
- response = await client.responses.create(
-     model=self.model,
-     input=self._messages_to_input(messages),
- )
- return response.output_text
+ response = await client.chat.completions.create(
+     model=self.model,
+     messages=messages,
+     temperature=temperature,
+     max_tokens=max_tokens,
+ )
+ return response.choices[0].message.content
```

**Add retry logic:**
- Exponential backoff with 3 retries
- Auto-retry on malformed JSON responses
- Timeout increase from 30s → 60s for complex queries

**Add Gemini as free default:**
- Add `groq/compound-mini` and `groq/compound` model detection
- Make Gemini 2.0 Flash the primary free model

#### [NEW] [claim_cache.py](file:///d:/Truthlens/backend/ai/services/claim_cache.py)

In-memory LRU cache for fact-check results:
- Key: normalized claim text (lowercase, stripped, stop words removed)
- Value: full report
- TTL: 24 hours
- Max entries: 1000
- Semantic similarity check: if a new claim is >0.92 similar to a cached claim, return cached result

---

## Phase 3: Remove Login & Go Public

---

#### [MODIFY] [App.tsx](file:///d:/Truthlens/frontend/src/App.tsx)

- Remove `ProtectedRoute` wrapper from claim submission and results
- Make `/` (submit), `/progress/:id`, `/results/:id` public
- Keep `/history`, `/settings` behind auth (optional login)
- Add `/report/:id` as public shareable route

#### [MODIFY] [fact_check.py](file:///d:/Truthlens/backend/ai/routers/fact_check.py)

- Add a `/public/fact-check` endpoint (no JWT required)
- Add IP-based rate limiting (5 checks/hour per IP)
- Return a shareable `report_id` in the response

#### [MODIFY] [api.ts](file:///d:/Truthlens/frontend/src/services/api.ts)

- Add public API client methods that don't require auth token
- Handle both authenticated and anonymous flows

#### [MODIFY] [.env](file:///d:/Truthlens/.env)

- Remove the exposed Groq API key from line 61
- Set proper placeholder values for all keys

#### [NEW] [rate_limiter.py](file:///d:/Truthlens/backend/ai/utils/rate_limiter.py)

- Simple in-memory rate limiter using sliding window
- Per-IP: 5 fact-checks/hour for anonymous users
- Per-user: 20 fact-checks/hour for authenticated users
- Returns `429 Too Many Requests` with retry-after header

---

## Phase 4: Premium Frontend Redesign

---

#### [NEW] LandingPage.tsx

Premium landing page with:
- Hero section with animated gradient background
- "Check any claim" search bar prominently centered
- How-it-works 3-step visual (Decompose → Research → Verdict)
- Example claims with pre-loaded results
- Stats counter (claims checked, sources analyzed)
- Trust indicators (open source, no data stored, citation-backed)

#### [MODIFY] [SubmitClaim.tsx](file:///d:/Truthlens/frontend/src/pages/SubmitClaim.tsx)

- Single-field "search bar" UX (category auto-detected)
- Default to Gemini Flash (free) — provider hidden behind "Advanced"
- Remove API key input from default view
- Example claims as clickable suggestions below the input
- Animated submit with morphing to progress view

#### [MODIFY] [Results.tsx](file:///d:/Truthlens/frontend/src/pages/Results.tsx)

- Glassmorphism cards with backdrop blur
- Animated circular confidence gauge
- Color-coded verdict badge (green/yellow/red gradient)
- Evidence cards with source favicons and domain trust badges
- "Share Result" button → copies shareable URL
- Timeline of what the AI did (searched X sources, analyzed Y chunks)
- Mobile-responsive grid layout

#### [MODIFY] [Progress.tsx](file:///d:/Truthlens/frontend/src/pages/Progress.tsx)

- Step-by-step animated pipeline (7 stages with icons)
- Real-time log messages ("Searching DuckDuckGo... Found 12 results")
- Estimated time remaining
- Animated progress bar with pulse effect

#### [MODIFY] [index.css](file:///d:/Truthlens/frontend/src/index.css)

Complete design system:
- Dark mode by default with sleek color palette
- CSS variables for theming
- Glassmorphism utility classes
- Animated gradients for backgrounds
- Google Fonts: Inter (body) + JetBrains Mono (data/code)
- Custom verdict color system (not just red/green)
- Micro-animations on all interactive elements
- Print-optimized styles for report export

---

## Phase 5: SEO, Social & Deployment

---

#### [MODIFY] [index.html](file:///d:/Truthlens/frontend/index.html)

```html
<!-- Open Graph -->
<meta property="og:title" content="TruthLens AI — Free Fact Checker" />
<meta property="og:description" content="AI-powered fact-checking with real sources and citations" />
<meta property="og:image" content="/og-image.png" />
<meta property="og:type" content="website" />

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="TruthLens AI" />

<!-- Structured Data for Google -->
<script type="application/ld+json">
{ "@context": "https://schema.org", "@type": "WebApplication", ... }
</script>
```

#### Deployment Options

| Option | Frontend | Backend | Cost |
|--------|----------|---------|------|
| **Recommended** | Vercel (free) | Railway (free tier: 500h/mo) | $0 |
| Alternative | Netlify (free) | Render (free tier) | $0 |
| Full control | AWS S3 + CloudFront | AWS EC2 t3.micro | ~$10/mo |

> [!NOTE]
> Playwright needs ~500MB for the Chromium binary. Railway/Render free tiers handle this. Vercel serverless functions do NOT — the backend must be a persistent server.

---

## Execution Order

```
Phase 1 (Playwright Scraping)     ← Biggest extraction win
    ↓
Phase 2 (Accuracy Fixes)          ← Biggest verdict quality win
    ↓
Phase 3 (Remove Login + Security) ← Makes it publicly accessible
    ↓
Phase 4 (Frontend Redesign)       ← Makes it LinkedIn-worthy
    ↓
Phase 5 (SEO + Deploy)            ← Makes it live
```

**Estimated effort**: ~6-8 hours total across all phases.

---

## Verification Plan

### Automated Testing
1. **Extraction test**: Run Playwright extractor on 5 JS-heavy sites (CNN, Snopes, PolitiFact, BBC, NYT) → verify >500 chars extracted from each
2. **Accuracy test**: Fact-check 10 claims with known verdicts:
   - "The Earth is flat" → FALSE
   - "Water boils at 100°C at sea level" → TRUE
   - "Vaccines cause autism" → FALSE
   - "Climate change is entirely driven by solar cycles" → FALSE
   - "Humans share 98% of DNA with chimpanzees" → MOSTLY_TRUE
3. **API test**: Public fact-check endpoint → verify response format, rate limiting
4. **Build test**: `npm run build` succeeds, Python service starts

### Manual Verification
1. Submit 3 diverse claims end-to-end and review verdict quality
2. Test share URL → verify it loads without login
3. Screenshot for LinkedIn post preview
4. Mobile viewport test

