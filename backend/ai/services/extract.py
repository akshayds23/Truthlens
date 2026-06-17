"""Content extraction service for web pages and PDFs
3-tier extraction: trafilatura (fast) → Playwright/Chromium (JS-rendered) → BeautifulSoup (fallback)
"""

import logging
import httpx
import asyncio
from typing import Optional, List, Dict
from bs4 import BeautifulSoup
from pathlib import Path
import trafilatura

logger = logging.getLogger(__name__)

# User agent for web requests
DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
)

EXTRACTION_TIMEOUT = 20
DOWNLOAD_TIMEOUT = 12
PLAYWRIGHT_TIMEOUT = 15000  # 15 seconds per page


class PlaywrightExtractor:
    """Extracts content from JS-rendered pages using headless Chromium."""

    def __init__(self):
        self._browser = None
        self._playwright = None
        self._lock = asyncio.Lock()

    async def _ensure_browser(self):
        """Launch browser if not already running (thread-safe)."""
        if self._browser and self._browser.is_connected():
            return

        async with self._lock:
            if self._browser and self._browser.is_connected():
                return

            try:
                from playwright.async_api import async_playwright

                self._playwright = await async_playwright().start()
                self._browser = await self._playwright.chromium.launch(
                    headless=True,
                    args=[
                        "--no-sandbox",
                        "--disable-dev-shm-usage",
                        "--disable-gpu",
                        "--disable-extensions",
                        "--disable-background-networking",
                        "--disable-default-apps",
                        "--no-first-run",
                    ],
                )
                logger.info("Playwright Chromium browser launched")
            except Exception as e:
                logger.error(f"Failed to launch Playwright browser: {e}")
                self._browser = None
                raise

    async def extract(self, url: str) -> Optional[Dict]:
        """
        Extract content from a URL using headless Chromium.

        Renders JavaScript, blocks unnecessary resources for speed,
        applies stealth to avoid bot detection.
        """
        try:
            await self._ensure_browser()

            context = await self._browser.new_context(
                user_agent=DEFAULT_USER_AGENT,
                viewport={"width": 1280, "height": 720},
                java_script_enabled=True,
            )

            page = await context.new_page()

            # Apply stealth to avoid bot detection
            try:
                from playwright_stealth import stealth_async
                await stealth_async(page)
            except ImportError:
                logger.debug("playwright-stealth not available, continuing without")

            # Block images, fonts, media, CSS to speed up loading
            await page.route(
                "**/*.{png,jpg,jpeg,gif,webp,svg,ico,woff,woff2,ttf,eot,mp4,mp3,avi}",
                lambda route: route.abort(),
            )
            await page.route("**/*", self._block_tracking)

            try:
                await page.goto(
                    url,
                    wait_until="networkidle",
                    timeout=PLAYWRIGHT_TIMEOUT,
                )
            except Exception:
                # Fallback: try domcontentloaded if networkidle times out
                try:
                    await page.goto(
                        url,
                        wait_until="domcontentloaded",
                        timeout=PLAYWRIGHT_TIMEOUT,
                    )
                    await page.wait_for_timeout(2000)  # Give JS 2s extra
                except Exception as nav_err:
                    logger.warning(f"Playwright navigation failed for {url}: {nav_err}")
                    await context.close()
                    return None

            # Get rendered HTML
            html_content = await page.content()
            await context.close()

            if not html_content or len(html_content) < 200:
                return None

            # Parse rendered HTML with BeautifulSoup
            text = self._extract_article_text(html_content)
            if not text or len(text.strip()) < 100:
                return None

            title = self._extract_title(html_content, url)

            logger.info(
                f"Playwright extracted {len(text)} chars from {url}"
            )
            return {
                "text": text.strip(),
                "title": title,
                "source": url,
                "method": "playwright",
                "length": len(text),
            }

        except Exception as e:
            logger.warning(f"Playwright extraction failed for {url}: {e}")
            return None

    @staticmethod
    async def _block_tracking(route):
        """Block known tracking/analytics domains."""
        blocked_domains = [
            "google-analytics.com", "googletagmanager.com",
            "facebook.net", "doubleclick.net", "adservice.google",
            "analytics.", "tracker.", "pixel.",
        ]
        url = route.request.url
        if any(domain in url for domain in blocked_domains):
            await route.abort()
        else:
            await route.continue_()

    @staticmethod
    def _extract_article_text(html: str) -> Optional[str]:
        """Extract main article text from rendered HTML."""
        try:
            soup = BeautifulSoup(html, "html.parser")

            # Remove unwanted elements
            for tag in soup(
                ["script", "style", "nav", "footer", "aside", "meta",
                 "noscript", "header", "iframe", "form"]
            ):
                tag.decompose()

            # Remove ads, sidebars, cookie banners, social widgets
            for div in soup.find_all(
                ["div", "section", "aside"],
                class_=lambda c: c and any(
                    kw in str(c).lower()
                    for kw in [
                        "ad", "advert", "sidebar", "related", "comment",
                        "cookie", "banner", "social", "share", "newsletter",
                        "popup", "modal", "promo", "sponsor",
                    ]
                ),
            ):
                div.decompose()

            # Try to find article content in priority order
            main_content = (
                soup.find("article")
                or soup.find("main")
                or soup.find("div", class_=lambda c: c and "content" in str(c).lower())
                or soup.find("div", class_=lambda c: c and "article" in str(c).lower())
                or soup.find("body")
            )

            if not main_content:
                return None

            text = main_content.get_text(separator="\n", strip=True)

            # Clean up
            lines = [line.strip() for line in text.split("\n") if line.strip()]
            # Filter very short lines (navigation remnants)
            lines = [l for l in lines if len(l) > 20 or l.endswith((".", "!", "?", ":"))]
            return "\n".join(lines)

        except Exception as e:
            logger.error(f"BeautifulSoup parsing error: {e}")
            return None

    @staticmethod
    def _extract_title(html: str, url: str) -> str:
        """Extract page title."""
        try:
            soup = BeautifulSoup(html, "html.parser")
            title = soup.find("title")
            if title:
                return title.get_text().strip()
            og_title = soup.find("meta", property="og:title")
            if og_title and og_title.get("content"):
                return og_title["content"].strip()
            return url.split("/")[-1] or url
        except Exception:
            return url

    async def close(self):
        """Shutdown browser."""
        if self._browser:
            try:
                await self._browser.close()
            except Exception:
                pass
        if self._playwright:
            try:
                await self._playwright.stop()
            except Exception:
                pass
        self._browser = None
        self._playwright = None


class ContentExtractor:
    """
    3-tier content extractor:
    1. trafilatura (fast, no browser, works for static pages)
    2. Playwright headless Chromium (JS-rendered pages)
    3. BeautifulSoup raw HTML (last resort fallback)
    """

    def __init__(self, timeout: int = EXTRACTION_TIMEOUT):
        self.timeout = timeout
        self.client = None
        self.playwright_extractor = PlaywrightExtractor()

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create async HTTP client."""
        if self.client is None:
            self.client = httpx.AsyncClient(
                timeout=DOWNLOAD_TIMEOUT,
                headers={"User-Agent": DEFAULT_USER_AGENT},
                follow_redirects=True,
            )
        return self.client

    async def extract_from_url(self, url: str) -> Optional[dict]:
        """
        Extract clean text from a URL using 3-tier fallback:
        1. trafilatura (fast, ~200ms)
        2. Playwright Chromium (JS-rendered, ~3-5s)
        3. BeautifulSoup (raw HTML fallback)

        Returns dict with 'text', 'title', 'source', 'method', 'length'
        or None if extraction failed.
        """
        try:
            if not url.startswith(("http://", "https://")):
                logger.warning(f"Invalid URL scheme: {url}")
                return None

            logger.info(f"Extracting content from: {url}")

            # ── Tier 1: trafilatura (fast, no browser needed) ──
            result = await self._try_trafilatura(url)
            if result:
                return result

            # ── Tier 2: Playwright headless Chromium (JS pages) ──
            result = await self._try_playwright(url)
            if result:
                return result

            # ── Tier 3: BeautifulSoup raw HTML (last resort) ──
            result = await self._try_beautifulsoup(url)
            if result:
                return result

            logger.warning(f"All extraction methods failed for {url}")
            return None

        except Exception as e:
            logger.error(f"Error extracting from {url}: {e}")
            return None

    async def _try_trafilatura(self, url: str) -> Optional[dict]:
        """Tier 1: Fast extraction via trafilatura."""
        try:
            client = await self._get_client()
            response = await client.get(url, timeout=DOWNLOAD_TIMEOUT)
            response.raise_for_status()
            html_content = response.text

            try:
                text = trafilatura.extract(
                    html_content,
                    output_format="txt",
                    include_comments=False,
                )
            except Exception as e:
                logger.debug(f"trafilatura parse error for {url}: {e}")
                text = None

            if text and len(text.strip()) > 200:
                title = self._extract_title(html_content, url)
                logger.info(f"trafilatura: {len(text)} chars from {url}")
                return {
                    "text": text.strip(),
                    "title": title,
                    "source": url,
                    "method": "trafilatura",
                    "length": len(text),
                }

            # Save raw HTML for tier 3 fallback
            self._last_html = html_content
            return None

        except Exception as e:
            logger.debug(f"trafilatura fetch failed for {url}: {e}")
            self._last_html = None
            return None

    async def _try_playwright(self, url: str) -> Optional[dict]:
        """Tier 2: JS-rendered extraction via Playwright Chromium."""
        try:
            result = await asyncio.wait_for(
                self.playwright_extractor.extract(url),
                timeout=PLAYWRIGHT_TIMEOUT / 1000 + 5,  # Add 5s buffer
            )
            return result
        except asyncio.TimeoutError:
            logger.warning(f"Playwright timeout for {url}")
            return None
        except Exception as e:
            logger.debug(f"Playwright unavailable for {url}: {e}")
            return None

    async def _try_beautifulsoup(self, url: str) -> Optional[dict]:
        """Tier 3: Raw HTML parsing with BeautifulSoup."""
        try:
            html_content = getattr(self, "_last_html", None)
            if not html_content:
                client = await self._get_client()
                response = await client.get(url, timeout=DOWNLOAD_TIMEOUT)
                response.raise_for_status()
                html_content = response.text

            content = self._extract_with_beautifulsoup(html_content)
            if content and len(content.strip()) > 100:
                title = self._extract_title(html_content, url)
                logger.info(f"BeautifulSoup: {len(content)} chars from {url}")
                return {
                    "text": content.strip(),
                    "title": title,
                    "source": url,
                    "method": "beautifulsoup",
                    "length": len(content),
                }
            return None

        except Exception as e:
            logger.debug(f"BeautifulSoup failed for {url}: {e}")
            return None

    def _extract_with_beautifulsoup(self, html: str) -> Optional[str]:
        """Extract text using BeautifulSoup. Removes scripts, styles, nav, ads."""
        try:
            soup = BeautifulSoup(html, "html.parser")
            for tag in soup(
                ["script", "style", "nav", "footer", "aside", "meta", "noscript"]
            ):
                tag.decompose()

            for div in soup.find_all(
                "div",
                class_=["ad", "advertisement", "sidebar", "related", "comments"],
            ):
                div.decompose()

            main_content = (
                soup.find("article")
                or soup.find("main")
                or soup.find("body")
            )

            if main_content:
                text = main_content.get_text(separator="\n", strip=True)
            else:
                text = soup.get_text(separator="\n", strip=True)

            lines = [line.strip() for line in text.split("\n") if line.strip()]
            return "\n".join(lines)

        except Exception as e:
            logger.error(f"BeautifulSoup extraction error: {e}")
            return None

    def _extract_title(self, html: str, url: str) -> str:
        """Extract page title."""
        try:
            soup = BeautifulSoup(html, "html.parser")
            title = soup.find("title")
            if title:
                return title.get_text().strip()
            og_title = soup.find("meta", property="og:title")
            if og_title and og_title.get("content"):
                return og_title["content"].strip()
            return url.split("/")[-1] or url
        except Exception:
            return url

    async def extract_from_pdf_url(self, url: str) -> Optional[dict]:
        """Extract text from PDF at URL."""
        try:
            if not url.lower().endswith(".pdf"):
                return None

            logger.info(f"Extracting PDF from: {url}")
            client = await self._get_client()
            response = await client.get(url, timeout=DOWNLOAD_TIMEOUT)
            response.raise_for_status()

            text = self._extract_pdf(response.content)
            if text and len(text.strip()) > 100:
                title = Path(url).stem
                logger.info(f"PDF: {len(text)} chars from {url}")
                return {
                    "text": text.strip(),
                    "title": title,
                    "source": url,
                    "method": "pdf",
                    "length": len(text),
                }
            return None

        except Exception as e:
            logger.warning(f"PDF extraction failed for {url}: {e}")
            return None

    @staticmethod
    def _extract_pdf(pdf_content: bytes) -> Optional[str]:
        """Extract text from PDF bytes using pdfplumber."""
        try:
            import io

            text_parts = []
            with pdfplumber.open(io.BytesIO(pdf_content)) as pdf:
                for page in pdf.pages:
                    text = page.extract_text()
                    if text:
                        text_parts.append(text)
            return "\n".join(text_parts) if text_parts else None
        except Exception as e:
            logger.warning(f"PDF parse error: {e}")
            return None

    async def extract_from_urls(self, urls: List[str]) -> List[dict]:
        """
        Extract content from multiple URLs with parallel execution.
        Uses a semaphore to limit concurrent Playwright tabs.
        """
        logger.info(f"Extracting content from {len(urls)} URLs")

        semaphore = asyncio.Semaphore(4)  # Max 4 concurrent extractions

        async def _extract_one(url: str) -> Optional[dict]:
            async with semaphore:
                if url.lower().endswith(".pdf"):
                    return await self.extract_from_pdf_url(url)
                return await self.extract_from_url(url)

        tasks = [_extract_one(url) for url in urls]

        try:
            results = await asyncio.wait_for(
                asyncio.gather(*tasks, return_exceptions=True),
                timeout=self.timeout * 2,  # Allow more time for batch
            )
        except asyncio.TimeoutError:
            logger.warning(f"Batch extraction timeout for {len(urls)} URLs")
            results = []

        extracted = [r for r in results if isinstance(r, dict) and r is not None]
        logger.info(
            f"Extracted from {len(extracted)}/{len(urls)} URLs"
        )
        return extracted

    async def close(self):
        """Close HTTP client and Playwright browser."""
        if self.client:
            await self.client.aclose()
        await self.playwright_extractor.close()


# Global instance
_extractor = None


def get_extractor() -> ContentExtractor:
    """Get global content extractor instance."""
    global _extractor
    if _extractor is None:
        _extractor = ContentExtractor()
    return _extractor
