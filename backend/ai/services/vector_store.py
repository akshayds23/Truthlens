"""Vector store abstraction for pgvector and Chroma
Implements Prompt 22: Integrate pgvector or Chroma
"""

import logging
import asyncio
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import asdict
from datetime import datetime
import json

logger = logging.getLogger(__name__)


class VectorStoreException(Exception):
    """Base exception for vector store operations"""
    pass


class VectorStore(ABC):
    """Abstract base class for vector stores"""

    @abstractmethod
    async def add_chunks(self, chunks: List[Dict[str, Any]]) -> int:
        """Add embeddings to store"""
        pass

    @abstractmethod
    async def search(
        self,
        embedding: List[float],
        top_k: int = 5,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """Search for similar embeddings"""
        pass

    @abstractmethod
    async def delete_collection(self, collection_id: str) -> bool:
        """Delete a collection"""
        pass

    @abstractmethod
    async def clear(self) -> bool:
        """Clear all data"""
        pass


class InMemoryVectorStore(VectorStore):
    """
    In-memory vector store implementation using numpy.
    Replaces ChromaDB to avoid C++ build tools requirements on Windows.
    Good for: MVP, local development, no external DB.
    """

    def __init__(self, collection_name: str = "truthlens"):
        self.collection_name = collection_name
        self.chunks: List[Dict[str, Any]] = []
        logger.info(f"Initialized InMemory vector store: {collection_name}")

    async def add_chunks(self, chunks: List[Dict[str, Any]]) -> int:
        if not chunks:
            return 0
            
        for chunk in chunks:
            self.chunks.append({
                'id': chunk.get('id', ''),
                'embedding': chunk.get('embedding', []),
                'text': chunk.get('text', ''),
                'metadata': {
                    k: str(v) for k, v in chunk.items()
                    if k not in ['id', 'embedding', 'text']
                }
            })
            
        logger.info(f"Added {len(chunks)} chunks to InMemoryStore")
        return len(chunks)

    async def search(
        self,
        embedding: List[float],
        top_k: int = 5,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        if not self.chunks:
            return []
            
        try:
            import numpy as np
            
            query_vec = np.array(embedding)
            query_norm = np.linalg.norm(query_vec)
            if query_norm == 0:
                return []
                
            results = []
            for chunk in self.chunks:
                if filters:
                    skip = False
                    for k, v in filters.items():
                        if chunk['metadata'].get(k) != str(v):
                            skip = True
                            break
                    if skip:
                        continue
                        
                chunk_vec = np.array(chunk['embedding'])
                chunk_norm = np.linalg.norm(chunk_vec)
                
                if chunk_norm == 0:
                    similarity = 0.0
                else:
                    similarity = np.dot(query_vec, chunk_vec) / (query_norm * chunk_norm)
                    
                results.append({
                    'id': chunk['id'],
                    'text': chunk['text'],
                    'similarity': float(similarity),
                    'metadata': chunk['metadata']
                })
                
            results.sort(key=lambda x: x['similarity'], reverse=True)
            matches = results[:top_k]
            
            logger.debug(f"Found {len(matches)} matches in InMemoryStore")
            return matches
            
        except ImportError:
            logger.error("numpy is required for InMemoryVectorStore")
            return []
        except Exception as e:
            logger.error(f"Error searching InMemoryStore: {str(e)}")
            return []

    async def delete_collection(self, collection_id: str) -> bool:
        self.chunks = []
        return True

    async def clear(self) -> bool:
        self.chunks = []
        logger.info("Cleared InMemoryStore collection")
        return True


class PgVectorStore(VectorStore):
    """
    PostgreSQL pgvector implementation
    Good for: Production, persistence, multi-tenancy
    Pros: Persistence, scalable, SQL
    Cons: Requires PostgreSQL with pgvector extension
    
    Setup:
    1. Install pgvector extension: CREATE EXTENSION IF NOT EXISTS vector;
    2. Create table:
       CREATE TABLE evidence_chunks (
         id SERIAL PRIMARY KEY,
         claim_id VARCHAR(255),
         source_id VARCHAR(255),
         chunk_text TEXT NOT NULL,
         embedding vector(384),
         metadata JSONB,
         created_at TIMESTAMP DEFAULT NOW()
       );
    3. Create index: CREATE INDEX on evidence_chunks USING ivfflat (embedding vector_cosine_ops);
    """

    def __init__(self, connection_string: str):
        """
        Initialize pgvector connection
        
        Args:
            connection_string: PostgreSQL connection string
        """
        try:
            import asyncpg
            self.connection_string = connection_string
            self.pool = None
            logger.info("pgvector client initialized")
        except ImportError:
            raise VectorStoreException("asyncpg not installed. Install with: pip install asyncpg")

    async def _get_pool(self):
        """Get or create connection pool"""
        if self.pool is None:
            import asyncpg
            self.pool = await asyncpg.create_pool(self.connection_string)
        return self.pool

    async def add_chunks(self, chunks: List[Dict[str, Any]]) -> int:
        """Add chunks with embeddings to pgvector"""
        if not chunks:
            return 0

        try:
            pool = await self._get_pool()
            async with pool.acquire() as conn:
                async with conn.transaction():
                    for chunk in chunks:
                        await conn.execute(
                            """
                            INSERT INTO evidence_chunks
                            (claim_id, source_id, chunk_text, embedding, metadata)
                            VALUES ($1, $2, $3, $4::vector, $5)
                            """,
                            chunk.get('claim_id'),
                            chunk.get('source_id'),
                            chunk['text'],
                            chunk['embedding'],
                            json.dumps(chunk.get('metadata', {}))
                        )

            logger.info(f"Added {len(chunks)} chunks to pgvector")
            return len(chunks)

        except Exception as e:
            logger.error(f"Error adding chunks to pgvector: {str(e)}")
            raise VectorStoreException(f"Failed to add chunks: {str(e)}")

    async def search(
        self,
        embedding: List[float],
        top_k: int = 5,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """Search for similar embeddings using pgvector"""
        try:
            pool = await self._get_pool()
            async with pool.acquire() as conn:
                # Build query with optional filters
                where_clause = "WHERE 1=1"
                params = [embedding]

                if filters:
                    if 'claim_id' in filters:
                        where_clause += f" AND claim_id = ${len(params) + 1}"
                        params.append(filters['claim_id'])
                    if 'source_id' in filters:
                        where_clause += f" AND source_id = ${len(params) + 1}"
                        params.append(filters['source_id'])

                query = f"""
                SELECT
                    id, claim_id, source_id, chunk_text, embedding,
                    1 - (embedding <=> $1::vector) as similarity,
                    metadata
                FROM evidence_chunks
                {where_clause}
                ORDER BY embedding <=> $1::vector
                LIMIT ${ len(params) + 1}
                """

                params.append(top_k)

                rows = await conn.fetch(query, *params)

                matches = [
                    {
                        'id': str(row['id']),
                        'text': row['chunk_text'],
                        'similarity': float(row['similarity']),
                        'metadata': row['metadata'] or {}
                    }
                    for row in rows
                ]

                logger.debug(f"Found {len(matches)} matches in pgvector")
                return matches

        except Exception as e:
            logger.error(f"Error searching pgvector: {str(e)}")
            raise VectorStoreException(f"Search failed: {str(e)}")

    async def delete_collection(self, collection_id: str) -> bool:
        """Delete chunks for a collection"""
        try:
            pool = await self._get_pool()
            async with pool.acquire() as conn:
                await conn.execute(
                    "DELETE FROM evidence_chunks WHERE claim_id = $1",
                    collection_id
                )
            logger.info(f"Deleted chunks for claim: {collection_id}")
            return True
        except Exception as e:
            logger.error(f"Error deleting from pgvector: {str(e)}")
            return False

    async def clear(self) -> bool:
        """Clear all chunks"""
        try:
            pool = await self._get_pool()
            async with pool.acquire() as conn:
                await conn.execute("TRUNCATE TABLE evidence_chunks")
            logger.info("Cleared pgvector table")
            return True
        except Exception as e:
            logger.error(f"Error clearing pgvector: {str(e)}")
            return False

    async def close(self):
        """Close connection pool"""
        if self.pool:
            await self.pool.close()


# Factory function to get appropriate vector store
def get_vector_store(store_type: str = "chroma", **kwargs) -> VectorStore:
    """
    Get a vector store instance
    
    Args:
        store_type: 'chroma' or 'pgvector'
        **kwargs: Additional arguments for the store
        
    Returns:
        VectorStore instance
        
    Example:
        # Chroma (development)
        store = get_vector_store("chroma")
        
        # pgvector (production)
        store = get_vector_store("pgvector", connection_string="postgresql://...")
    """
    if store_type == "chroma":
        return InMemoryVectorStore(**kwargs)
    elif store_type == "pgvector":
        if 'connection_string' not in kwargs:
            raise ValueError("connection_string required for pgvector")
        return PgVectorStore(**kwargs)
    else:
        raise ValueError(f"Unknown vector store type: {store_type}")

