"""Search service orchestration for multiple providers"""

import logging
from typing import List, Optional
from ai.config.settings import get_settings
from ai.utils.search_providers import ProviderPool, SearchResult as ProviderSearchResult
from ai.models.schemas import SearchResult, SearchResponse

logger = logging.getLogger(__name__)


class SearchService:
    """Orchestrates search across multiple providers with fallback"""

    def __init__(self):
        settings = get_settings()
        self.provider_pool = ProviderPool(
            brave_key=settings.BRAVE_SEARCH_API_KEY,
            serper_key=settings.SERPER_API_KEY,
            timeout=settings.SEARCH_TIMEOUT
        )
        self.settings = settings

    async def search(
        self,
        query: str,
        num_results: int = 5,
        providers: Optional[List[str]] = None
    ) -> SearchResponse:
        """
        Execute a multi-provider search with intelligent fallback
        
        Args:
            query: Search query string
            num_results: Number of results to return (5-20)
            providers: Specific providers to use (None = use fallback chain)
            
        Returns:
            SearchResponse with results and metadata
            
        Raises:
            ValueError: If query validation fails
        """
        # Validate query
        self._validate_query(query, num_results)

        # Validate providers if specified
        if providers:
            self._validate_providers(providers)

        logger.info(f"Search service: query='{query}', num_results={num_results}, providers={providers}")

        # Execute search with fallback
        results, providers_used = await self.provider_pool.search_with_fallback(
            query=query,
            num_results=num_results,
            requested_providers=providers
        )

        # Convert to response schema
        response_results = [
            SearchResult(
                url=r.url,
                title=r.title,
                snippet=r.snippet,
                provider=r.provider,
                relevance=r.relevance,
                rank=r.rank
            )
            for r in results
        ]

        return SearchResponse(
            query=query,
            results=response_results,
            total_results=len(response_results),
            providers_used=providers_used
        )

    def _validate_query(self, query: str, num_results: int) -> None:
        """
        Validate search query and parameters
        
        Args:
            query: Search query to validate
            num_results: Number of results to validate
            
        Raises:
            ValueError: If validation fails
        """
        if not query or len(query.strip()) < 3:
            raise ValueError("Query must be at least 3 characters long")

        if len(query) > 200:
            raise ValueError("Query must be no longer than 200 characters")

        if not isinstance(num_results, int) or num_results < 1 or num_results > 20:
            raise ValueError("num_results must be between 1 and 20")

    def _validate_providers(self, providers: List[str]) -> None:
        """
        Validate provider names
        
        Args:
            providers: List of provider names to validate
            
        Raises:
            ValueError: If any provider is invalid
        """
        valid_providers = {"duckduckgo", "brave", "serper", "wikipedia"}

        for provider in providers:
            if provider not in valid_providers:
                raise ValueError(f"Invalid provider: {provider}. Must be one of {valid_providers}")

        if not providers:
            raise ValueError("At least one provider must be specified")


# Singleton instance
_search_service: Optional[SearchService] = None


def get_search_service() -> SearchService:
    """Get or create search service singleton"""
    global _search_service
    if _search_service is None:
        _search_service = SearchService()
    return _search_service
