import os
import urllib.parse
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Config variables from .env
DB_USER = "aiinhome"
DB_PASSWORD = urllib.parse.quote_plus("Aiin@2026")
DB_HOST = "72.61.226.68"
DB_PORT = 3306
DB_NAME = "claims_automation_db"

DATABASE_URL = f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

def main():
    try:
        engine = create_engine(DATABASE_URL)
        SessionLocal = sessionmaker(bind=engine)
        session = SessionLocal()
        
        result = session.execute(text("SELECT id, filename, file_path FROM knowledge_documents WHERE id IN (7, 8)"))
        for row in result:
            doc_id = row[0]
            filename = row[1]
            path = row[2]
            # Absolute path
            abs_path = os.path.join("d:\\Agent\\Agent-6\\Claims_Automation_Agent\\API", path)
            exists = os.path.exists(abs_path)
            print(f"Doc {doc_id}: {filename} at {abs_path} - Exists: {exists}")
            
        session.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
