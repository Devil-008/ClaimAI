import os
import sys
from arango import ArangoClient

ARANGO_URL = "https://466751ecd50f.arangodb.cloud:8529"
ARANGO_DB_NAME = "TRAVEL_I9VEMB9A"
ARANGO_USER = "root"
ARANGO_PASSWORD = "DpB4pFhJppeGpXP4doIT"

def main():
    try:
        client = ArangoClient(hosts=ARANGO_URL)
        db = client.db(ARANGO_DB_NAME, username=ARANGO_USER, password=ARANGO_PASSWORD)
        
        print("Connected to ArangoDB successfully!")
        
        # 1. Total counts
        entities_count = db.collection('Entities').count() if db.has_collection('Entities') else 0
        relationships_count = db.collection('Relationships').count() if db.has_collection('Relationships') else 0
        print(f"Entities Count: {entities_count}")
        print(f"Relationships Count: {relationships_count}")
        
        # 2. Get some sample entities
        if entities_count > 0:
            print("\nSample Entities:")
            cursor = db.aql.execute("FOR doc IN Entities LIMIT 20 RETURN doc")
            for doc in cursor:
                doc_ids = doc.get("document_ids")
                print(f"- ID: {doc.get('_key')}, Label: {doc.get('label')}, Canonical Name: {doc.get('canonical_name')}, document_ids: {doc_ids} (Type: {type(doc_ids)})")
                
        # 3. Search specifically for doc_ids 7 or 8
        print("\nChecking for doc_id 7 or 8 in Entities:")
        cursor = db.aql.execute("FOR doc IN Entities RETURN doc")
        found_7 = 0
        found_8 = 0
        found_none = 0
        for doc in cursor:
            doc_ids = doc.get("document_ids", [])
            if doc_ids is None:
                found_none += 1
                continue
            if 7 in doc_ids or "7" in doc_ids:
                found_7 += 1
            if 8 in doc_ids or "8" in doc_ids:
                found_8 += 1
        print(f"Found {found_7} entities containing 7/\"7\"")
        print(f"Found {found_8} entities containing 8/\"8\"")
        print(f"Found {found_none} entities with null/missing document_ids")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
