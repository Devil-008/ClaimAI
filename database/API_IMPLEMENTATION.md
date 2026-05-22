# Backend API Implementation Guide for Chat History

## Required API Endpoints

### 1. Create Chat Session

```
POST /api/chat/sessions
Headers: Authorization: Bearer {token}

Request:
{
  "session_name": "Policy Questions - Nov 20"  // Optional
}

Response:
{
  "session_id": 1,
  "user_id": 1,
  "started_at": "2026-05-20T18:17:13Z",
  "is_active": true
}
```

### 2. Get All User Sessions

```
GET /api/chat/sessions
Headers: Authorization: Bearer {token}

Response:
{
  "sessions": [
    {
      "id": 3,
      "session_name": "Latest Chat",
      "started_at": "2026-05-20T18:17:13Z",
      "last_activity_at": "2026-05-20T18:35:20Z",
      "is_active": true,
      "message_count": 5
    },
    {
      "id": 2,
      "session_name": "Policy Questions",
      "started_at": "2026-05-20T15:00:00Z",
      "last_activity_at": "2026-05-20T16:30:00Z",
      "is_active": true,
      "message_count": 12
    }
  ]
}
```

### 3. Get Messages from Session

```
GET /api/chat/sessions/:sessionId/messages
Headers: Authorization: Bearer {token}

Response:
{
  "session_id": 1,
  "messages": [
    {
      "id": 1,
      "role": "assistant",
      "content": "Hello! I am your Speak ClaimAI assistant...",
      "sources": null,
      "confidence": null,
      "retrieved_chunks": 0,
      "created_at": "2026-05-20T18:17:13Z"
    },
    {
      "id": 2,
      "role": "user",
      "content": "What is my policy coverage limit?",
      "sources": null,
      "confidence": null,
      "retrieved_chunks": 0,
      "created_at": "2026-05-20T18:18:00Z"
    },
    {
      "id": 3,
      "role": "assistant",
      "content": "Your auto policy has a coverage limit of ₹500,000...",
      "sources": [
        {"filename": "policy_POL-2024-AUTO-0001.pdf", "section": "Coverage Details"}
      ],
      "confidence": 0.95,
      "retrieved_chunks": 3,
      "created_at": "2026-05-20T18:18:05Z"
    }
  ]
}
```

### 4. Save Chat Message

```
POST /api/chat/messages
Headers: Authorization: Bearer {token}

Request:
{
  "session_id": 1,
  "role": "user",  // or "assistant"
  "content": "What are my coverage limits?",
  "sources": null,         // Only for assistant messages
  "confidence": null,      // Only for assistant messages
  "retrieved_chunks": 0    // Only for assistant messages
}

Response:
{
  "message_id": 42,
  "session_id": 1,
  "created_at": "2026-05-20T18:19:00Z"
}
```

### 5. Clear Chat Session

```
DELETE /api/chat/sessions/:sessionId
Headers: Authorization: Bearer {token}

Response:
{
  "success": true,
  "deleted_message_count": 15,
  "session_id": 1
}
```

### 6. Clear All Sessions (Clear All Chat)

```
DELETE /api/chat/sessions
Headers: Authorization: Bearer {token}

Response:
{
  "success": true,
  "deleted_sessions": 5,
  "deleted_messages": 47
}
```

---

## Example Implementation (Python/Flask)

```python
from flask import request, jsonify
from datetime import datetime
import json

# 1. Create new session
@app.route('/api/chat/sessions', methods=['POST'])
def create_session():
    user_id = get_current_user_id()  # From auth token
    session_name = request.json.get('session_name')

    cursor = db.cursor()
    cursor.execute(
        "INSERT INTO chat_sessions (user_id, session_name) VALUES (%s, %s)",
        (user_id, session_name)
    )
    db.commit()

    session_id = cursor.lastrowid
    return jsonify({
        'session_id': session_id,
        'user_id': user_id,
        'started_at': datetime.now().isoformat(),
        'is_active': True
    }), 201

# 2. Get user sessions
@app.route('/api/chat/sessions', methods=['GET'])
def get_sessions():
    user_id = get_current_user_id()

    cursor = db.cursor(dictionary=True)
    cursor.execute("""
        SELECT
            id, session_name, started_at, last_activity_at, is_active,
            (SELECT COUNT(*) FROM chat_messages WHERE session_id = cs.id) as message_count
        FROM chat_sessions cs
        WHERE user_id = %s AND is_active = 1
        ORDER BY last_activity_at DESC
    """, (user_id,))

    sessions = cursor.fetchall()
    return jsonify({'sessions': sessions})

# 3. Get messages from session
@app.route('/api/chat/sessions/<int:session_id>/messages', methods=['GET'])
def get_messages(session_id):
    user_id = get_current_user_id()

    # Verify user owns this session
    cursor = db.cursor(dictionary=True)
    cursor.execute("SELECT user_id FROM chat_sessions WHERE id = %s", (session_id,))
    session = cursor.fetchone()

    if not session or session['user_id'] != user_id:
        return jsonify({'error': 'Unauthorized'}), 403

    cursor.execute("""
        SELECT id, role, content, sources, confidence, retrieved_chunks, created_at
        FROM chat_messages
        WHERE session_id = %s
        ORDER BY created_at ASC
    """, (session_id,))

    messages = cursor.fetchall()
    # Parse JSON sources
    for msg in messages:
        if msg['sources']:
            msg['sources'] = json.loads(msg['sources'])

    return jsonify({'session_id': session_id, 'messages': messages})

# 4. Save message
@app.route('/api/chat/messages', methods=['POST'])
def save_message():
    user_id = get_current_user_id()
    data = request.json

    session_id = data['session_id']
    role = data['role']
    content = data['content']
    sources = json.dumps(data.get('sources')) if data.get('sources') else None
    confidence = data.get('confidence')
    retrieved_chunks = data.get('retrieved_chunks', 0)

    # Verify user owns this session
    cursor = db.cursor()
    cursor.execute("SELECT user_id FROM chat_sessions WHERE id = %s", (session_id,))
    session = cursor.fetchone()

    if not session or session[0] != user_id:
        return jsonify({'error': 'Unauthorized'}), 403

    cursor.execute("""
        INSERT INTO chat_messages
        (session_id, role, content, sources, confidence, retrieved_chunks)
        VALUES (%s, %s, %s, %s, %s, %s)
    """, (session_id, role, content, sources, confidence, retrieved_chunks))

    # Update last activity
    cursor.execute(
        "UPDATE chat_sessions SET last_activity_at = NOW() WHERE id = %s",
        (session_id,)
    )

    db.commit()
    message_id = cursor.lastrowid

    return jsonify({
        'message_id': message_id,
        'session_id': session_id,
        'created_at': datetime.now().isoformat()
    }), 201

# 5. Delete specific session
@app.route('/api/chat/sessions/<int:session_id>', methods=['DELETE'])
def delete_session(session_id):
    user_id = get_current_user_id()

    cursor = db.cursor()
    cursor.execute("SELECT user_id FROM chat_sessions WHERE id = %s", (session_id,))
    session = cursor.fetchone()

    if not session or session[0] != user_id:
        return jsonify({'error': 'Unauthorized'}), 403

    cursor.execute("SELECT COUNT(*) FROM chat_messages WHERE session_id = %s", (session_id,))
    message_count = cursor.fetchone()[0]

    cursor.execute("DELETE FROM chat_messages WHERE session_id = %s", (session_id,))
    cursor.execute("DELETE FROM chat_sessions WHERE id = %s", (session_id,))

    db.commit()

    return jsonify({
        'success': True,
        'deleted_message_count': message_count,
        'session_id': session_id
    })

# 6. Delete all sessions
@app.route('/api/chat/sessions', methods=['DELETE'])
def delete_all_sessions():
    user_id = get_current_user_id()

    cursor = db.cursor()
    cursor.execute(
        "SELECT COUNT(*) FROM chat_sessions WHERE user_id = %s",
        (user_id,)
    )
    session_count = cursor.fetchone()[0]

    cursor.execute(
        "SELECT COUNT(*) FROM chat_messages WHERE session_id IN "
        "(SELECT id FROM chat_sessions WHERE user_id = %s)",
        (user_id,)
    )
    message_count = cursor.fetchone()[0]

    cursor.execute(
        "DELETE FROM chat_messages WHERE session_id IN "
        "(SELECT id FROM chat_sessions WHERE user_id = %s)",
        (user_id,)
    )
    cursor.execute("DELETE FROM chat_sessions WHERE user_id = %s", (user_id,))

    db.commit()

    return jsonify({
        'success': True,
        'deleted_sessions': session_count,
        'deleted_messages': message_count
    })
```

---

## Frontend Integration (RagChat.jsx)

```javascript
// Updated component snippet showing database integration

const [currentSession, setCurrentSession] = useState(null);

useEffect(() => {
  // Load existing sessions on mount
  loadSessions();
}, []);

const loadSessions = async () => {
  try {
    const response = await api.get("/chat/sessions");
    setSessions(response.data.sessions);

    // Auto-load latest session or create new one
    if (response.data.sessions.length > 0) {
      loadSession(response.data.sessions[0].id);
    }
  } catch (error) {
    console.error("Failed to load sessions:", error);
  }
};

const loadSession = async (sessionId) => {
  try {
    const response = await api.get(`/chat/sessions/${sessionId}/messages`);
    setMessages(response.data.messages);
    setCurrentSession(sessionId);
  } catch (error) {
    console.error("Failed to load messages:", error);
  }
};

const handleSend = async (e) => {
  e.preventDefault();
  if (!input.trim() || loading) return;

  const userMessage = {
    role: "user",
    content: input.trim(),
  };

  // Save user message to DB
  try {
    await api.post("/chat/messages", {
      session_id: currentSession,
      ...userMessage,
    });
  } catch (error) {
    console.error("Failed to save message:", error);
  }

  // ... rest of the logic

  // Save assistant response to DB
  await api.post("/chat/messages", {
    session_id: currentSession,
    role: "assistant",
    content: answer,
    sources: sources,
    confidence: confidence,
    retrieved_chunks: retrieved_chunks,
  });
};

const handleClearChat = async () => {
  try {
    await api.delete(`/chat/sessions/${currentSession}`);
    loadSessions(); // Reload
  } catch (error) {
    console.error("Failed to clear chat:", error);
  }
};
```

---

## Migration Order

1. Run: `database/03_chat_history_table.sql` ✓ (Already created)
2. Add API endpoints (above Python examples)
3. Update RagChat.jsx frontend integration
4. Test end-to-end flow

---

## Notes

- All user_id lookups should come from JWT token to prevent data leaks
- Implement proper authorization checks on all endpoints
- Consider pagination for sessions with many messages
- Add rate limiting to prevent chat spam
- Monitor performance as chat data grows (consider archiving old sessions)
