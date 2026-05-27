import chromadb
from sentence_transformers import SentenceTransformer
from typing import List, Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)


class VectorStoreService:
    def __init__(self):
        try:
            self.client = chromadb.PersistentClient(path="./chroma_db")
            self.collection = self.client.get_or_create_collection("document_chunks")
            self.model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
            logger.info("VectorStoreService initialized successfully (persistent storage).")
        except Exception as e:
            logger.error(f"Failed to initialize VectorStoreService: {e}")
            raise

    def initialize_vector_store(self):
        """Initialize the vector store if needed."""
        pass

    def chunk_text(
        self, text: str, chunk_size: int = 1000, overlap: int = 100
    ) -> List[str]:
        """Split text into overlapping chunks."""
        chunks = []
        for i in range(0, len(text), chunk_size - overlap):
            chunk = text[i : i + chunk_size]
            if chunk.strip():
                chunks.append(chunk)
        return chunks

    def generate_embedding(self, text: str) -> List[float]:
        """Generate embedding vector for text."""
        return self.model.encode(text).tolist()

    def save_document_chunks(
        self,
        chunks: List[str],
        document_id: int,
        filename: str,
        source_type: str = "knowledge_base",
        user_id: Optional[int] = None,
    ):
        """
        Save document chunks with embeddings to vector store.

        Args:
            chunks:      List of text chunks to embed and store.
            document_id: MySQL ID of the document record.
            filename:    Original filename for display in sources.
            source_type: 'knowledge_base' — shared, visible to ALL users.
                         'user_data'      — private, visible only to the owning user.
            user_id:     Required when source_type='user_data'. Ignored (stored as
                         'global') when source_type='knowledge_base'.
        """
        # Determine the stored user_id tag
        uid_tag = "global" if source_type == "knowledge_base" else str(user_id or "global")

        try:
            for idx, chunk in enumerate(chunks):
                embedding = self.generate_embedding(chunk)
                chunk_id = f"doc_{document_id}_chunk_{idx}"

                self.collection.add(
                    ids=[chunk_id],
                    documents=[chunk],
                    embeddings=[embedding],
                    metadatas=[
                        {
                            "document_id": str(document_id),
                            "filename": filename,
                            "chunk_index": idx,
                            # ── Scoping metadata ──────────────────────────────
                            # source_type: 'knowledge_base' → all users can see
                            #              'user_data'      → only owner can see
                            "source_type": source_type,
                            # user_id: 'global' for knowledge_base,
                            #          str(user_id) for user-specific data
                            "user_id": uid_tag,
                        }
                    ],
                )
            logger.info(
                f"Saved {len(chunks)} chunks for doc {document_id} "
                f"[source_type={source_type}, user_id={uid_tag}]."
            )
        except Exception as e:
            logger.error(f"Error saving document chunks: {e}")
            raise

    def search_similar_chunks(
        self,
        query: str,
        top_k: int = 5,
        user_id: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """
        Search for similar chunks using query embedding.

        Retrieval strategy:
        - Always includes 'knowledge_base' chunks (shared, no user filter).
        - If user_id is provided, also includes 'user_data' chunks owned by that user.
        - Results from both sources are merged and de-duplicated by chunk_id,
          then trimmed to top_k by similarity distance.

        Args:
            query:   The user's natural language query.
            top_k:   Max number of results to return.
            user_id: The requesting user's ID. Pass None to return only
                     knowledge_base chunks (e.g. for anonymous / admin views).
        """
        try:
            query_embedding = self.generate_embedding(query)

            # --- 1. Fetch knowledge_base chunks (shared, visible to all) ---
            kb_results = self.collection.query(
                query_embeddings=[query_embedding],
                n_results=top_k,
                where={"source_type": "knowledge_base"},
            )

            # --- 2. Fetch user-specific chunks (only if user_id provided) ---
            user_results = None
            if user_id is not None:
                try:
                    user_results = self.collection.query(
                        query_embeddings=[query_embedding],
                        n_results=top_k,
                        where={
                            "$and": [
                                {"source_type": {"$eq": "user_data"}},
                                {"user_id": {"$eq": str(user_id)}},
                            ]
                        },
                    )
                except Exception as e:
                    logger.warning(f"User-data chunk search failed: {e}")
                    user_results = None

            # --- 3. Merge results ---
            merged: Dict[str, Dict] = {}

            def _absorb(results):
                if not results or not results.get("documents"):
                    return
                docs = results["documents"][0]
                metas = results.get("metadatas", [[]])[0]
                dists = results.get("distances", [[None] * len(docs)])[0]
                ids = results.get("ids", [[]])[0]
                for i, doc in enumerate(docs):
                    cid = ids[i] if ids else f"chunk_{i}"
                    if cid not in merged:
                        merged[cid] = {
                            "document": doc,
                            "metadata": metas[i] if metas else {},
                            "distance": dists[i],
                        }

            _absorb(kb_results)
            if user_results:
                _absorb(user_results)

            # Sort merged results by distance (ascending = most relevant first)
            sorted_chunks = sorted(
                merged.values(),
                key=lambda x: x["distance"] if x["distance"] is not None else float("inf"),
            )

            return sorted_chunks[:top_k]

        except Exception as e:
            logger.error(f"Error searching similar chunks: {e}")
            return []

    def delete_document_chunks(self, document_id: int):
        """Delete all chunks for a specific document."""
        try:
            self.collection.delete(where={"document_id": str(document_id)})
            logger.info(f"Deleted chunks for document {document_id}.")
        except Exception as e:
            logger.error(f"Error deleting document chunks: {e}")
