import os
import sys
import json
import asyncio
import urllib.parse

# Setup path so imports work
sys.path.append("d:\\Agent\\Agent-6\\Claims_Automation_Agent\\API")

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from app.core.config import settings
from app.models.models import KnowledgeDocument
from app.controllers.policy_controller import _extract_text
from app.services.knowledge_graph_service import _call_mistral_extraction, _save_to_arango
from app.services.graph_template import HTML_TEMPLATE

# Config variables from .env
DB_USER = "aiinhome"
DB_PASSWORD = urllib.parse.quote_plus("Aiin@2026")
DB_HOST = "72.61.226.68"
DB_PORT = 3306
DB_NAME = "claims_automation_db"

DATABASE_URL = f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

async def reprocess_doc(doc_id: int, session):
    print(f"\n--- Reprocessing Document ID: {doc_id} ---")
    doc = session.query(KnowledgeDocument).filter(KnowledgeDocument.id == doc_id).first()
    if not doc:
        print(f"Document {doc_id} not found in MySQL.")
        return
        
    abs_path = os.path.join("d:\\Agent\\Agent-6\\Claims_Automation_Agent\\API", doc.file_path)
    print(f"File Path: {abs_path}")
    
    if not os.path.exists(abs_path):
        print(f"File does not exist at {abs_path}")
        return
        
    # 1. Extract text
    print("Extracting text from PDF...")
    text_content = _extract_text(abs_path, ".pdf")
    if not text_content:
        with open(abs_path, "rb") as f:
            content = f.read()
            text_content = content.decode('utf-8', errors='ignore')
            
    print(f"Extracted text length: {len(text_content)} chars")
    
    # 2. Call Mistral
    print("Calling Mistral API for JSON extraction...")
    structured_data = await _call_mistral_extraction(text_content, "")
    print(f"Extracted nodes: {len(structured_data.get('nodes', []))}, edges: {len(structured_data.get('edges', []))}")
    
    # 3. Save to ArangoDB
    print("Saving to ArangoDB...")
    _save_to_arango(structured_data, [doc_id])
    print("Saved to ArangoDB.")
    
    # 4. Update MySQL Metadata
    print("Updating MySQL metadata...")
    doc.context_summary = json.dumps(structured_data.get("context_summary", {}))
    doc.risk_analysis = json.dumps(structured_data.get("risk_analysis", {}))
    doc.suggested_questions = structured_data.get("chatbot_questions", [])
    doc.status = "completed"
    session.commit()
    print("MySQL updated.")
    
    # 5. Generate and save HTML graph
    print("Generating HTML graph...")
    os.makedirs("d:\\Agent\\Agent-6\\Claims_Automation_Agent\\API\\uploads\\graphs", exist_ok=True)
    
    local_nodes = []
    for n in structured_data.get("nodes", []):
        _id = str(n.get("id", "")).replace(" ", "_").replace("-", "_")
        if not _id: continue
        local_nodes.append({
            "id": _id,
            "label": n.get("canonical_name") or _id,
            "canonical_name": n.get("canonical_name") or _id,
            "aliases": n.get("aliases", []),
            "properties": n.get("properties", {})
        })
        
    local_edges = []
    for e in structured_data.get("edges", []):
        src = str(e.get("from_id", "")).replace(" ", "_").replace("-", "_")
        tgt = str(e.get("to_id", "")).replace(" ", "_").replace("-", "_")
        if not src or not tgt: continue
        local_edges.append({
            "id": f"{src}_{tgt}_{e.get('type')}".replace(" ", "_").replace("-", "_"),
            "from": src,
            "to": tgt,
            "type": e.get("type", "RELATED_TO"),
            "evidence": e.get("evidence"),
            "timestamp": e.get("timestamp")
        })
        
    local_graph_json = json.dumps({"nodes": local_nodes, "edges": local_edges})
    local_html_content = HTML_TEMPLATE.replace("{JSON_DATA}", local_graph_json)
    
    static_file_path = f"d:\\Agent\\Agent-6\\Claims_Automation_Agent\\API\\uploads\\graphs\\graph_doc_{doc_id}.html"
    with open(static_file_path, "w", encoding="utf-8") as hf:
        hf.write(local_html_content)
    print(f"HTML graph written to {static_file_path}")

async def main():
    engine = create_engine(DATABASE_URL)
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()
    
    try:
        # Reprocess doc 7 and 8
        await reprocess_doc(7, session)
        await reprocess_doc(8, session)
        print("\nAll reprocessing complete!")
    except Exception as e:
        print(f"Error in main: {e}")
    finally:
        session.close()

if __name__ == "__main__":
    asyncio.run(main())
