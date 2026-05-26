"""
LLM Client for multiple providers: OpenAI, Anthropic, Google Gemini, Groq
Supports openai/gpt-oss-20b on Groq, Gemini 2.0 Flash, and all major models.
"""

import json
import logging
import httpx
import asyncio
from typing import Dict, List, Optional, Union
from enum import Enum
from openai import AsyncOpenAI

logger = logging.getLogger(__name__)

GROQ_BASE_URL = "https://api.groq.com/openai/v1"

# Maximum retries for transient failures
MAX_RETRIES = 3
RETRY_DELAYS = [1.0, 3.0, 6.0]  # Exponential backoff

DECOMPOSITION_PROMPT = """You are an expert at breaking down complex claims into atomic, testable sub-claims.

Analyze the following claim and break it down into 2-8 sub-claims. Each sub-claim should be:
- Atomic (a single testable statement)
- Specific enough to search for evidence
- Factual, opinion-based, or compound
- Rated on importance (1-10)

Also classify the claim type: statistical, historical, scientific, political, medical, economic, or general.

Claim: {claim}

Respond with ONLY a valid JSON object (no markdown, no extra text) in this exact format:
{{
  "sub_claims": [
    {{
      "text": "specific, searchable sub-claim text",
      "type": "factual|opinion|compound",
      "importance": 1-10
    }}
  ],
  "complexity": "simple|moderate|complex",
  "claim_type": "statistical|historical|scientific|political|medical|economic|general"
}}
"""


class LLMProvider(str, Enum):
    """Supported LLM providers"""
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    GEMINI = "gemini"
    GROQ = "groq"


class LLMClient:
    """
    LLM Client supporting multiple providers.
    Routes requests to the appropriate API based on model name.
    """

    # Groq-hosted models (use Groq API, not OpenAI API)
    GROQ_MODELS = [
        "openai/gpt-oss-20b",
        "openai/gpt-oss-safeguard-20b",
        "mixtral", "llama",
        "groq/compound-mini", "groq/compound",
        "llama-3.3-70b-versatile", "llama-3.1-8b-instant",
        "llama-3-70b", "mixtral-8x7b-32768",
    ]

    def __init__(self, model: Union[str, Enum], api_key: str):
        """
        Initialize LLM client.

        Args:
            model: Model name (e.g., 'openai/gpt-oss-20b', 'gemini-2-flash', 'gpt-4')
            api_key: API key for the provider

        Raises:
            ValueError: If model is not recognized or API key is empty
        """
        self.model = self._normalize_model(model)
        self.api_key = api_key
        self.provider = self._detect_provider(self.model)
        self.temperature = 0.3
        self.max_tokens = 2000  # Increased from 1000 for better reasoning

        if not api_key or len(api_key.strip()) == 0:
            raise ValueError("API key cannot be empty")

    @staticmethod
    def _normalize_model(model: Union[str, Enum]) -> str:
        """Convert enum-backed or string model identifiers into plain strings."""
        if isinstance(model, Enum):
            model = model.value
        model_str = str(model).strip()
        if not model_str:
            raise ValueError("Model cannot be empty")
        return model_str

    @staticmethod
    def _detect_provider(model: Union[str, Enum]) -> LLMProvider:
        """
        Detect provider based on model name.

        IMPORTANT: Groq-hosted models like 'openai/gpt-oss-20b' must route
        to Groq, NOT OpenAI. Check Groq models first.
        """
        model_lower = LLMClient._normalize_model(model).lower()

        # ── Groq models (check FIRST — some start with "openai/") ──
        for groq_model in LLMClient.GROQ_MODELS:
            if groq_model.lower() in model_lower:
                return LLMProvider.GROQ

        # ── OpenAI models ──
        if any(m in model_lower for m in ["gpt-4", "gpt-3.5", "gpt-4-turbo"]):
            return LLMProvider.OPENAI

        # ── Anthropic models ──
        if "claude" in model_lower:
            return LLMProvider.ANTHROPIC

        # ── Google Gemini models ──
        if "gemini" in model_lower:
            return LLMProvider.GEMINI

        # Default to Groq for unknown models (most flexible)
        logger.warning(f"Unknown model '{model}', defaulting to Groq provider")
        return LLMProvider.GROQ

    async def decompose_claim(self, claim: str) -> Dict:
        """
        Decompose a claim into sub-claims using the appropriate LLM provider.
        """
        messages = [
            {
                "role": "system",
                "content": "You are an expert at breaking down complex claims into atomic, testable sub-claims. Always respond with valid JSON only.",
            },
            {
                "role": "user",
                "content": DECOMPOSITION_PROMPT.format(claim=claim),
            },
        ]

        response = await self.call_llm(
            messages=messages,
            temperature=self.temperature,
            max_tokens=self.max_tokens,
        )
        return self._parse_json_response(response)

    async def call_llm(
        self,
        messages: List[Dict[str, str]],
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
    ) -> str:
        """
        Send a chat-completions request to the configured provider with retry logic.

        Args:
            messages: Chat messages to send
            temperature: Sampling temperature override
            max_tokens: Max tokens override

        Returns:
            Raw text content from the model response
        """
        if not messages:
            raise ValueError("messages cannot be empty")

        temperature = self.temperature if temperature is None else temperature
        max_tokens = self.max_tokens if max_tokens is None else max_tokens

        last_error = None
        for attempt in range(MAX_RETRIES):
            try:
                if self.provider == LLMProvider.OPENAI:
                    return await self._call_openai_chat(messages, temperature, max_tokens)
                elif self.provider == LLMProvider.ANTHROPIC:
                    return await self._call_anthropic_chat(messages, temperature, max_tokens)
                elif self.provider == LLMProvider.GEMINI:
                    return await self._call_gemini_chat(messages, temperature, max_tokens)
                elif self.provider == LLMProvider.GROQ:
                    return await self._call_groq_chat(messages, temperature, max_tokens)
                else:
                    raise ValueError(f"Unsupported provider: {self.provider}")

            except ValueError as e:
                # Don't retry auth/validation errors
                error_msg = str(e)
                if any(kw in error_msg for kw in ["Invalid", "expired", "API key"]):
                    raise
                last_error = e

            except Exception as e:
                last_error = e

            if attempt < MAX_RETRIES - 1:
                delay = RETRY_DELAYS[attempt]
                logger.warning(
                    f"LLM call attempt {attempt + 1} failed: {last_error}. "
                    f"Retrying in {delay}s..."
                )
                await asyncio.sleep(delay)

        raise ValueError(f"LLM call failed after {MAX_RETRIES} attempts: {last_error}")

    # ── OpenAI ──

    async def _call_openai_chat(
        self,
        messages: List[Dict[str, str]],
        temperature: float,
        max_tokens: int,
    ) -> str:
        url = "https://api.openai.com/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(url, json=payload, headers=headers)

            if response.status_code == 401:
                raise ValueError("Invalid or expired OpenAI API key")
            elif response.status_code == 429:
                raise ValueError("Rate limited by OpenAI API")
            elif response.status_code >= 500:
                raise ValueError("OpenAI API service error")

            response.raise_for_status()
            result = response.json()
            return result["choices"][0]["message"]["content"]

    # ── Anthropic ──

    async def _call_anthropic_chat(
        self,
        messages: List[Dict[str, str]],
        temperature: float,
        max_tokens: int,
    ) -> str:
        url = "https://api.anthropic.com/v1/messages"
        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }

        system_messages = [m["content"] for m in messages if m.get("role") == "system"]
        non_system_messages = [m for m in messages if m.get("role") != "system"]
        payload = {
            "model": self.model,
            "max_tokens": max_tokens,
            "system": "\n".join(system_messages) if system_messages else None,
            "messages": non_system_messages,
            "temperature": temperature,
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(url, json=payload, headers=headers)

            if response.status_code == 401:
                raise ValueError("Invalid or expired Anthropic API key")
            elif response.status_code == 429:
                raise ValueError("Rate limited by Anthropic API")
            elif response.status_code >= 500:
                raise ValueError("Anthropic API service error")

            response.raise_for_status()
            result = response.json()
            return result["content"][0]["text"]

    # ── Google Gemini ──

    async def _call_gemini_chat(
        self,
        messages: List[Dict[str, str]],
        temperature: float,
        max_tokens: int,
    ) -> str:
        # Use the model name directly if it looks like a full model ID
        model_id = self.model if "/" in self.model else f"gemini-2.0-flash"
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_id}:generateContent"
        headers = {"Content-Type": "application/json"}

        # Convert chat messages to Gemini format
        prompt = "\n\n".join(
            f"{message.get('role', 'user').upper()}: {message.get('content', '')}"
            for message in messages
        )
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_tokens,
            },
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                url, json=payload, headers=headers,
                params={"key": self.api_key},
            )

            if response.status_code == 401:
                raise ValueError("Invalid or expired Google Gemini API key")
            elif response.status_code == 429:
                raise ValueError("Rate limited by Google Gemini API")
            elif response.status_code >= 500:
                raise ValueError("Google Gemini API service error")

            response.raise_for_status()
            result = response.json()
            return result["candidates"][0]["content"]["parts"][0]["text"]

    # ── Groq (OpenAI-compatible chat completions) ──

    async def _call_groq_chat(
        self,
        messages: List[Dict[str, str]],
        temperature: float,
        max_tokens: int,
    ) -> str:
        """
        Call Groq API using OpenAI-compatible chat.completions.create().

        IMPORTANT: Groq does NOT support the OpenAI Responses API
        (client.responses.create). Must use chat.completions.create().
        """
        client = AsyncOpenAI(
            api_key=self.api_key,
            base_url=GROQ_BASE_URL,
        )

        try:
            response = await client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
            )
            return response.choices[0].message.content

        except Exception as e:
            error_msg = str(e)
            if "401" in error_msg:
                raise ValueError("Invalid or expired Groq API key")
            elif "429" in error_msg:
                raise ValueError("Rate limited by Groq API")
            elif "400" in error_msg:
                raise ValueError(f"Groq API rejected the request: {error_msg}")
            raise ValueError(f"Groq API error: {error_msg}")

    # ── JSON Parsing ──

    @staticmethod
    def _parse_json_response(content: str) -> Dict:
        """
        Parse JSON response from LLM.
        Handles markdown code blocks, trailing commas, etc.
        """
        content = content.strip()

        # Remove markdown code blocks
        if content.startswith("```json"):
            content = content[7:]
        if content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()

        # Try direct parse first
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            pass

        # Try to find JSON object in the response
        start = content.find("{")
        end = content.rfind("}") + 1
        if start >= 0 and end > start:
            try:
                return json.loads(content[start:end])
            except json.JSONDecodeError:
                pass

        logger.error(f"Failed to parse LLM response as JSON: {content[:200]}...")
        raise ValueError(f"Invalid JSON response from LLM")

