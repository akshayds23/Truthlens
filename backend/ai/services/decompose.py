"""
Claim decomposition service.
Handles breaking down complex claims into sub-claims using LLMs.
"""

import uuid
import logging
from typing import Dict, List
from ai.utils.llm_client import LLMClient

logger = logging.getLogger(__name__)


class DecompositionService:
    """Service for decomposing claims into sub-claims."""

    @staticmethod
    def validate_claim(claim: str) -> None:
        """
        Validate claim text.

        Args:
            claim: The claim text to validate

        Raises:
            ValueError: If claim is invalid
        """
        if not claim or not isinstance(claim, str):
            raise ValueError("Claim must be a non-empty string")

        claim_length = len(claim.strip())
        if claim_length < 10:
            raise ValueError("Claim must be at least 10 characters long")
        if claim_length > 500:
            raise ValueError("Claim must be at most 500 characters long")

    @staticmethod
    def validate_model(model: str) -> None:
        """
        Validate model name.

        Args:
            model: The model name to validate

        Raises:
            ValueError: If model is invalid
        """
        model_str = LLMClient._normalize_model(model)

        valid_models = [
            # OpenAI
            "gpt-4",
            "gpt-4-turbo",
            "gpt-3.5-turbo",
            # Anthropic
            "claude-3-opus",
            "claude-3-sonnet",
            "claude-3-haiku",
            # Google Gemini
            "gemini-2-flash",
            "gemini-2.0-flash",
            "gemini-1.5-pro",
            # Groq
            "openai/gpt-oss-20b",
            "openai/gpt-oss-safeguard-20b",
            "mixtral-8x7b-32768",
            "llama-3-70b",
            "llama-3.1-8b-instant",
            "llama-3.3-70b-versatile",
            "groq/compound-mini",
            "groq/compound",
        ]

        model_lower = model_str.lower()
        if not any(m in model_lower for m in valid_models):
            raise ValueError(
                f"Invalid model: {model_str}. Valid models: {', '.join(valid_models)}"
            )

    @staticmethod
    def validate_api_key(api_key: str) -> None:
        """
        Validate API key format.

        Args:
            api_key: The API key to validate

        Raises:
            ValueError: If API key is invalid
        """
        if not api_key or not isinstance(api_key, str):
            raise ValueError("API key must be a non-empty string")

        api_key = api_key.strip()
        if len(api_key) < 10:
            raise ValueError("API key appears to be invalid (too short)")

    @staticmethod
    async def decompose(claim: str, model: str, api_key: str) -> Dict:
        """
        Decompose a claim into sub-claims.

        Args:
            claim: The claim to decompose
            model: The LLM model to use
            api_key: API key for the LLM provider

        Returns:
            Dictionary with original_claim, sub_claims, complexity, and claim_type

        Raises:
            ValueError: If validation fails or LLM returns invalid response
        """
        # Validate inputs
        DecompositionService.validate_claim(claim)
        DecompositionService.validate_model(model)
        DecompositionService.validate_api_key(api_key)

        try:
            # Initialize LLM client
            llm_client = LLMClient(model=model, api_key=api_key)

            # Call LLM to decompose claim
            response = await llm_client.decompose_claim(claim)

            # Validate and enrich response
            sub_claims = DecompositionService._process_sub_claims(
                response.get("sub_claims", [])
            )
            complexity = response.get("complexity", "moderate")
            claim_type = response.get("claim_type", "general")

            # Validate complexity
            if complexity not in ["simple", "moderate", "complex"]:
                complexity = "moderate"

            # Validate claim_type
            valid_types = [
                "statistical", "historical", "scientific", "political",
                "medical", "economic", "general"
            ]
            if claim_type not in valid_types:
                claim_type = "general"

            # Validate sub-claims count
            if len(sub_claims) == 0:
                raise ValueError("LLM returned no sub-claims")
            if len(sub_claims) > 10:
                sub_claims = sub_claims[:10]

            return {
                "original_claim": claim,
                "sub_claims": sub_claims,
                "complexity": complexity,
                "claim_type": claim_type,
            }

        except ValueError as e:
            # Re-raise validation errors
            raise e
        except Exception as e:
            # Log and convert other errors
            logger.error(f"Error decomposing claim: {str(e)}")
            raise ValueError(f"Failed to decompose claim: {str(e)}")

    @staticmethod
    def _process_sub_claims(sub_claims: List) -> List[Dict]:
        """
        Process and validate sub-claims from LLM response.

        Args:
            sub_claims: List of sub-claims from LLM

        Returns:
            List of validated and enriched sub-claims with IDs

        Raises:
            ValueError: If sub-claims are invalid
        """
        if not isinstance(sub_claims, list):
            raise ValueError("Sub-claims must be a list")

        processed = []
        for sc in sub_claims:
            if not isinstance(sc, dict):
                continue

            # Extract required fields
            text = sc.get("text", "").strip()
            claim_type = sc.get("type", "factual").lower()
            importance = sc.get("importance", 5)

            # Validate text
            if not text or len(text) < 5:
                continue

            # Validate type
            if claim_type not in ["factual", "opinion", "compound"]:
                claim_type = "factual"

            # Validate importance
            try:
                importance = int(importance)
                if importance < 1 or importance > 10:
                    importance = 5
            except (ValueError, TypeError):
                importance = 5

            # Create validated sub-claim
            processed.append(
                {
                    "id": f"sc_{uuid.uuid4().hex[:8]}",
                    "text": text,
                    "type": claim_type,
                    "importance": importance,
                }
            )

        return processed

