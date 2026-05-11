"""Verdict generation service using LLM
Uses chain-of-thought reasoning for accurate fact-checking verdicts.
"""

import logging
import json
import asyncio
import re
from typing import Optional, Dict, Any, List
from ai.utils.llm_client import LLMClient
from ai.models.schemas import VerdictEnum

logger = logging.getLogger(__name__)


class VerdictGenerator:
    """Generates fact-check verdicts using chain-of-thought LLM reasoning."""

    STOPWORDS = {
        "the", "and", "that", "with", "from", "this", "have", "into", "they",
        "their", "would", "could", "should", "about", "there", "which", "what",
        "when", "where", "who", "will", "been", "being", "does", "did", "were",
        "them", "then", "than", "because", "explicitly", "officially", "most",
        "many", "much", "such", "some", "your", "after", "before", "within",
        "regardless", "amount", "claim", "cause", "causes",
    }

    # Verdict categories and their confidence thresholds
    VERDICT_CATEGORIES = {
        VerdictEnum.TRUE.value: "The claim is supported by strong evidence",
        VerdictEnum.MOSTLY_TRUE.value: "The claim is mostly accurate with minor inaccuracies",
        VerdictEnum.MISLEADING.value: "The claim is technically true but misleading or lacks context",
        VerdictEnum.FALSE.value: "The claim is contradicted by evidence",
        VerdictEnum.UNVERIFIABLE.value: "The claim cannot be verified with available evidence"
    }

    # Chain-of-thought verdict prompt — much more structured than the old single-shot prompt
    VERDICT_PROMPT_TEMPLATE = """You are an expert fact-checker analyzing a claim against gathered evidence.

CLAIM TO VERIFY: {claim}

EVIDENCE FROM WEB SOURCES:
{evidence_text}

INSTRUCTIONS:
1. First, identify the key factual assertions in the claim.
2. For each assertion, evaluate whether the evidence supports, contradicts, or is neutral.
3. Consider the credibility of the sources (academic, government, and established news sources are more reliable).
4. Look for consensus across multiple sources.
5. Generate your verdict based ONLY on the provided evidence. Do NOT use knowledge not present in the evidence.
6. Every citation MUST reference a source URL from the evidence above. Do NOT invent URLs.

Respond with ONLY a valid JSON object (no markdown, no extra text):
{{
    "verdict": "TRUE|MOSTLY_TRUE|MISLEADING|FALSE|UNVERIFIABLE",
    "confidence": <float between 0.0 and 1.0>,
    "explanation": "<2-4 sentence explanation of your verdict, referencing specific evidence>",
    "key_points": [
        "<key finding 1 with source reference>",
        "<key finding 2 with source reference>",
        "<key finding 3 with source reference>"
    ],
    "citations": [
        {{
            "claim": "<specific part of the original claim this citation addresses>",
            "evidence": "<relevant quote or paraphrase from the source>",
            "source_url": "<exact URL from the evidence above>",
            "stance": "supports|contradicts|neutral",
            "confidence": <0.0-1.0>
        }}
    ]
}}"""

    def __init__(self):
        pass

    async def generate_verdict(
        self,
        claim: str,
        sub_claims: List[Dict[str, str]],
        supporting_evidence: List[Dict[str, str]],
        contradicting_evidence: List[Dict[str, str]],
        missing_context: List[str],
        model: str,
        api_key: str,
        response_length: str = "medium"
    ) -> Dict[str, Any]:
        """
        Generate a verdict using chain-of-thought reasoning.

        All evidence is passed to the LLM together — the LLM classifies
        stance, not the pipeline. This avoids the old bug where vector
        similarity was used as a proxy for stance.
        """
        try:
            logger.info(f"Generating verdict for claim: {claim[:100]}...")

            # Combine ALL evidence — let the LLM determine stance
            all_evidence = supporting_evidence + contradicting_evidence

            # Format evidence with full context (800 chars instead of old 200)
            evidence_text = self._format_evidence_for_prompt(all_evidence)

            if not evidence_text or evidence_text == "No evidence found.":
                logger.warning("No evidence available for verdict generation")
                return {
                    'verdict': VerdictEnum.UNVERIFIABLE.value,
                    'confidence': 0.1,
                    'explanation': 'Insufficient evidence was gathered to verify this claim.',
                    'key_points': ['No relevant evidence found from web sources'],
                    'citations': []
                }

            # Build chain-of-thought prompt
            prompt = self.VERDICT_PROMPT_TEMPLATE.format(
                claim=claim,
                evidence_text=evidence_text,
            )

            # Call LLM
            llm_client = LLMClient(model=model, api_key=api_key)
            response = await llm_client.call_llm(
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are an expert fact-checker. Analyze evidence carefully "
                            "and provide accurate verdicts. Always respond with valid JSON only. "
                            "NEVER invent or hallucinate source URLs — only cite URLs from "
                            "the evidence provided to you."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0.2,  # Lower temperature for more consistent verdicts
                max_tokens=2000,
            )

            # Parse response
            verdict_data = self._parse_verdict_response(response)

            # Validate verdict value
            if verdict_data['verdict'] not in [v.value for v in VerdictEnum]:
                logger.warning(f"Invalid verdict returned: {verdict_data['verdict']}")
                verdict_data['verdict'] = VerdictEnum.UNVERIFIABLE.value

            # Ensure confidence is in valid range
            if not 0 <= verdict_data['confidence'] <= 1:
                verdict_data['confidence'] = 0.5

            # Ground citations to actual evidence
            verdict_data['citations'] = self._ground_citations(
                claim=claim,
                llm_citations=verdict_data.get('citations', []),
                all_evidence=all_evidence,
            )

            logger.info(
                f"Verdict: {verdict_data['verdict']} "
                f"(confidence: {verdict_data['confidence']:.2f}, "
                f"citations: {len(verdict_data['citations'])})"
            )
            return verdict_data

        except Exception as e:
            logger.error(f"Error generating verdict: {str(e)}")
            return {
                'verdict': VerdictEnum.UNVERIFIABLE.value,
                'confidence': 0.0,
                'explanation': f'Error: {str(e)}',
                'key_points': [],
                'citations': []
            }

    def _format_evidence_for_prompt(self, evidence_list: List[Dict[str, str]]) -> str:
        """
        Format evidence for the verdict prompt.

        CRITICAL: Use 800 chars per source (not 200).
        Include source URL so the LLM can cite it.
        """
        if not evidence_list:
            return "No evidence found."

        formatted = []
        for i, evidence in enumerate(evidence_list, 1):
            text = evidence.get('text', '')[:800]  # 800 chars — enough for real reasoning
            source = evidence.get('source', 'Unknown source')
            relevance = evidence.get('relevance', 0.0)

            formatted.append(
                f"[Source {i}] ({source})\n"
                f"Relevance: {relevance:.2f}\n"
                f"Content: {text}\n"
            )

        return "\n---\n".join(formatted)

    def _parse_verdict_response(self, response: str) -> Dict[str, Any]:
        """Parse LLM response into structured verdict."""
        try:
            # Extract JSON from response
            if '```json' in response:
                json_str = response.split('```json')[1].split('```')[0]
            elif '```' in response:
                json_str = response.split('```')[1].split('```')[0]
            else:
                json_str = response

            # Try direct parse
            try:
                verdict_data = json.loads(json_str.strip())
            except json.JSONDecodeError:
                # Try to find JSON object
                start = json_str.find("{")
                end = json_str.rfind("}") + 1
                if start >= 0 and end > start:
                    verdict_data = json.loads(json_str[start:end])
                else:
                    raise

            # Validate required fields
            for field in ['verdict', 'confidence', 'explanation']:
                if field not in verdict_data:
                    verdict_data[field] = self._get_default(field)

            verdict_data.setdefault('key_points', [])
            verdict_data.setdefault('citations', [])

            return verdict_data

        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse verdict JSON: {e}")
            return {
                'verdict': VerdictEnum.UNVERIFIABLE.value,
                'confidence': 0.0,
                'explanation': 'Failed to parse LLM response',
                'key_points': [],
                'citations': []
            }

    def _get_default(self, field: str) -> Any:
        """Get default value for a field."""
        defaults = {
            'verdict': VerdictEnum.UNVERIFIABLE.value,
            'confidence': 0.0,
            'explanation': 'Unable to generate',
            'key_points': [],
            'citations': []
        }
        return defaults.get(field)

    def _ground_citations(
        self,
        claim: str,
        llm_citations: List[Dict[str, Any]],
        all_evidence: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """
        Keep citations anchored to actual retrieved evidence.
        Replaces LLM-invented URLs with real evidence sources.
        """
        if not all_evidence:
            return []

        # Build lookup by source URL
        evidence_by_source = {}
        for item in all_evidence:
            source = item.get("source", "").strip()
            if source and source not in evidence_by_source:
                evidence_by_source[source] = item

        grounded = []
        for citation in llm_citations:
            source_url = str(citation.get("source_url", "")).strip()
            if not source_url or source_url not in evidence_by_source:
                continue

            matched = evidence_by_source[source_url]
            if not self._citation_matches_claim(claim, matched):
                continue

            grounded.append({
                "claim": citation.get("claim") or claim,
                "evidence": self._clip_evidence_text(
                    matched.get("text", citation.get("evidence", ""))
                ),
                "source_url": source_url,
                "stance": citation.get("stance", "neutral"),
                "confidence": citation.get("confidence", matched.get("relevance", 0.8)),
            })

        if grounded:
            return grounded[:5]  # Up to 5 grounded citations

        # Fallback: build citations from top evidence
        fallback = []
        for item in all_evidence[:5]:
            source = item.get("source", "").strip()
            if not source:
                continue
            if not self._citation_matches_claim(claim, item):
                continue
            fallback.append({
                "claim": claim,
                "evidence": self._clip_evidence_text(item.get("text", "")),
                "source_url": source,
                "stance": "neutral",
                "confidence": item.get("relevance", 0.8),
            })

        return fallback

    def _clip_evidence_text(self, text: str, max_chars: int = 600) -> str:
        """Keep citation evidence readable and bounded."""
        cleaned = " ".join(str(text).split()).strip()
        if len(cleaned) <= max_chars:
            return cleaned
        clipped = cleaned[:max_chars].rsplit(" ", 1)[0].rstrip(" ,;:")
        return f"{clipped}..."

    def _citation_matches_claim(self, claim: str, evidence: Dict[str, Any]) -> bool:
        terms = self._extract_claim_terms(claim)
        if not terms:
            return True
        haystack = f"{evidence.get('text', '')} {evidence.get('source', '')}".lower()
        overlap = sum(1 for term in terms if term in haystack)
        return overlap >= min(2, len(terms))

    def _extract_claim_terms(self, claim: str) -> List[str]:
        terms = re.findall(r"[a-z0-9]+", claim.lower())
        unique_terms = []
        for term in terms:
            if len(term) < 4 or term in self.STOPWORDS:
                continue
            if term not in unique_terms:
                unique_terms.append(term)
        return unique_terms[:8]

    async def generate_sub_claim_verdicts(
        self,
        sub_claims: List[str],
        supporting_evidence: List[Dict[str, str]],
        contradicting_evidence: List[Dict[str, str]],
        model: str,
        api_key: str
    ) -> List[Dict[str, Any]]:
        """Generate verdicts for multiple sub-claims in parallel."""
        tasks = [
            self.generate_verdict(
                claim=sub_claim,
                sub_claims=[],
                supporting_evidence=supporting_evidence,
                contradicting_evidence=contradicting_evidence,
                missing_context=[],
                model=model,
                api_key=api_key
            )
            for sub_claim in sub_claims
        ]
        results = await asyncio.gather(*tasks)
        return results


# Global instance
_verdict_generator = None


def get_verdict_generator() -> VerdictGenerator:
    """Get global verdict generator instance."""
    global _verdict_generator
    if _verdict_generator is None:
        _verdict_generator = VerdictGenerator()
    return _verdict_generator

