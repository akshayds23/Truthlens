from pydantic_settings import BaseSettings
from functools import lru_cache
import logging


class Settings(BaseSettings):
    # Server
    PORT: int = 8000
    DEBUG: bool = True
    PYTHONUNBUFFERED: int = 1

    # Search APIs
    SERPER_API_KEY: str = ""
    BRAVE_SEARCH_API_KEY: str = ""
    DUCKDUCKGO_ENABLED: bool = True
    SEARCH_TIMEOUT: int = 10
    DUCKDUCKGO_RATE_LIMIT: float = 1.0

    # LLM Providers
    OPENAI_API_KEY: str = ""
    GEMINI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    GROQ_API_KEY: str = ""

    # Embeddings
    EMBEDDING_MODEL: str = "all-MiniLM-L6-v2"

    # Chroma
    CHROMA_PERSIST_DIR: str = "./chroma_data"
    CHROMA_COLLECTION: str = "truthlens"

    # API Gateway
    API_GATEWAY_URL: str = "http://localhost:3000"

    # Logging
    LOG_LEVEL: str = "INFO"

    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"


@lru_cache()
def get_settings():
    return Settings()


def setup_logging(log_level: str = "INFO"):
    logging.basicConfig(
        level=getattr(logging, log_level),
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )
    return logging.getLogger(__name__)

