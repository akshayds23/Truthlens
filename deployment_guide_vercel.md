# TruthLens Vercel Deployment Guide (Single Project Monorepo)

This guide provides step-by-step instructions for deploying both the React/Vite frontend and the Node.js/Express serverless backend under a **single Vercel project**.

---

## 📋 Prerequisites

Before starting, ensure you have access to:
1. **GitHub/GitLab/Bitbucket account** where the project is pushed.
2. **Vercel account** (Hobby or Pro tier).
3. **Neon PostgreSQL Database** (Your database is already initialized and tables are migrated!).
4. **Google Gemini API Key** (or Groq API Key).
5. **Serper API Key** (for search engines).

---

## 🚀 Step 1: Push Your Code to GitHub

Make sure your repository has the following files at the root level:
- `vercel.json` (defines routing and builds)
- `frontend/` (contains package.json, src/, vite.config.ts)
- `backend/` (contains package.json, api/, migrations/)

---

## 📦 Step 2: Import Project in Vercel

1. Go to your [Vercel Dashboard](https://vercel.com/dashboard) and click **Add New** ➔ **Project**.
2. Import the Git repository containing your **TruthLens** monorepo.
3. On the **Configure Project** screen:
   - **Project Name**: `truthlens` (or any custom name)
   - **Framework Preset**: Vercel will automatically detect the root-level `vercel.json` and set the Framework Preset to **Services** (if not, select **Services**).
   - **Root Directory**: Leave it as the **Root of the repository** (do **not** select `frontend` or `backend`).

---

## 🔑 Step 3: Configure Environment Variables

Scroll down to the **Environment Variables** section in the Vercel project configuration and add the following keys:

| Key | Value | Description |
|---|---|---|
| `DATABASE_URL` | `your-database-url-here` | Your Neon PostgreSQL connection string (SSL mode required) |
| `JWT_SECRET` | `generate-a-long-random-string-here` | Secret key for signing JSON Web Tokens |
| `GEMINI_API_KEY` | `your-gemini-api-key-here` | Google Gemini API key for embeddings and fallback LLM |
| `SERPER_API_KEY` | `your-serper-api-key-here` | Serper API key for Google Search results |
| `GROQ_API_KEY` | `your-groq-api-key-here` | Groq API key for verdict generation LLM |
| `NODE_ENV` | `production` | Set to `production` |
| `VERCEL` | `1` | **CRITICAL:** Bypasses background queues so orchestrations run synchronously in the serverless function |

> [!IMPORTANT]
> Make sure `VERCEL` is set to `1`. This instructs the backend service to run the fact-checking orchestrator synchronously inside the HTTP response stream. If this is missing, Vercel will attempt to run it in the background after the response is completed, which Vercel kills instantly.

---

## ⚡ Step 4: Deploy

1. Click **Deploy**.
2. Vercel will read the root `vercel.json` and build each service independently (the frontend via Vite, and the backend Node.js Express serverless API).
3. Once completed, Vercel will generate a domain like `truthlens.vercel.app`.

---

## 🔄 How Routing Works Under a Single Domain

Because we are deploying under a single project, Vercel routes incoming requests as follows:
- **`https://your-domain.vercel.app/api/*`** ➔ Routed to the Express.js Serverless function (`backend/api/app.ts`).
- **`https://your-domain.vercel.app/*`** ➔ Routed to the static Vite frontend files.

This means:
1. **Zero CORS Issues**: The frontend and backend share the exact same domain, protocol, and port.
2. **Simplified URLs**: The frontend uses relative paths (e.g. `/api/claims`) to call the backend, making it environment-agnostic.
