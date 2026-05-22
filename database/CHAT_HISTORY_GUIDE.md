# Chat History Database Implementation

## Summary

You now have a complete database schema for storing chat history with the following features:

- **Sessions**: Group messages by user and conversation session
- **Messages**: Store individual user and AI messages with metadata (sources, confidence, chunks)
- **Persistent Storage**: All chat data persists in the database
- **Clear Functionality**: Can be implemented to delete all messages/sessions for a user
- **Metadata Support**: Captures sources, confidence scores, and retrieved chunks from RAG responses

## Database Changes

### New File: `database/03_chat_history_table.sql`

Two new tables created:

#### 1. `chat_sessions` Table

```sql
- id (PK)
- user_id (FK → users.id) - Links to authenticated user
- session_name - Optional friendly name for conversation
- started_at - Timestamp when session started
- last_activity_at - Auto-updates on each message
- is_active - Flag to soft-delete or archive sessions
```

#### 2. `chat_messages` Table

```sql
- id (PK)
- session_id (FK → chat_sessions.id) - Links to parent session
- role - Either 'user' or 'assistant'
- content - Full message text (LONGTEXT for large responses)
- sources - JSON array of sources from RAG (stored as-is from API)
- confidence - Decimal confidence score (0-1)
- retrieved_chunks - Number of chunks retrieved for the response
- created_at - Timestamp of message
```

## Features Enabled

✅ **Persistent Chat History** - All messages stored in database
✅ **Session Management** - Group messages by conversation
✅ **User-Specific Data** - Each user has their own chat history
✅ **Clear Chat** - Delete specific session or all sessions by user
✅ **RAG Metadata** - Stores sources, confidence, and chunk count
✅ **Time Tracking** - Auto-tracks when messages were created
✅ **Scalable** - JSON storage for flexible source formats

## How to Use

### 1. Run Migration

```bash
# In MySQL Workbench or CLI:
source /path/to/database/03_chat_history_table.sql;
```

### 2. Update RagChat.jsx Component

The component needs updates to:

- Load messages from database on component mount
- Save new messages to database after sending
- Implement clear chat to delete from database
- Display session history list

### 3. Create API Endpoints

You'll need to create backend routes:

```
POST   /api/chat/sessions              - Create new session
GET    /api/chat/sessions/:id/messages - Fetch chat messages
POST   /api/chat/messages              - Save new message
DELETE /api/chat/sessions/:id          - Clear chat session
GET    /api/chat/sessions              - List all user sessions
```

## Next Steps

1. **Create API endpoints** in your backend to handle chat operations
2. **Update RagChat.jsx** to integrate with database:
   - Load chat history on mount
   - Save messages to DB
   - Implement persistent clear functionality
3. **Add session management UI** to switch between conversations
4. **Add soft-delete support** to archive without losing data

## Table Structure Benefits

- **Referential Integrity**: Foreign keys ensure data consistency
- **Efficient Querying**: Indexes on user_id, session_id, created_at
- **Flexible Metadata**: JSON storage for sources allows future schema changes
- **Audit Trail**: All timestamps auto-managed by database
- **Scalability**: Can handle thousands of messages per session

---

**Status**: Schema created and ready for backend integration
