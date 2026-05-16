from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import logging
from ai.config.settings import get_settings, setup_logging
from ai.routers import fact_check
from ai.services.embedding import get_embedding_pipeline_async

settings = get_settings()
logger = setup_logging(settings.LOG_LEVEL)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup — pre-warm the embedding model so it's ready before first request
    logger.info("🚀 TruthLens AI Service starting...")
    logger.info(f"Debug mode: {settings.DEBUG}")
    logger.info(f"Embedding model: {settings.EMBEDDING_MODEL}")
    logger.info(f"Chroma collection: {settings.CHROMA_COLLECTION}")
    logger.info("⏳ Pre-loading embedding model...")
    await get_embedding_pipeline_async(settings.EMBEDDING_MODEL)
    logger.info("✅ Embedding model ready.")
    yield
    # Shutdown
    logger.info("🛑 TruthLens AI Service shutting down...")



app = FastAPI(
    title="TruthLens AI Service",
    description="Autonomous fact-checking and evidence research agent",
    version="0.1.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://localhost"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok", "service": "TruthLens AI Service"}


# Root endpoint
@app.get("/")
async def root():
    """API info endpoint"""
    return {
        "message": "TruthLens AI Service v0.1.0",
        "docs": "/docs",
        "health": "/health"
    }


# Include routers
app.include_router(fact_check.router, prefix="/api", tags=["fact-check"])


# Error handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    logger.error(f"HTTP Exception: {exc.detail}")
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.detail, "status_code": exc.status_code}
    )


@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    logger.error(f"Unhandled exception: {str(exc)}")
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "detail": str(exc) if settings.DEBUG else None,
            "status_code": 500
        }
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=settings.PORT,
        reload=settings.DEBUG
    )
