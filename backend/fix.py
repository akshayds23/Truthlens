import os

with open('ai/utils/search_providers.py', 'r') as f:
    lines = f.readlines()
    
idx = -1
for i, line in enumerate(lines):
    if 'except httpx.HTTPStatusError as e:' in line:
        idx = i
        break

content_to_keep = ''.join(lines[:idx])

rest = '''        except httpx.HTTPStatusError as e:
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
        if requested_providers:
            available = [
                p for p in requested_providers
                if p in self.providers and self.providers[p].is_available()
            ]
        else:
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
        if requested_providers:
            provider_chain = requested_providers
        else:
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
                import asyncio
                results = await asyncio.wait_for(
                    provider.search(query, num_results),
                    timeout=self.timeout
                )

                for result in results:
                    if result.url not in seen_urls:
                        all_results.append(result)
                        seen_urls.add(result.url)

                if all_results:
                    providers_used.append(provider_name)
                    if len(all_results) >= num_results:
                        break

            except asyncio.TimeoutError:
                logger.warning(f"{provider_name} search timed out")
                continue
            except Exception as e:
                logger.error(f"Error searching with {provider_name}: {str(e)}")
                continue

        all_results = self._rank_results(all_results, providers_used)
        return all_results[:num_results], providers_used

    def _rank_results(
        self,
        results: List[SearchResult],
        providers_used: List[str]
    ) -> List[SearchResult]:
        provider_scores = {
            "brave": 3,
            "serper": 2,
            "wikipedia": 1.5,
            "duckduckgo": 1
        }
        for result in results:
            provider_score = provider_scores.get(result.provider, 0)
            result.relevance = (provider_score / 3.0) * 0.8 + 0.2
        return sorted(results, key=lambda r: r.relevance, reverse=True)
'''

with open('ai/utils/search_providers.py', 'w') as f:
    f.write(content_to_keep + rest)
