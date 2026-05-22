from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
from contextlib import asynccontextmanager
from app.controllers import (
    auth_controller,
    claims_controller,
    dashboard_controller,
    fnol_controller,
    policy_controller,
    knowledge_graph_controller,
    notifications_controller,
    email_controller,
    rag_controller,
)
from app.database.connection import engine, Base
import app.models.models as models
from app.core.config import settings
from app.services.escalation_monitor import start_escalation_monitor

models.Base.metadata.create_all(bind=engine)

# Auto-migrate: Add file_size column if it doesn't exist
from sqlalchemy import text

try:
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE claims ADD COLUMN adjuster_recommended_action VARCHAR(50) NULL;"))
except Exception:
    pass

try:
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE claims ADD COLUMN adjuster_recommended_amount DECIMAL(15, 2) NULL;"))
except Exception:
    pass

try:
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE claims ADD COLUMN adjuster_recommended_notes TEXT NULL;"))
except Exception:
    pass

# try:
#     with engine.begin() as conn:
#         conn.execute(text("ALTER TABLE knowledge_documents ADD COLUMN file_size INT;"))
# except Exception:
#     pass  # Column already exists or table doesn't exist yet

# try:
#     with engine.begin() as conn:
#         conn.execute(text("ALTER TABLE policies ADD COLUMN extra_details TEXT;"))
# except Exception:
#     pass

# try:
#     with engine.begin() as conn:
#         conn.execute(
#             text("ALTER TABLE claims ADD COLUMN escalation_assignee_id INT NULL;")
#         )
# except Exception:
#     pass

# try:
#     with engine.begin() as conn:
#         conn.execute(
#             text(
#                 "ALTER TABLE claims ADD COLUMN escalation_assignee_role VARCHAR(50) NULL;"
#             )
#         )
# except Exception:
#     pass

# try:
#     with engine.begin() as conn:
#         conn.execute(
#             text(
#                 "ALTER TABLE claims ADD COLUMN escalation_level INT NOT NULL DEFAULT 0;"
#             )
#         )
# except Exception:
#     pass

# try:
#     with engine.begin() as conn:
#         conn.execute(
#             text("ALTER TABLE claims ADD COLUMN escalation_started_at DATETIME NULL;")
#         )
# except Exception:
#     pass

# try:
#     with engine.begin() as conn:
#         conn.execute(
#             text(
#                 "ALTER TABLE claims ADD COLUMN escalation_next_check_at DATETIME NULL;"
#             )
#         )
# except Exception:
#     pass

# try:
#     with engine.begin() as conn:
#         conn.execute(
#             text(
#                 "ALTER TABLE claims ADD COLUMN escalation_last_notified_at DATETIME NULL;"
#             )
#         )
# except Exception:
#     pass

# try:
#     with engine.begin() as conn:
#         conn.execute(
#             text(
#                 "ALTER TABLE claims ADD COLUMN escalation_last_status VARCHAR(50) NULL;"
#             )
#         )
# except Exception:
#     pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    start_escalation_monitor()
    yield


app = FastAPI(
    title="ClaimAI — Claims Automation Agent API",
    description="Multi-agent AI claims automation platform — A1 through A8",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

# ── CORS (open for development) ───────────────────────────────
# allow_origins=["*"] with allow_credentials=False lets any origin
# call the API without browser CORS errors.
# For production, replace "*" with your exact frontend domain.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # open to all origins
    allow_credentials=False,  # must be False when origins=["*"]
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────
app.include_router(auth_controller.router, prefix="/api")
app.include_router(claims_controller.router, prefix="/api")
app.include_router(dashboard_controller.router, prefix="/api")
app.include_router(fnol_controller.router, prefix="/api")
app.include_router(policy_controller.router, prefix="/api")
app.include_router(notifications_controller.router, prefix="/api")
app.include_router(email_controller.router, prefix="/api")
app.include_router(rag_controller.router, prefix="/api")
app.include_router(knowledge_graph_controller.router)

# Serve uploaded files (damage photos etc.)
os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "ClaimAI API"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

