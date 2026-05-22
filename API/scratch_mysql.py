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
        
        print("Connected to MySQL successfully!")
        
        # Run raw query to get all documents
        result = session.execute(text("SELECT id, filename, status, created_at FROM knowledge_documents ORDER BY id DESC"))
        print("\nAll Knowledge Documents in MySQL:")
        for row in result:
            print(f"- ID: {row[0]}, Filename: {row[1]}, Status: {row[2]}, Created At: {row[3]}")
            
        session.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
