from fastapi import APIRouter, File, UploadFile, Form, HTTPException, Depends
from typing import List
from sqlalchemy.orm import Session
from app.core.config import settings
from app.database.connection import get_db
from app.models.models import User, KnowledgeDocument
from app.controllers.auth_controller import get_current_user
from app.services.knowledge_graph_service import process_knowledge_graph

router = APIRouter(prefix="/api/knowledge-graph", tags=["Knowledge Graph"])

@router.get("/documents", summary="Get Uploaded Knowledge Documents")
async def get_documents(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    docs = db.query(KnowledgeDocument).order_by(KnowledgeDocument.created_at.desc()).all()
    # Also fetch user names
    users = {u.id: u.full_name or u.email for u in db.query(User).all()}
    
    return [
        {
            "id": d.id,
            "filename": d.filename,
            "file_size": d.file_size,
            "status": d.status,
            "created_at": d.created_at,
            "uploader_name": users.get(d.uploader_id, "Unknown"),
            "risk_analysis": d.risk_analysis,
            "context_summary": d.context_summary
        }
        for d in docs
    ]

@router.post("/generate", summary="Generate Knowledge Graph from Documents")
async def generate_knowledge_graph(
    files: List[UploadFile] = File(...),
    prompt: str = Form(default=""),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Handles document uploads for Mistral API and ArangoDB integration.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")
    
    result = await process_knowledge_graph(files, prompt, db, current_user.id)
    return result

@router.delete("/documents/{doc_id}", summary="Delete a Knowledge Document")
async def delete_document(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    import os
    doc = db.query(KnowledgeDocument).filter(KnowledgeDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Optionally remove file from disk
    if doc.file_path and os.path.exists(doc.file_path):
        try:
            os.remove(doc.file_path)
        except Exception:
            pass

    db.delete(doc)
    db.commit()
    return {"message": "Document deleted successfully"}

from pydantic import BaseModel

class ChatRequest(BaseModel):
    query: str

from app.services.knowledge_graph_service import rag_chat_response

@router.post("/chat", summary="Chat with your uploaded Knowledge Graph/Documents")
async def rag_chat(
    request: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    RAG chat endpoint. Send user queries to search context from uploaded documents and reply via LLM.
    """
    if not request.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")
        
    answer = await rag_chat_response(request.query, db)
    return {"response": answer}


from fastapi.responses import HTMLResponse
from app.services.knowledge_graph_service import get_arango_graph_data
from app.services.graph_template import HTML_TEMPLATE
import json

@router.get("/visualize", response_class=HTMLResponse, summary="Serve Gorgeous Graph Visualizer")
async def visualize_graph():
    """
    Directly serve a breathtaking, interactive cyberpunk-themed network graph visualization
    of the ArangoDB Knowledge Graph, with live search, zoom, drag-and-drop, and detailed inspect tooltips.
    """
    graph_data = get_arango_graph_data()
    json_data = json.dumps(graph_data)
    
    html_content = HTML_TEMPLATE.replace("{JSON_DATA}", json_data)
    return HTMLResponse(content=html_content)

@router.get("/visualize/{doc_id}", response_class=HTMLResponse, summary="Serve Gorgeous Graph Visualizer filtered by Document ID")
async def visualize_graph_by_doc_id(doc_id: int):
    """
    Directly serve an interactive network graph visualization of the ArangoDB Knowledge Graph
    filtered specifically to only show entities/relationships derived from a single Document ID.
    """
    graph_data = get_arango_graph_data(doc_id=doc_id)
    json_data = json.dumps(graph_data)
    
    html_content = HTML_TEMPLATE.replace("{JSON_DATA}", json_data)
    return HTMLResponse(content=html_content)



