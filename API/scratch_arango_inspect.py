import os
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
        
        entities_coll = db.collection('Entities')
        edges_coll = db.collection('Relationships')
        
        null_entities_count = 0
        null_edges_count = 0
        
        # Check Entities
        cursor = db.aql.execute("FOR doc IN Entities RETURN doc")
        for doc in cursor:
            if doc.get("document_ids") is None:
                null_entities_count += 1
                
        # Check Relationships
        cursor = db.aql.execute("FOR doc IN Relationships RETURN doc")
        for doc in cursor:
            if doc.get("document_ids") is None:
                null_edges_count += 1
                
        print(f"Entities with null document_ids: {null_entities_count} / {entities_coll.count()}")
        print(f"Edges with null document_ids: {null_edges_count} / {edges_coll.count()}")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
