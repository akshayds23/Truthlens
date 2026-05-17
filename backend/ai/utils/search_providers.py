"""Search provider implementations for multiple free/open-source providers"""

import asyncio
import logging
import httpx
from abc import ABC, abstractmethod
from typing import List, Optional, Dict, Any
from dataclasses import dataclass
import time
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)


def _has_real_api_key(value: Optional[str]) -> bool:
    """Treat common placeholder values as unavailable credentials."""
    if not value:
        return False

    normalized = value.strip()
    if not normalized:
        return False

    placeholders = {
        "your-key-here",
        "sk-your-key-here",
        "sk-ant-your-key-here",
        "your-brave-key-here",
        "your-serper-key-here",
    }
    return normalized not in placeholders


@dataclass
class SearchResult:
    """Unified search result structure"""
    url: str
    title: str
    snippet: str
    provider: str
    relevance: float = 1.0
    rank: int = 0


class SearchProvider(ABC):
    """Abstract base class for search providers"""

    @abstractmethod
    async def search(self, query: str, num_results: int) -> List[SearchResult]:
        """
        Search for query using this provider
        
        Args:
            query: Search query
            num_results: Number of results to return
            
        Returns:
            List of SearchResult objects
        """
        pass

    @abstractmethod
    def is_available(self) -> bool:
        """
        Check if provider has valid credentials/configuration
        
        Returns:
            True if provider is available, False otherwise
        """
        pass


class DuckDuckGoProvider(SearchProvider):
    """DuckDuckGo search provider - free, no authentication needed"""

    def __init__(self):
        self.name = "duckduckgo"
        self.last_request_time = 0
        self.rate_limit_delay = 1.0  # 1 request per second

    def is_available(self) -> bool:
        """DuckDuckGo is always available"""
        return True

    async def search(self, query: str, num_results: int) -> List[SearchResult]:
        """
        Search using DuckDuckGo via duckduckgo_search library
        
        Args:
            query: Search query
            num_results: Number of results to return (max 20)
            
        Returns:
            List of SearchResult objects
        """
        try:
            # Rate limiting
            elapsed = time.time() - self.last_request_time
            if elapsed < self.rate_limit_delay:
                await asyncio.sleep(self.rate_limit_delay - elapsed)
            
            self.last_request_time = time.time()
            
            # Run in executor to avoid blocking
            loop = asyncio.get_event_loop()
            results = await loop.run_in_executor(
                None,
                self._sync_search,
                query,
                num_results
            )
            
            logger.info(f"DuckDuckGo: Found {len(results)} results for '{query}'")
            return results
            
        except Exception as e:
            logger.error(f"DuckDuckGo search failed: {str(e)}")
            return []

    def _sync_search(self, query: str, num_results: int) -> List[SearchResult]:
        """Synchronous wrapper for duckduckgo_search"""
        results = self._search_with_ddgs(query, num_results)
        if results:
            return results

        logger.info("DuckDuckGo package returned no results, using HTML fallback")
        return self._search_with_html(query, num_results)

    def _search_with_ddgs(self, query: str, num_results: int) -> List[SearchResult]:
        try:
            try:
                from duckduckgo_search import DDGS
            except ImportError:
                from ddgs import DDGS
            
            results = []
            with DDGS() as ddgs:
                result_list = list(ddgs.text(query, max_results=num_results))
                
                for i, result in enumerate(result_list[:num_results]):
                    results.append(SearchResult(
                        url=result.get("href", "") or result.get("url", ""),
                        title=result.get("title", ""),
                        snippet=result.get("body", "") or result.get("snippet", ""),
                        provider=self.name,
                        relevance=1.0 - (i * 0.05),  # Rank-based relevance
                        rank=i + 1
                    ))
            
            return results
            
        except ImportError:
            logger.error("duckduckgo-search library not installed")
            return []
        except Exception as e:
            logger.error(f"DuckDuckGo sync search error: {str(e)}")
            return []

    def _search_with_html(self, query: str, num_results: int) -> List[SearchResult]:
        """Fallback scraper for DuckDuckGo's HTML results page."""
        try:
            response = httpx.post(
                "https://html.duckduckgo.com/html/",
                data={"q": query},
                headers={"User-Agent": "Mozilla/5.0"},
                timeout=15.0,
                follow_redirects=True,
            )
            response.raise_for_status()

            soup = BeautifulSoup(response.text, "html.parser")
            results = []

            for i, link in enumerate(soup.select("a.result__a")[:num_results]):
                href = link.get("href", "").strip()
                title = link.get_text(" ", strip=True)
                container = link.find_parent(class_="result")
                snippet_node = container.select_one(".result__snippet") if container else None
                snippet = snippet_node.get_text(" ", strip=True) if snippet_node else ""

                if not href:
                    continue

                results.append(SearchResult(
                    url=href,
                    title=title,
                    snippet=snippet,
                    provider=self.name,
                    relevance=1.0 - (i * 0.05),
                    rank=i + 1
                ))

            return results
        except Exception as e:
            logger.error(f"DuckDuckGo HTML fallback error: {str(e)}")
            return []


class BraveSearchProvider(SearchProvider):
    """Brave Search provider - free tier with API key"""

    def __init__(self, api_key: Optional[str] = None):
        self.name = "brave"
        self.api_key = api_key
        self.base_url = "https://api.search.brave.com/res/v1/web/search"
        self.last_request_time = 0
        self.rate_limit_delay = 0.1  # Less strict rate limiting

    def is_available(self) -> bool:
        """Check if API key is configured"""
        return _has_real_api_key(self.api_key)

    async def search(self, query: str, num_results: int) -> List[SearchResult]:
        """
        Search using Brave Search API
        
        Args:
            query: Search query
            num_results: Number of results to return
            
        Returns:
            List of SearchResult objects
        """
        if not self.is_available():
            logger.warning("Brave Search API key not configured")
            return []

        try:
            # Rate limiting
            elapsed = time.time() - self.last_request_time
            if elapsed < self.rate_limit_delay:
                await asyncio.sleep(self.rate_limit_delay - elapsed)
            
            self.last_request_time = time.time()
            
            headers = {
                "Authorization": f"Token {self.api_key}",
                "Accept": "application/json"
            }
            
            params = {
                "q": query,
                "count": min(num_results, 20)
            }
            
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.get(
                    self.base_url,
                    headers=headers,
                    params=params
                )
                response.raise_for_status()
                data = response.json()
            
            results = []
            for i, result in enumerate(data.get("web", [])):
                results.append(SearchResult(
                    url=result.get("url", ""),
                    title=result.get("title", ""),
                    snippet=result.get("description", ""),
                    provider=self.name,
                    relevance=1.0 - (i * 0.05),
                    rank=i + 1
                ))
            
            logger.info(f"Brave Search: Found {len(results)} results for '{query}'")
            return results
            
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429:
                logger.warning("Brave Search: Rate limit exceeded")
            elif e.response.status_code == 401:
                logger.error("Brave Search: Invalid API key")
            else:
                logger.error(f"Brave Search API error: {e.response.status_code}")
            return []
        except Exception as e:
            logger.error(f"Brave Search failed: {str(e)}")
            return []


class SerperSearchProvider(SearchProvider):
    """Serper search provider - free tier with API key"""

    def __init__(self, api_key: Optional[str] = None):
        self.name = "serper"
        self.api_key = api_key
        self.base_url = "https://google.serper.dev/search"
        self.last_request_time = 0
        self.rate_limit_delay = 0.1

    def is_available(self) -> bool:
        """Check if API key is configured"""
        return _has_real_api_key(self.api_key)

    async def search(self, query: str, num_results: int) -> List[SearchResult]:
        """
        Search using Serper API (Google search)
        
        Args:
            query: Search query
            num_results: Number of results to return
            
        Returns:
            List of SearchResult objects
        """
        if not self.is_available():
            logger.warning("Serper API key not configured")
            return []

        try:
            # Rate limiting
            elapsed = time.time() - self.last_request_time
            if elapsed < self.rate_limit_delay:
                await asyncio.sleep(self.rate_limit_delay - elapsed)
            
            self.last_request_time = time.time()
            
            headers = {
                "X-API-KEY": self.api_key,
                "Content-Type": "application/json"
            }
            
            payload = {
                "q": query,
                "num": min(num_results, 20)
            }
            
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.post(
                    self.base_url,
                    headers=headers,
                    json=payload
                )
                response.raise_for_status()
                data = response.json()
            
            results = []
            for i, result in enumerate(data.get("organic", [])):
                results.append(SearchResult(
                    url=result.get("link", ""),
                    title=result.get("title", ""),
                    snippet=result.get("snippet", ""),
                    provider=self.name,
                    relevance=1.0 - (i * 0.05),
                    rank=i + 1
                ))
            
            logger.info(f"Serper: Found {len(results)} results for '{query}'")
            return results
            
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429:
                logger.warning("Serper: Rate limit exceeded")
            elif e.response.status_code == 401:
                logger.error("Serper: Invalid API key")
            else:
                logger.error(f"Serper API error: {e.response.status_code}")
            return []
        except Exception as e:
            logger.error(f"Serper search failed: {str(e)}")
            return []

class WikipediaProvider(SearchProvider):
    """Wikipedia search provider - free, no authentication needed"""

    def __init__(self):
        self.name = "wikipedia"
        self.base_url = "https://en.wikipedia.org/w/api.php"

    def is_available(self) -> bool:
        return True

    async def search(self, query: str, num_results: int) -> List[SearchResult]:
        try:
            params = {
                "action": "query",
                "list": "search",
                "srsearch": query,
                "utf8": "",
                "format": "json",
                "srlimit": min(num_results, 20)
            }
            headers = {"User-Agent": "TruthLens/1.0 (https://github.com/truthlens)"}
            
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.get(self.base_url, params=params, headers=headers)
                response.raise_for_status()
                data = response.json()
                
            results = []
            for i, item in enumerate(data.get("query", {}).get("search", [])):
                title = item.get("title", "")
                snippet_html = item.get("snippet", "")
                
                # Clean HTML from snippet
                from bs4 import BeautifulSoup
                snippet_text = BeautifulSoup(snippet_html, "html.parser").get_text()
                
                results.append(SearchResult(
                    url=f"https://en.wikipedia.org/wiki/{title.replace(' ', '_')}",
                    title=f"{title} - Wikipedia",
                    snippet=snippet_text,
                    provider=self.name,
                    relevance=1.0 - (i * 0.05),
                    rank=i + 1
                ))
                
            logger.info(f"Wikipedia: Found {len(results)} results for '{query}'")
            return results
            
        except Exception as e:
            logger.error(f"Wikipedia search failed: {str(e)}")
            return []


class ProviderPool:
    """Manages a pool of search providers with fallback logic"""

    def __init__(
        self,
        brave_key: Optional[str] = None,
        serper_key: Optional[str] = None,
        timeout: int = 10
    ):
        self.providers = {
            "brave": BraveSearchProvider(brave_key),
            "serper": SerperSearchProvider(serper_key),
            "duckduckgo": DuckDuckGoProvider(),
            "wikipedia": WikipediaProvider()
        }
        self.timeout = timeout
        self.fallback_chain = ["brave", "serper", "wikipedia", "duckduckgo"]

    def get_available_providers(self, requested_providers: Optional[List[str]] = None) -> List[str]:
        """
        Get list of available providers
        
        Args:
            requested_providers: Specific providers to use (None = all available)
            
        Returns:
            List of available provider names
        """
        if requested_providers:
            # Filter to requested providers that are available
            available = [
                p for p in requested_providers
                if p in self.providers and self.providers[p].is_available()
            ]
        else:
            # Use fallback chain for available providers
            available = [
                p for p in self.fallback_chain
                if self.providers[p].is_available()
            ]
        
        return available

    async def search_with_fallback(
        self,
        query: str,
        num_results: int,
        requested_providers: Optional[List[str]] = None
    ) -> tuple[List[SearchResult], List[str]]:
        """
        Search using providers with fallback chain
        
        Args:
            query: Search query
            num_results: Number of results to return
            requested_providers: Specific providers to try (None = use fallback chain)
            
        Returns:
            Tuple of (results, providers_used)
        """
        if requested_providers:
            # Use requested providers in order
            provider_chain = requested_providers
        else:
            # Use fallback chain
            provider_chain = self.fallback_chain

        all_results = []
        providers_used = []
        seen_urls = set()

        for provider_name in provider_chain:
            if provider_name not in self.providers:
                logger.warning(f"Unknown provider: {provider_name}")
                continue

            provider = self.providers[provider_name]

            if not provider.is_available():
                logger.info(f"Provider {provider_name} not available")
                continue

            try:
                logger.info(f"Searching with {provider_name}...")
                results = await asyncio.wait_for(
                    provider.search(query, num_results),
                    timeout=self.timeout
                )

                # Deduplicate results
                for result in results:
                    if result.url not in seen_urls:
                        all_results.append(result)
                        seen_urls.add(result.url)

                if all_results:
                    providers_used.append(provider_name)
                    # If we have enough results, stop searching
                    if len(all_results) >= num_results:
                        break

            except asyncio.TimeoutError:
                logger.warning(f"{provider_name} search timed out")
                continue
            except Exception as e:
                logger.error(f"Error searching with {provider_name}: {str(e)}")
                continue

        # Re-rank results by provider and position
        all_results = self._rank_results(all_results, providers_used)

        return all_results[:num_results], providers_used

    def _rank_results(
        self,
        results: List[SearchResult],
        providers_used: List[str]
    ) -> List[SearchResult]:
        """
        Re-rank results by provider quality and position
        
        Args:
            results: Search results to rank
            providers_used: List of providers used in order of preference
            
        Returns:
            Sorted list of results
        """
        provider_scores = {
            "brave": 3,
            "serper": 2,
            "wikipedia": 1.5,
            "duckduckgo": 1
        }

        for result in results:
            # Provider score (higher is better)
            provider_score = provider_scores.get(result.provider, 0)
            # Adjust relevance based on provider and rank
            result.relevance = (provider_score / 3.0) * 0.8 + 0.2

        # Sort by relevance (descending)
        return sorted(results, key=lambda r: r.relevance, reverse=True)

