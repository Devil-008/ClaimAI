"""
RAG Controller — Retrieval Augmented Generation for Claims Assistant
Handles LLM-powered policy Q&A using ChromaDB and Mistral API
"""

import httpx
import logging
import secrets
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session
from datetime import datetime

from app.database.connection import get_db
from app.services.vector_store_service import VectorStoreService
from app.core.config import settings
from app.controllers.auth_controller import get_current_user, User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/rag", tags=["RAG"])

# Initialize vector store service
vector_store_service = VectorStoreService()

# ── Request/Response Schemas ────────────────────────────────────


class RAGQueryRequest(BaseModel):
    query: str
    session_id: Optional[int] = None  # pass existing session id to continue chat
    policy_id: Optional[int] = None
    top_k: int = 5


class RAGQueryResponse(BaseModel):
    answer: str
    sources: List[Dict[str, Any]]
    confidence: float
    retrieved_chunks: int
    session_id: Optional[int] = None  # returned so UI knows which session was used


class SessionOut(BaseModel):
    id: int
    title: str
    started_at: datetime
    message_count: int


class MessageOut(BaseModel):
    id: int
    role: str
    content: str
    created_at: datetime


# ── Helper Functions ────────────────────────────────────────────


async def _call_mistral_api(prompt: str) -> Dict[str, Any]:
    """Call the Mistral API with the provided prompt and return the response."""
    if not settings.MISTRAL_API_KEY:
        raise ValueError("Mistral API key is not configured.")

    try:
        async with httpx.AsyncClient(timeout=180.0) as client:
            headers = {
                "Authorization": f"Bearer {settings.MISTRAL_API_KEY.strip()}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            }

            response = await client.post(
                "https://api.mistral.ai/v1/chat/completions",
                headers=headers,
                json={
                    "model": "mistral-small-latest",
                    "messages": [{"role": "system", "content": prompt}],
                },
            )
            response.raise_for_status()
            response_data = response.json()

            # Extract answer from response
            answer = (
                response_data.get("choices", [{}])[0]
                .get("message", {})
                .get("content", "No answer provided.")
            )

            return {
                "answer": answer,
                "confidence": 0.85,  # Default confidence for successful API calls
            }

    except httpx.HTTPStatusError as e:
        logger.error(
            f"Mistral API HTTP error {e.response.status_code}: {e.response.text}"
        )
        return {"answer": "Error calling Mistral API.", "confidence": 0.0}
    except Exception as e:
        logger.error(f"Error calling Mistral API: {e}")
        return {"answer": "Error calling Mistral API.", "confidence": 0.0}


def _get_session_title(db: Session, session_id: int) -> str:
    """Derive a title from the first user message in the session."""
    row = db.execute(
        text(
            "SELECT message FROM chat_messages "
            "WHERE session_id = :sid AND sender = 'user' "
            "ORDER BY created_at ASC LIMIT 1"
        ),
        {"sid": session_id},
    ).fetchone()
    if row:
        words = row[0].strip().split()
        title = " ".join(words[:7])
        return (title[:80] + "\u2026") if len(title) > 80 else title
    return "New Chat"


# ── Session Endpoints ──────────────────────────────────────────


@router.get("/sessions", response_model=List[SessionOut])
def list_sessions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return all RAG chat sessions for the current user, newest first."""
    rows = db.execute(
        text(
            "SELECT s.id, s.started_at, COUNT(m.id) AS msg_count "
            "FROM chat_sessions s "
            "LEFT JOIN chat_messages m ON m.session_id = s.id "
            "WHERE s.user_id = :uid AND s.channel = 'web' "
            "GROUP BY s.id, s.started_at "
            "ORDER BY s.started_at DESC"
        ),
        {"uid": current_user.id},
    ).fetchall()

    result = []
    for row in rows:
        title = _get_session_title(db, row[0])
        result.append(
            SessionOut(
                id=row[0],
                title=title,
                started_at=row[1],
                message_count=row[2],
            )
        )
    return result


@router.post("/sessions", response_model=SessionOut)
def create_session(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new empty RAG chat session."""
    token = secrets.token_urlsafe(16)
    db.execute(
        text(
            "INSERT INTO chat_sessions (user_id, session_token, channel, status) "
            "VALUES (:uid, :token, 'web', 'active')"
        ),
        {"uid": current_user.id, "token": token},
    )
    db.commit()
    row = db.execute(
        text("SELECT id, started_at FROM chat_sessions WHERE session_token = :token"),
        {"token": token},
    ).fetchone()
    return SessionOut(id=row[0], title="New Chat", started_at=row[1], message_count=0)


@router.delete("/sessions/{session_id}")
def delete_session(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a session and all its messages."""
    check = db.execute(
        text("SELECT id FROM chat_sessions WHERE id = :sid AND user_id = :uid"),
        {"sid": session_id, "uid": current_user.id},
    ).fetchone()
    if not check:
        raise HTTPException(status_code=404, detail="Session not found")
    db.execute(
        text("DELETE FROM chat_messages WHERE session_id = :sid"),
        {"sid": session_id},
    )
    db.execute(
        text("DELETE FROM chat_sessions WHERE id = :sid"),
        {"sid": session_id},
    )
    db.commit()
    return {"ok": True}


@router.get("/sessions/{session_id}/messages", response_model=List[MessageOut])
def get_session_messages(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return all messages for a session in chronological order."""
    check = db.execute(
        text("SELECT id FROM chat_sessions WHERE id = :sid AND user_id = :uid"),
        {"sid": session_id, "uid": current_user.id},
    ).fetchone()
    if not check:
        raise HTTPException(status_code=404, detail="Session not found")

    rows = db.execute(
        text(
            "SELECT id, sender, message, created_at "
            "FROM chat_messages WHERE session_id = :sid "
            "ORDER BY created_at ASC"
        ),
        {"sid": session_id},
    ).fetchall()

    return [
        MessageOut(
            id=r[0],
            role="assistant" if r[1] == "agent" else "user",
            content=r[2],
            created_at=r[3],
        )
        for r in rows
    ]


# ── Main RAG Endpoint ───────────────────────────────────────────


@router.post("/chat", response_model=RAGQueryResponse)
async def rag_chat_response(
    req: RAGQueryRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RAGQueryResponse:
    """
    Retrieval Augmented Generation endpoint for policy Q&A.

    1. Validate input
    2. Resolve or create a ChatSession
    3. Search ChromaDB for relevant chunks
    4. Build context from retrieved chunks
    5. Construct system prompt
    6. Call Mistral API
    7. Persist messages
    8. Return structured response with sources
    """
    try:
        # 1. Validate input
        query = req.query.strip()
        if not query:
            raise ValueError("Query cannot be empty.")

        if len(query) > 5000:
            raise ValueError("Query exceeds maximum length of 5000 characters.")

        sources = []
        relevant_chunks = []

        # 2. Resolve or create a ChatSession
        if req.session_id:
            check = db.execute(
                text(
                    "SELECT id FROM chat_sessions WHERE id = :sid AND user_id = :uid"
                ),
                {"sid": req.session_id, "uid": current_user.id},
            ).fetchone()
            if not check:
                raise HTTPException(status_code=404, detail="Session not found")
            session_id = req.session_id
        else:
            token = secrets.token_urlsafe(16)
            db.execute(
                text(
                    "INSERT INTO chat_sessions (user_id, session_token, channel, status) "
                    "VALUES (:uid, :token, 'web', 'active')"
                ),
                {"uid": current_user.id, "token": token},
            )
            db.flush()
            row = db.execute(
                text(
                    "SELECT id FROM chat_sessions WHERE session_token = :token"
                ),
                {"token": token},
            ).fetchone()
            session_id = row[0]

        # 3. Check if Mistral API key is configured
        if not settings.MISTRAL_API_KEY:
            return RAGQueryResponse(
                answer="Mistral API key is not configured in the backend environment. Cannot process RAG query.",
                sources=sources,
                confidence=0.0,
                retrieved_chunks=0,
                session_id=session_id,
            )

        # 4. Search ChromaDB for relevant chunks
        # Returns: shared knowledge_base chunks (all users) + user's own user_data chunks
        try:
            relevant_chunks = vector_store_service.search_similar_chunks(
                query, top_k=req.top_k, user_id=current_user.id
            )
        except Exception as e:
            logger.error(f"Error searching vector store: {e}")
            relevant_chunks = []

        # 5. Build context — vector chunks first, fallback to DB summaries
        if relevant_chunks:
            context = "\n\n".join(
                [
                    f"[{chunk['metadata'].get('filename', 'Unknown')}] {chunk['document']}"
                    for chunk in relevant_chunks
                ]
            )
            sources = [
                {
                    "filename": chunk["metadata"].get("filename", "Unknown"),
                    "section": f"Chunk {chunk['metadata'].get('chunk_index', 0)}",
                    "page": None,
                    "distance": chunk.get("distance", None),
                }
                for chunk in relevant_chunks
            ]
        else:
            context = "No relevant information found in the knowledge base."
            sources = []

        # 6. Construct system prompt for Mistral LLM
        system_prompt = f"""You are an expert Insurance Policy Advisor and Claims Assistant.
Use ONLY the retrieved document excerpts to answer the user's question accurately and helpfully.

If the answer is not explicitly present in the retrieved context, clearly state:
"I could not find this specific information in the uploaded policy documents."

Provide:
1. Accurate explanation of the policy term/question.
2. Coverage details and any exclusions if relevant.
3. Benefits and limitations if relevant.
4. Clear source references (document name, section).
5. Your confidence level (High, Medium, Low) based on document clarity.

User Query: {query}

Context from Policy Documents:
{context}

Answer:"""

        # 7. Call Mistral API with constructed prompt
        try:
            response = await _call_mistral_api(system_prompt)
            answer = response.get("answer", "No answer provided.")
            confidence = response.get("confidence", 0.0)
        except Exception as e:
            logger.error(f"Mistral API call failed: {e}")
            answer = (
                "An error occurred while processing your request. Please try again."
            )
            confidence = 0.0

        # 8. Persist user message then assistant reply into chat_messages
        db.execute(
            text(
                "INSERT INTO chat_messages (session_id, sender, message) "
                "VALUES (:sid, 'user', :msg)"
            ),
            {"sid": session_id, "msg": query},
        )
        db.execute(
            text(
                "INSERT INTO chat_messages (session_id, sender, message) "
                "VALUES (:sid, 'agent', :msg)"
            ),
            {"sid": session_id, "msg": answer},
        )
        db.commit()

        # 9. Return structured response
        return RAGQueryResponse(
            answer=answer,
            sources=sources,
            confidence=confidence,
            retrieved_chunks=len(relevant_chunks),
            session_id=session_id,
        )

    except HTTPException:
        raise
    except ValueError as ve:
        logger.error(f"Validation error in rag_chat_response: {ve}")
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error(f"Error in rag_chat_response: {e}")
        return RAGQueryResponse(
            answer="An unexpected error occurred while processing your request.",
            sources=[],
            confidence=0.0,
            retrieved_chunks=0,
        )


@router.get("/health")
async def rag_health():
    """Health check for RAG service."""
    try:
        # Try to verify vector store is accessible
        vector_store_service.collection
        is_mistral_configured = bool(settings.MISTRAL_API_KEY)

        return {
            "status": "healthy",
            "vector_store": "operational",
            "mistral_configured": is_mistral_configured,
        }
    except Exception as e:
        logger.error(f"RAG health check failed: {e}")
        return {"status": "degraded", "error": str(e)}
