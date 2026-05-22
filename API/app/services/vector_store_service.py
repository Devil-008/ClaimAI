import chromadb
from sentence_transformers import SentenceTransformer
from typing import List, Dict, Any
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

    def save_document_chunks(self, chunks: List[str], document_id: int, filename: str):
        """Save document chunks with embeddings to vector store."""
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
                        }
                    ],
                )
            logger.info(f"Saved {len(chunks)} chunks for document {document_id}.")
        except Exception as e:
            logger.error(f"Error saving document chunks: {e}")
            raise

    def search_similar_chunks(self, query: str, top_k: int = 5) -> List[Dict[str, Any]]:
        """Search for similar chunks using query embedding."""
        try:
            query_embedding = self.generate_embedding(query)
            results = self.collection.query(
                query_embeddings=[query_embedding], n_results=top_k
            )

            formatted_results = []
            if results and results.get("documents"):
                for i, doc in enumerate(results["documents"][0]):
                    formatted_results.append(
                        {
                            "document": doc,
                            "metadata": (
                                results["metadatas"][0][i]
                                if results["metadatas"]
                                else {}
                            ),
                            "distance": (
                                results["distances"][0][i]
                                if results["distances"]
                                else None
                            ),
                        }
                    )
            return formatted_results
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
