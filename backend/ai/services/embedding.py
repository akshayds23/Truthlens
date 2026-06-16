"""Chunking and embedding pipeline service
Implements Prompt 17: Text chunking, normalization, and embedding generation
"""

import logging
import asyncio
from typing import List, Optional, Dict, Any
from dataclasses import dataclass
import re
import unicodedata
from fastembed import TextEmbedding
from ai.config.settings import get_settings

logger = logging.getLogger(__name__)

# Default chunking parameters
DEFAULT_CHUNK_SIZE = 512  # tokens (approximately 2000 characters)
DEFAULT_CHUNK_OVERLAP = 100  # tokens (approximately 400 characters)
DEFAULT_EMBEDDING_MODEL = "BAAI/bge-small-en-v1.5"


@dataclass
class Chunk:
    """Represents a text chunk with metadata"""
    id: str
    text: str
    start_offset: int
    end_offset: int
    source_id: str
    claim_id: Optional[str] = None
    embedding: Optional[List[float]] = None


class TextChunker:
    """Chunks text into overlapping segments"""

    @staticmethod
    def normalize_text(text: str) -> str:
        """
        Normalize text for processing
        - Remove extra whitespace
        - Normalize unicode
        - Clean up formatting
        """
        # Unicode normalization
        text = unicodedata.normalize('NFKD', text)
        
        # Remove control characters
        text = ''.join(c for c in text if not unicodedata.category(c).startswith('C') or c in '\n\t')
        
        # Normalize whitespace
        text = re.sub(r'\s+', ' ', text)
        text = text.strip()
        
        return text

    @staticmethod
    def estimate_tokens(text: str) -> int:
        """Rough estimate of token count (1 token ≈ 4 chars)"""
        return max(1, len(text) // 4)

    @classmethod
    def chunk_text(
        cls,
        text: str,
        source_id: str,
        claim_id: Optional[str] = None,
        chunk_size: int = DEFAULT_CHUNK_SIZE,
        chunk_overlap: int = DEFAULT_CHUNK_OVERLAP,
        separator: str = "\n\n"
    ) -> List[Chunk]:
        """
        Split text into overlapping chunks
        
        Uses hierarchical chunking:
        1. Try to split by paragraphs (separator)
        2. If chunks too large, split by sentences
        3. If still too large, split by words
        
        Args:
            text: Text to chunk
            source_id: ID of source document
            claim_id: Optional claim ID for association
            chunk_size: Target chunk size in tokens
            chunk_overlap: Overlap between chunks in tokens
            separator: Primary separator for chunking
            
        Returns:
            List of Chunk objects with metadata
        """
        # Normalize text
        text = cls.normalize_text(text)
        
        if not text:
            logger.warning(f"Empty text for source {source_id}")
            return []

        chunks = []
        chunk_size_chars = chunk_size * 4  # Convert tokens to approximate chars
        chunk_overlap_chars = chunk_overlap * 4

        # Split by primary separator (paragraphs)
        segments = text.split(separator)
        segments = [s.strip() for s in segments if s.strip()]

        if not segments:
            segments = [text]

        current_chunk = ""
        start_offset = 0
        chunk_id = 0

        for segment in segments:
            # If adding segment would exceed chunk size, save current chunk
            if current_chunk and len(current_chunk) + len(segment) > chunk_size_chars:
                # Save current chunk
                chunk_text = current_chunk.strip()
                if chunk_text:
                    end_offset = start_offset + len(chunk_text)
                    chunks.append(Chunk(
                        id=f"{source_id}_chunk_{chunk_id}",
                        text=chunk_text,
                        start_offset=start_offset,
                        end_offset=end_offset,
                        source_id=source_id,
                        claim_id=claim_id
                    ))
                    chunk_id += 1

                # Start new chunk with overlap from previous
                overlap_text = current_chunk[-chunk_overlap_chars:] if len(current_chunk) > chunk_overlap_chars else ""
                current_chunk = overlap_text + separator + segment
                start_offset = max(0, len(current_chunk) - len(overlap_text) - len(segment))
            else:
                # Add segment to current chunk
                if current_chunk:
                    current_chunk += separator
                current_chunk += segment

        # Don't forget last chunk
        if current_chunk:
            chunk_text = current_chunk.strip()
            if chunk_text:
                end_offset = start_offset + len(chunk_text)
                chunks.append(Chunk(
                    id=f"{source_id}_chunk_{chunk_id}",
                    text=chunk_text,
                    start_offset=start_offset,
                    end_offset=end_offset,
                    source_id=source_id,
                    claim_id=claim_id
                ))

        logger.info(f"Chunked text from {source_id} into {len(chunks)} chunks")
        return chunks


class EmbeddingGenerator:
    """Generates embeddings for text chunks using sentence-transformers"""

    def __init__(self, model_name: Optional[str] = None):
        """
        Initialize embedding generator
        
        Args:
            model_name: HuggingFace model name
                       (default: all-MiniLM-L6-v2, ~22M params)
                       Other options:
                       - sentence-transformers/all-MiniLM-L12-v2 (33M, more accurate)
                       - sentence-transformers/all-mpnet-base-v2 (110M, higher quality)
                       - sentence-transformers/multilingual-MiniLM-L6-v2 (22M, multilingual)
        """
        self.model_name = model_name or DEFAULT_EMBEDDING_MODEL
        logger.info(f"Loading embedding model: {self.model_name}")
        
        try:
            self.model = TextEmbedding(model_name=self.model_name)
            self.embedding_dim = 384  # BAAI/bge-small-en-v1.5 produces 384-dim vectors
            logger.info(f"Embedding model loaded. Dimension: {self.embedding_dim}")
        except Exception as e:
            logger.error(f"Failed to load embedding model: {str(e)}")
            raise RuntimeError(f"Cannot load embedding model {self.model_name}: {str(e)}")

    async def embed_chunks(self, chunks: List[Chunk]) -> List[Chunk]:
        """
        Generate embeddings for a list of chunks
        
        Args:
            chunks: List of Chunk objects
            
        Returns:
            Same chunks with embedding field populated
        """
        if not chunks:
            return []

        logger.info(f"Generating embeddings for {len(chunks)} chunks")

        # Extract texts
        texts = [chunk.text for chunk in chunks]

        try:
            # Generate embeddings (run in thread pool to avoid blocking)
            # Use batch_size=1 to prevent Out-Of-Memory kills on 1GB instances
            loop = asyncio.get_event_loop()
            embeddings = await loop.run_in_executor(
                None,
                lambda: [e.tolist() for e in self.model.embed(texts, batch_size=1)]
            )

            # Attach embeddings to chunks
            for chunk, embedding in zip(chunks, embeddings):
                chunk.embedding = embedding

            logger.info(f"Generated embeddings for {len(chunks)} chunks")
            return chunks

        except Exception as e:
            logger.error(f"Error generating embeddings: {str(e)}")
            raise RuntimeError(f"Failed to generate embeddings: {str(e)}")

    def embed_text(self, text: str) -> List[float]:
        """
        Generate embedding for a single text
        
        Args:
            text: Text to embed
            
        Returns:
            List of floats representing the embedding
        """
        try:
            embedding = list(self.model.embed([text]))[0].tolist()
            return embedding
        except Exception as e:
            logger.error(f"Error embedding text: {str(e)}")
            raise RuntimeError(f"Failed to embed text: {str(e)}")


class EmbeddingPipeline:
    """Complete pipeline: chunk → normalize → embed"""

    def __init__(self, embedding_model: Optional[str] = None):
        self.chunker = TextChunker()
        self.embedder = EmbeddingGenerator(embedding_model)

    async def process(
        self,
        text: str,
        source_id: str,
        claim_id: Optional[str] = None,
        chunk_size: int = DEFAULT_CHUNK_SIZE,
        chunk_overlap: int = DEFAULT_CHUNK_OVERLAP
    ) -> List[Chunk]:
        """
        Complete processing pipeline
        
        Args:
            text: Raw text to process
            source_id: ID of source document
            claim_id: Optional claim ID
            chunk_size: Chunk size in tokens
            chunk_overlap: Chunk overlap in tokens
            
        Returns:
            List of chunks with embeddings
        """
        logger.info(f"Processing text from {source_id} ({len(text)} chars)")

        # Step 1: Chunk text
        chunks = self.chunker.chunk_text(
            text,
            source_id=source_id,
            claim_id=claim_id,
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap
        )

        if not chunks:
            logger.warning(f"No chunks generated from {source_id}")
            return []

        # Step 2: Generate embeddings
        chunks_with_embeddings = await self.embedder.embed_chunks(chunks)

        return chunks_with_embeddings

    async def process_multiple(
        self,
        sources: List[Dict[str, str]],
        claim_id: Optional[str] = None,
        chunk_size: int = DEFAULT_CHUNK_SIZE,
        chunk_overlap: int = DEFAULT_CHUNK_OVERLAP
    ) -> List[Chunk]:
        """
        Process multiple sources in parallel
        
        Args:
            sources: List of dicts with 'id' and 'text' keys
            claim_id: Optional claim ID to associate
            chunk_size: Chunk size in tokens
            chunk_overlap: Chunk overlap in tokens
            
        Returns:
            List of chunks from all sources with embeddings
        """
        logger.info(f"Processing {len(sources)} sources")

        tasks = [
            self.process(
                text=source['text'],
                source_id=source['id'],
                claim_id=claim_id,
                chunk_size=chunk_size,
                chunk_overlap=chunk_overlap
            )
            for source in sources
        ]

        results = await asyncio.gather(*tasks)
        all_chunks = []
        for result in results:
            all_chunks.extend(result)

        logger.info(f"Generated {len(all_chunks)} chunks from {len(sources)} sources")
        return all_chunks


# Global instance — protected by an asyncio Lock to prevent double-loading
_pipeline: Optional[EmbeddingPipeline] = None
_pipeline_lock = asyncio.Lock()


async def get_embedding_pipeline_async(embedding_model: Optional[str] = None) -> EmbeddingPipeline:
    """Get (or lazily create) the global embedding pipeline — async-safe."""
    global _pipeline
    if _pipeline is not None:
        return _pipeline
    async with _pipeline_lock:
        # Double-check inside the lock
        if _pipeline is None:
            settings = get_settings()
            model = embedding_model or settings.EMBEDDING_MODEL or DEFAULT_EMBEDDING_MODEL
            loop = asyncio.get_event_loop()
            _pipeline = await loop.run_in_executor(
                None, lambda: EmbeddingPipeline(embedding_model=model)
            )
    return _pipeline


def get_embedding_pipeline(embedding_model: Optional[str] = None) -> EmbeddingPipeline:
    """Synchronous accessor — only safe to call after the async one has run once."""
    global _pipeline
    if _pipeline is None:
        settings = get_settings()
        model = embedding_model or settings.EMBEDDING_MODEL or DEFAULT_EMBEDDING_MODEL
        _pipeline = EmbeddingPipeline(embedding_model=model)
    return _pipeline
