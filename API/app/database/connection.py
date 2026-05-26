from urllib.parse import quote_plus
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

# quote_plus encodes special chars in password (@ # % etc.)
# so they don't break the connection URL parser
_pw = quote_plus(settings.DB_PASSWORD)

DATABASE_URL = (
    f"mysql+pymysql://{settings.DB_USER}:{_pw}"
    f"@{settings.DB_HOST}:{settings.DB_PORT}/{settings.DB_NAME}"
)

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,      # Test connection health before using from pool
    pool_recycle=1800,       # Recycle connections every 30 min (before MySQL wait_timeout)
    pool_size=5,             # Keep 5 persistent connections
    max_overflow=10,         # Allow up to 10 extra connections under load
    pool_timeout=30,         # Wait up to 30s for a free connection
    echo=(settings.APP_ENV == "development"),
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
