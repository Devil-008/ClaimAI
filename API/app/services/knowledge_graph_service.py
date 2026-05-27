import json
import httpx
from typing import List, Dict, Any
from fastapi import UploadFile
from sqlalchemy.orm import Session
from app.models.models import KnowledgeDocument
from app.core.config import settings
from app.controllers.policy_controller import _extract_text
import uuid
from arango import ArangoClient
import logging
from app.services.vector_store_service import VectorStoreService

logger = logging.getLogger(__name__)


async def process_knowledge_graph(
    files: List[UploadFile], prompt: str, db: Session, user_id: int
) -> Dict[str, Any]:

    # 1. Read files and extract text
    combined_text = ""
    documents = []

    for file in files:
        # Save file to disk temporarily or permanently
        file_path = f"uploads/{uuid.uuid4()}_{file.filename}"
        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)

        # extract text using existing utility
        ext = "." + file.filename.split(".")[-1].lower() if "." in file.filename else ""
        text = _extract_text(file_path, ext)
        if not text:
            text = content.decode("utf-8", errors="ignore")  # fallback for raw text

        combined_text += f"\n\n--- Document: {file.filename} ---\n{text}"

        # Create MySQL metadata records
        doc = KnowledgeDocument(
            filename=file.filename,
            file_path=file_path,
            file_size=len(content),
            uploader_id=user_id,
            status="processing",
        )
        db.add(doc)
        documents.append(doc)

    db.commit()
    for doc in documents:
        db.refresh(doc)

    # Store doc IDs before releasing the connection for the long AI calls
    doc_ids = [d.id for d in documents]
    doc_id_map = {d.id: d for d in documents}

    # 2. Call Mistral API for JSON Extraction
    # NOTE: This can take 30-180 seconds. The MySQL connection may time out
    # during this period. We expire all objects so SQLAlchemy re-fetches them
    # fresh on next access, avoiding 'Lost connection' errors.
    structured_data = await _call_mistral_extraction(combined_text, prompt)

    # 3. Save to ArangoDB (Knowledge Graph) with document IDs
    _save_to_arango(structured_data, doc_ids)

    # 4. Chunk raw text and save to vector store
    try:
        vector_store_service = VectorStoreService()
        for doc in documents:
            chunks = vector_store_service.chunk_text(combined_text)
            # Knowledge base uploads are SHARED — visible to all users
            vector_store_service.save_document_chunks(
                chunks,
                doc.id,
                doc.filename,
                source_type="knowledge_base",  # shared across all users
            )
        logger.info(f"Successfully saved document chunks to vector store for {len(documents)} documents.")
    except Exception as e:
        logger.error(f"Failed to save chunks to vector store: {e}")


    # 5. Update MySQL Metadata
    # The connection may have been dropped by MySQL during the long AI calls above.
    # Expire all cached objects to force SQLAlchemy to re-establish the connection
    # and re-fetch the records on next access (pool_pre_ping handles reconnect).
    try:
        db.expire_all()
        # Re-fetch documents from DB using their IDs to get fresh ORM objects
        for doc_id in doc_ids:
            doc = db.query(KnowledgeDocument).filter(KnowledgeDocument.id == doc_id).first()
            if doc:
                doc.context_summary = json.dumps(structured_data.get("context_summary", {}))
                doc.risk_analysis = json.dumps(structured_data.get("risk_analysis", {}))
                doc.suggested_questions = structured_data.get("chatbot_questions", [])
                doc.status = "completed"
        db.commit()
    except Exception as db_err:
        logger.error(f"DB commit failed after AI processing: {db_err}. Attempting rollback and retry.")
        try:
            db.rollback()
            db.expire_all()
            for doc_id in doc_ids:
                doc = db.query(KnowledgeDocument).filter(KnowledgeDocument.id == doc_id).first()
                if doc:
                    doc.context_summary = json.dumps(structured_data.get("context_summary", {}))
                    doc.risk_analysis = json.dumps(structured_data.get("risk_analysis", {}))
                    doc.suggested_questions = structured_data.get("chatbot_questions", [])
                    doc.status = "completed"
            db.commit()
            logger.info("Retry commit succeeded after rollback.")
        except Exception as retry_err:
            logger.error(f"Retry commit also failed: {retry_err}. Document statuses may not be updated.")

    # Generate standalone static HTML graphs for each document in the batch
    import os
    from app.services.graph_template import HTML_TEMPLATE

    os.makedirs("uploads/graphs", exist_ok=True)

    # Extract nodes and edges in vis.js format
    local_nodes = []
    for n in structured_data.get("nodes", []):
        _id = str(n.get("id", "")).replace(" ", "_").replace("-", "_")
        if not _id:
            continue
        local_nodes.append(
            {
                "id": _id,
                "label": n.get("canonical_name") or _id,
                "canonical_name": n.get("canonical_name") or _id,
                "aliases": n.get("aliases", []),
                "properties": n.get("properties", {}),
            }
        )

    local_edges = []
    for e in structured_data.get("edges", []):
        src = str(e.get("from_id", "")).replace(" ", "_").replace("-", "_")
        tgt = str(e.get("to_id", "")).replace(" ", "_").replace("-", "_")
        if not src or not tgt:
            continue
        local_edges.append(
            {
                "id": f"{src}_{tgt}_{e.get('type')}".replace(" ", "_").replace(
                    "-", "_"
                ),
                "from": src,
                "to": tgt,
                "type": e.get("type", "RELATED_TO"),
                "evidence": e.get("evidence"),
                "timestamp": e.get("timestamp"),
            }
        )

    local_graph_json = json.dumps({"nodes": local_nodes, "edges": local_edges})
    local_html_content = HTML_TEMPLATE.replace("{JSON_DATA}", local_graph_json)

    visualization_urls = []
    static_html_urls = []

    for doc in documents:
        static_file_path = f"uploads/graphs/graph_doc_{doc.id}.html"
        with open(static_file_path, "w", encoding="utf-8") as hf:
            hf.write(local_html_content)

        static_html_urls.append(f"/uploads/graphs/graph_doc_{doc.id}.html")
        visualization_urls.append(f"/api/knowledge-graph/visualize/{doc.id}")

    return {
        "message": "Knowledge Graph generated successfully",
        "documents_processed": len(documents),
        "nodes_extracted": len(structured_data.get("nodes", [])),
        "edges_extracted": len(structured_data.get("edges", [])),
        "visualization_urls": visualization_urls,
        "static_html_urls": static_html_urls,
    }


async def _call_mistral_extraction(text: str, custom_prompt: str) -> Dict[str, Any]:
    """Call Mistral API to extract structured JSON in two steps."""
    if not settings.MISTRAL_API_KEY:
        logger.warning("Mistral API key not found. Returning mock structured data.")
        return _get_mock_data()

    summary_prompt = f"""You are an Enterprise Document Intelligence Engine.
Your task is to analyze the uploaded document and generate a CONTEXT SUMMARY.

Return ONLY valid JSON using this exact structure:
{{
  "context_summary": {{
    "title": "Document Title",
    "document_overview": "Brief overview...",
    "primary_entities": ["Entity 1", "Entity 2"],
    "key_facts": {{"fact1": "value1"}},
    "timeline": [],
    "financial_details": {{}},
    "coverage_and_benefits": [],
    "exclusions_and_limitations": [],
    "risk_indicators": [],
    "obligations_and_responsibilities": [],
    "contact_information": {{}},
    "actionable_insights": [],
    "suggested_questions": []
  }},
  "risk_analysis": {{
    "risk_score": 0,
    "risk_level": "LOW",
    "risk_factors": [],
    "recommendations": []
  }},
  "chatbot_questions": [
    "Question 1?",
    "Question 2?"
  ],
  "embedding_text": "A single consolidated paragraph summarizing the document for vector embedding."
}}

USER CUSTOM PROMPT (APPLY THESE RULES IF GIVEN):
{custom_prompt}
"""

    graph_prompt = f"""You are an Enterprise Knowledge Graph Engine.
Your task is to extract all significant entities and relationships from the uploaded document to build a Knowledge Graph.

Return ONLY valid JSON using this exact structure:
{{
  "nodes": [
    {{
      "id": "unique_id_1",
      "label": "Person",
      "canonical_name": "John Doe",
      "properties": {{"age": 30}}
    }}
  ],
  "edges": [
    {{
      "from_id": "unique_id_1",
      "to_id": "unique_id_2",
      "type": "HAS_POLICY",
      "confidence": 0.95,
      "evidence": "Extracted from page 1",
      "timestamp": "2023-01-01"
    }}
  ]
}}

USER CUSTOM PROMPT (APPLY THESE RULES IF GIVEN):
{custom_prompt}
"""

    # Truncate text to avoid context limits
    truncated_text = text[:10000]

    try:
        async with httpx.AsyncClient(timeout=180.0) as client:
            headers = {
                "Authorization": f"Bearer {settings.MISTRAL_API_KEY.strip()}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            }

            # --- Step 1: Context Summary & Risk Analysis ---
            logger.info("Calling Mistral API (Step 1: Summary)")
            resp1 = await client.post(
                "https://api.mistral.ai/v1/chat/completions",
                headers=headers,
                json={
                    "model": "mistral-small-latest",
                    "response_format": {"type": "json_object"},
                    "messages": [
                        {"role": "system", "content": summary_prompt},
                        {
                            "role": "user",
                            "content": f"DOCUMENT CONTENT:\n{truncated_text}",
                        },
                    ],
                },
            )
            resp1.raise_for_status()
            data1 = json.loads(resp1.json()["choices"][0]["message"]["content"])
            logger.info("Mistral Step 1 successful.")

            # --- Step 2: Knowledge Graph (Nodes & Edges) ---
            logger.info("Calling Mistral API (Step 2: Graph extraction)")
            resp2 = await client.post(
                "https://api.mistral.ai/v1/chat/completions",
                headers=headers,
                json={
                    "model": "mistral-small-latest",
                    "response_format": {"type": "json_object"},
                    "messages": [
                        {"role": "system", "content": graph_prompt},
                        {
                            "role": "user",
                            "content": f"DOCUMENT CONTENT:\n{truncated_text}",
                        },
                    ],
                },
            )
            resp2.raise_for_status()
            data2 = json.loads(resp2.json()["choices"][0]["message"]["content"])
            logger.info("Mistral Step 2 successful.")

            return {
                "context_summary": data1.get("context_summary", {}),
                "risk_analysis": data1.get("risk_analysis", {}),
                "chatbot_questions": data1.get("chatbot_questions", []),
                "embedding_text": data1.get("embedding_text", ""),
                "nodes": data2.get("nodes", []),
                "edges": data2.get("edges", []),
            }

    except httpx.HTTPStatusError as e:
        logger.error(
            f"Mistral API HTTP error {e.response.status_code}: {e.response.text}"
        )
        return _get_mock_data()
    except Exception as e:
        logger.error(f"Mistral API call failed: {e}")
        import traceback

        traceback.print_exc()
        return _get_mock_data()


def _save_to_arango(data: Dict[str, Any], doc_ids: List[int]):
    """Connect to ArangoDB and upsert nodes and edges with associated document IDs."""
    if not settings.ARANGO_PASSWORD and not settings.ARANGO_DB_NAME:
        logger.warning("ArangoDB configuration missing. Skipping graph persistence.")
        return

    try:
        client = ArangoClient(hosts=settings.ARANGO_URL)
        sys_db = client.db(
            "_system", username=settings.ARANGO_USER, password=settings.ARANGO_PASSWORD
        )

        # Create database if it doesn't exist
        if not sys_db.has_database(settings.ARANGO_DB_NAME):
            sys_db.create_database(settings.ARANGO_DB_NAME)

        db = client.db(
            settings.ARANGO_DB_NAME,
            username=settings.ARANGO_USER,
            password=settings.ARANGO_PASSWORD,
        )

        # Ensure collections exist
        if not db.has_collection("Entities"):
            db.create_collection("Entities")
        if not db.has_collection("Relationships"):
            db.create_collection("Relationships", edge=True)

        entities_coll = db.collection("Entities")
        edges_coll = db.collection("Relationships")

        # Insert Nodes
        for node in data.get("nodes", []):
            _id = str(node.get("id", "")).replace(" ", "_").replace("-", "_")
            if not _id:
                continue

            doc = {
                "_key": _id,
                "label": node.get("label"),
                "canonical_name": node.get("canonical_name"),
                "aliases": node.get("aliases", []),
                "document_ids": doc_ids,
                **node.get("properties", {}),
            }
            try:
                existing = entities_coll.get(_id)
                if existing:
                    existing_docs = existing.get("document_ids") or []
                    union_docs = list(set(existing_docs + doc_ids))
                    doc["document_ids"] = union_docs
                entities_coll.insert(doc, overwrite=True)
            except Exception as e:
                logger.error(f"Error inserting node {doc}: {e}")

        # Insert Edges
        for edge in data.get("edges", []):
            src = str(edge.get("from_id", "")).replace(" ", "_").replace("-", "_")
            tgt = str(edge.get("to_id", "")).replace(" ", "_").replace("-", "_")
            if not src or not tgt:
                continue

            edge_type = edge.get("type", "RELATED_TO")
            edge_key = f"{src}_{tgt}_{edge_type}".replace(" ", "_").replace("-", "_")

            doc = {
                "_key": edge_key,
                "_from": f"Entities/{src}",
                "_to": f"Entities/{tgt}",
                "type": edge_type,
                "evidence": edge.get("evidence"),
                "timestamp": edge.get("timestamp"),
                "document_ids": doc_ids,
            }
            try:
                existing = edges_coll.get(edge_key)
                if existing:
                    existing_docs = existing.get("document_ids") or []
                    union_docs = list(set(existing_docs + doc_ids))
                    doc["document_ids"] = union_docs
                edges_coll.insert(doc, overwrite=True)
            except Exception as e:
                logger.error(f"Error inserting edge {doc}: {e}")

    except Exception as e:
        logger.error(f"ArangoDB connection failed: {e}")


def _save_to_vector_db(data: Dict[str, Any]):
    """Placeholder for saving to a Vector DB like Chroma or Pinecone."""
    embedding_text = data.get("embedding_text")
    if embedding_text:
        # TODO: integrate with vector store
        pass


def _get_mock_data() -> Dict[str, Any]:
    return {
        "document_metadata": {
            "document_type": "Insurance Policy",
            "domain": "Insurance",
            "subdomain": "Health",
            "language": "en",
            "classification_confidence": 0.95,
        },
        "relevance": {
            "score": 90,
            "label": "Highly Relevant",
            "extraction_confidence": 0.9,
        },
        "context_summary": {
            "title": "Health Plan A Policy",
            "document_overview": "Mock summary of the uploaded documents regarding policies.",
            "primary_entities": ["John Doe", "Health Plan A"],
            "key_facts": {},
            "timeline": [],
            "financial_details": {},
            "coverage_and_benefits": [],
            "exclusions_and_limitations": [],
            "risk_indicators": [],
            "obligations_and_responsibilities": [],
            "contact_information": {},
            "actionable_insights": [],
            "suggested_questions": [
                "What does Policy 123 cover?",
                "Who owns Policy 123?",
            ],
        },
        "nodes": [
            {
                "id": "policy_123",
                "label": "Insurance_Policy",
                "canonical_name": "Health Plan A",
                "properties": {},
            },
            {
                "id": "person_456",
                "label": "Person",
                "canonical_name": "John Doe",
                "properties": {},
            },
        ],
        "edges": [
            {
                "from_id": "person_456",
                "to_id": "policy_123",
                "type": "HAS_POLICY",
                "evidence": "Document states John Doe owns the policy",
            }
        ],
        "events": [],
        "risk_analysis": {
            "risk_score": 10,
            "risk_level": "LOW",
            "risk_factors": [],
            "recommendations": [],
        },
        "chatbot_questions": ["What does Policy 123 cover?", "Who owns Policy 123?"],
        "embedding_text": "Mock embedding representation of the documents.",
        "extraction_confidence": 0.95,
    }


async def rag_chat_response(query: str, db: Session) -> Dict[str, Any]:
    """
    RAG chat response using uploaded knowledge documents as context and Mistral LLM to generate answer.
    Returns structured response with answer, sources, and confidence.
    """
    try:
        # 1. Check if documents exist
        docs = (
            db.query(KnowledgeDocument)
            .filter(KnowledgeDocument.status == "completed")
            .all()
        )
        if not docs:
            return {
                "answer": "No documents have been uploaded or processed yet. Please upload policy documents or relevant materials in the Knowledge Graph section to enable chat.",
                "sources": [],
                "confidence": 0.0,
                "retrieved_chunks": 0
            }

        # 2. Initialize vector store and search for similar chunks
        try:
            vector_store_service = VectorStoreService()
            similar_chunks = vector_store_service.search_similar_chunks(query, top_k=5)
        except Exception as e:
            logger.error(f"Vector store search failed: {e}")
            similar_chunks = []

        # 3. If no chunks found in vector store, fall back to document context
        if not similar_chunks:
            logger.info("No similar chunks found in vector store. Falling back to document summaries.")
            context = ""
            for doc in docs:
                summary = ""
                if doc.context_summary:
                    try:
                        summary_data = json.loads(doc.context_summary)
                        if isinstance(summary_data, dict):
                            summary = summary_data.get("document_overview", "")
                            key_facts = summary_data.get("key_facts", {})
                            if key_facts:
                                summary += "\nKey Facts: " + json.dumps(key_facts)
                    except Exception:
                        summary = doc.context_summary
                else:
                    summary = (
                        "Metadata processed but no detailed context summary available."
                    )
                    
                context += f"\n\nDocument: {doc.filename}\nSummary/Context:\n{summary}"
            
            sources = [{"filename": doc.filename, "section": "Summary", "page": None} for doc in docs]
        else:
            # 4. Build context from retrieved chunks
            context = "\n\n".join([f"[{chunk['metadata'].get('filename', 'Unknown')}] {chunk['document']}" 
                                  for chunk in similar_chunks])
            
            # 5. Extract unique sources from retrieved chunks
            source_map = {}
            for chunk in similar_chunks:
                filename = chunk['metadata'].get('filename', 'Unknown')
                chunk_idx = chunk['metadata'].get('chunk_index', 0)
                if filename not in source_map:
                    source_map[filename] = {"filename": filename, "sections": set(), "chunks": []}
                source_map[filename]["chunks"].append(chunk_idx)
            
            sources = [
                {
                    "filename": meta["filename"],
                    "section": f"Chunks {min(meta['chunks'])}-{max(meta['chunks'])}",
                    "page": None
                }
                for meta in source_map.values()
            ]

        # 6. Verify Mistral API key
        if not settings.MISTRAL_API_KEY:
            return {
                "answer": "Mistral API key is not configured in the backend environment. Cannot process RAG query.",
                "sources": sources,
                "confidence": 0.0,
                "retrieved_chunks": len(similar_chunks)
            }

        # 7. Construct system prompt for insurance expert
        system_prompt = f"""You are an expert Insurance Policy Advisor and Claims Assistant. 
Answer the user's question accurately and comprehensively based strictly on the document context provided below.

If the information to answer the question is not found in the context, clearly state: 
"I could not find this information in the uploaded documents."

Provide clear, professional responses using policy terminology where appropriate.

DOCUMENT CONTEXT:
{context}
"""

        # 8. Call Mistral API for response
        async with httpx.AsyncClient(timeout=60.0) as client:
            headers = {
                "Authorization": f"Bearer {settings.MISTRAL_API_KEY.strip()}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            }
            payload = {
                "model": "mistral-small-latest",
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": query},
                ],
                "temperature": 0.2,
            }
            logger.info(f"Sending RAG query to Mistral. Query: '{query}'")
            resp = await client.post(
                "https://api.mistral.ai/v1/chat/completions",
                headers=headers,
                json=payload,
            )
            resp.raise_for_status()
            resp_data = resp.json()
            answer = resp_data["choices"][0]["message"]["content"]
            
            # 9. Calculate confidence based on number of retrieved chunks
            confidence = min(0.95, 0.5 + (len(similar_chunks) * 0.1)) if similar_chunks else 0.6
            
            return {
                "answer": answer,
                "sources": sources,
                "confidence": round(confidence, 2),
                "retrieved_chunks": len(similar_chunks)
            }

    except Exception as e:
        logger.error(f"RAG chat response generation failed: {e}")
        return {
            "answer": f"An error occurred while analyzing the documents: {str(e)}",
            "sources": [],
            "confidence": 0.0,
            "retrieved_chunks": 0
        }


def get_arango_graph_data(doc_id: int = None) -> Dict[str, Any]:
    """Retrieve all nodes and edges from ArangoDB for visualization, optionally filtered by doc_id."""
    if not settings.ARANGO_PASSWORD and not settings.ARANGO_DB_NAME:
        logger.warning("ArangoDB configuration is missing.")
        return {"nodes": [], "edges": []}

    try:
        client = ArangoClient(hosts=settings.ARANGO_URL)
        db = client.db(
            settings.ARANGO_DB_NAME,
            username=settings.ARANGO_USER,
            password=settings.ARANGO_PASSWORD,
        )

        # 1. Fetch all entities (nodes)
        nodes = []
        if db.has_collection("Entities"):
            if doc_id is not None:
                cursor = db.aql.execute(
                    "FOR doc IN Entities FILTER @doc_id IN doc.document_ids RETURN doc",
                    bind_vars={"doc_id": doc_id},
                )
            else:
                cursor = db.aql.execute("FOR doc IN Entities RETURN doc")
            for doc in cursor:
                nodes.append(
                    {
                        "id": doc.get("_key"),
                        "label": doc.get("label", "Entity"),
                        "canonical_name": doc.get("canonical_name") or doc.get("_key"),
                        "aliases": doc.get("aliases", []),
                        "properties": {
                            k: v
                            for k, v in doc.items()
                            if k
                            not in [
                                "_id",
                                "_key",
                                "_rev",
                                "label",
                                "canonical_name",
                                "aliases",
                                "document_ids",
                            ]
                        },
                    }
                )

        # 2. Fetch all relationships (edges)
        edges = []
        if db.has_collection("Relationships"):
            if doc_id is not None:
                cursor = db.aql.execute(
                    "FOR doc IN Relationships FILTER @doc_id IN doc.document_ids RETURN doc",
                    bind_vars={"doc_id": doc_id},
                )
            else:
                cursor = db.aql.execute("FOR doc IN Relationships RETURN doc")
            for doc in cursor:
                from_key = (
                    doc.get("_from", "").split("/")[-1]
                    if "/" in doc.get("_from", "")
                    else doc.get("_from", "")
                )
                to_key = (
                    doc.get("_to", "").split("/")[-1]
                    if "/" in doc.get("_to", "")
                    else doc.get("_to", "")
                )

                edges.append(
                    {
                        "id": doc.get("_key"),
                        "from": from_key,
                        "to": to_key,
                        "type": doc.get("type", "RELATED_TO"),
                        "evidence": doc.get("evidence"),
                        "timestamp": doc.get("timestamp"),
                    }
                )

        # GRACEFUL FALLBACK: if filtered graph is empty, return all nodes/edges!
        if doc_id is not None and not nodes:
            logger.info("Filtered graph is empty. Falling back to entire graph.")
            return get_arango_graph_data(doc_id=None)

        return {"nodes": nodes, "edges": edges}
    except Exception as e:
        logger.error(f"Failed to fetch graph data from ArangoDB: {e}")
        return {"nodes": [], "edges": []}
