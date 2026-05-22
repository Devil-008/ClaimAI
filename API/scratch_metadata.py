import os
import urllib.parse
import json
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
        
        # Query doc 7
        result = session.execute(text("SELECT id, filename, risk_analysis, context_summary, suggested_questions FROM knowledge_documents WHERE id IN (7, 8)"))
        for row in result:
            doc_id = row[0]
            filename = row[1]
            risk = row[2]
            summary = row[3]
            questions = row[4]
            
            print(f"\n=================== DOCUMENT ID: {doc_id} ({filename}) ===================")
            
            try:
                summary_data = json.loads(summary) if summary else {}
                print("Primary Entities in Context Summary:")
                print(summary_data.get("primary_entities", []))
            except Exception as e:
                print(f"Error parsing summary: {e}")
                
            try:
                # Let's count characters in summary
                print(f"Summary length: {len(summary) if summary else 0} chars")
                print(f"Risk analysis length: {len(risk) if risk else 0} chars")
                print(f"Questions: {questions}")
            except Exception as e:
                print(f"Error: {e}")
            
        session.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
