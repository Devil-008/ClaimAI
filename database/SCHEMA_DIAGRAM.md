# Chat History Database Schema Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Database Schema                          │
└─────────────────────────────────────────────────────────────────┘

                        users (existing)
                            │
                            │ (user_id)
                            ▼
                  ┌──────────────────────┐
                  │   chat_sessions      │
                  ├──────────────────────┤
                  │ id (PK)              │
                  │ user_id (FK)         │ ◄─── Links to user
                  │ session_name         │
                  │ started_at           │
                  │ last_activity_at     │
                  │ is_active            │
                  └──────────────────────┘
                            │
                            │ (session_id)
                            ▼
                  ┌──────────────────────┐
                  │   chat_messages      │
                  ├──────────────────────┤
                  │ id (PK)              │
                  │ session_id (FK)      │ ◄─── Links to session
                  │ role                 │     (user/assistant)
                  │ content              │     Message text
                  │ sources (JSON)       │     Sources from RAG
                  │ confidence           │     Confidence score
                  │ retrieved_chunks     │     Chunks count
                  │ created_at           │     Timestamp
                  └──────────────────────┘


┌─────────────────────────────────────────────────────────────────┐
│                    Sample Data Flow                              │
└─────────────────────────────────────────────────────────────────┘

1. USER STARTS CHAT
   ├─ Create chat_sessions row (user_id=1)
   └─ Return session_id

2. USER SENDS MESSAGE "What about policy XYZ?"
   ├─ Insert chat_messages (session_id, role='user', content='What...')
   └─ Display in UI

3. BACKEND SENDS RESPONSE FROM RAG
   ├─ Insert chat_messages (session_id, role='assistant', content='Answer...',
   │                        sources=[...], confidence=0.95, retrieved_chunks=3)
   └─ Display in UI with sources

4. USER CLEARS CHAT
   ├─ DELETE FROM chat_messages WHERE session_id = X
   └─ OR: UPDATE chat_sessions SET is_active=0 WHERE id=X

5. USER REOPENS CHAT LATER
   ├─ Query: SELECT * FROM chat_messages WHERE session_id=X
   └─ Reload all previous messages from database


┌─────────────────────────────────────────────────────────────────┐
│              Key Features & Indexes                              │
└─────────────────────────────────────────────────────────────────┘

Indexes Created:
  ✓ chat_sessions(user_id)        - Fast lookup by user
  ✓ chat_sessions(started_at)     - Sort by recency
  ✓ chat_sessions(is_active)      - Find active sessions
  ✓ chat_messages(session_id)     - Fast message retrieval
  ✓ chat_messages(role)           - Filter user vs assistant
  ✓ chat_messages(created_at)     - Sort chronologically

Cascading Deletes:
  ✓ Delete user → Auto-delete all sessions & messages
  ✓ Delete session → Auto-delete all messages

Data Types:
  ✓ LONGTEXT for content - Handles large responses
  ✓ JSON for sources - Flexible structure
  ✓ DECIMAL(5,4) for confidence - High precision (0.0000-1.0000)


┌─────────────────────────────────────────────────────────────────┐
│               Typical Query Patterns                             │
└─────────────────────────────────────────────────────────────────┘

# Get all sessions for a user
SELECT * FROM chat_sessions
WHERE user_id = 1 AND is_active = 1
ORDER BY last_activity_at DESC;

# Get all messages in a session (chronologically)
SELECT * FROM chat_messages
WHERE session_id = 5
ORDER BY created_at ASC;

# Get recent assistant responses with sources
SELECT * FROM chat_messages
WHERE session_id = 5 AND role = 'assistant' AND sources IS NOT NULL
ORDER BY created_at DESC
LIMIT 10;

# Clear a session (soft delete)
UPDATE chat_sessions SET is_active = 0 WHERE id = 5;

# Hard delete a session (removes from database)
DELETE FROM chat_messages WHERE session_id = 5;
DELETE FROM chat_sessions WHERE id = 5;

# Get statistics
SELECT
  COUNT(DISTINCT session_id) as total_sessions,
  COUNT(*) as total_messages,
  AVG(LENGTH(content)) as avg_message_length
FROM chat_messages
WHERE session_id = 5;
```
