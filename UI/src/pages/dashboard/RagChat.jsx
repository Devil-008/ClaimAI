import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send, Bot, User, FileText, BookOpen, CheckCircle2,
  Plus, MessageSquare, Trash2, Clock, ChevronLeft, ChevronRight, Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../services/api';
import toast from 'react-hot-toast';
import ReactMarkdown from 'react-markdown';
import './RagChat.css';

const fadeUp = { hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } };

/* ── relative time helper ─────────────────────────────────── */
function timeAgo(dateStr) {
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

const WELCOME = {
  id: 'welcome',
  role: 'assistant',
  content: 'Hello! I am your ClaimAI assistant. Ask me anything about your uploaded documents, policies, or knowledge graph.',
  timestamp: new Date(),
  metadata: null,
};

export default function RagChat() {
  /* ── session sidebar state ── */
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [collapsed, setCollapsed] = useState(false);

  /* ── chat state ── */
  const [messages, setMessages] = useState([WELCOME]);
  const [msgsLoading, setMsgsLoading] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const messagesEndRef = useRef(null);

  const scrollToBottom = () =>
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });

  useEffect(() => { scrollToBottom(); }, [messages, loading]);

  /* ── load sessions on mount ── */
  useEffect(() => {
    api.get('/rag/sessions')
      .then(r => setSessions(r.data))
      .catch(() => { })
      .finally(() => setSessionsLoading(false));
  }, []);

  /* ── select session → load its messages ── */
  const selectSession = useCallback(async (sid) => {
    if (sid === activeSessionId) return;
    setActiveSessionId(sid);
    setMsgsLoading(true);
    setMessages([]);
    try {
      const r = await api.get(`/rag/sessions/${sid}/messages`);
      const fetched = r.data.map(m => ({
        id: String(m.id),
        role: m.role,
        content: m.content,
        timestamp: new Date(m.created_at),
        metadata: null,
      }));
      setMessages(fetched.length ? fetched : [WELCOME]);
    } catch {
      setMessages([WELCOME]);
    } finally {
      setMsgsLoading(false);
    }
  }, [activeSessionId]);

  /* ── create new session ── */
  const newSession = async () => {
    try {
      const r = await api.post('/rag/sessions');
      setSessions(prev => [r.data, ...prev]);
      setActiveSessionId(r.data.id);
      setMessages([WELCOME]);
    } catch {
      toast.error('Could not create session');
    }
  };

  /* ── delete session ── */
  const deleteSession = async (e, sid) => {
    e.stopPropagation();
    try {
      await api.delete(`/rag/sessions/${sid}`);
      setSessions(prev => prev.filter(s => s.id !== sid));
      if (activeSessionId === sid) {
        setActiveSessionId(null);
        setMessages([WELCOME]);
      }
      toast.success('Session deleted');
    } catch {
      toast.error('Could not delete session');
    }
  };

  /* ── send message ── */
  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg = {
      id: String(Date.now()),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
      metadata: null,
    };
    setMessages(prev => [...prev.filter(m => m.id !== 'welcome'), userMsg]);
    const sentQuery = input.trim();
    setInput('');
    setLoading(true);

    try {
      const res = await api.post('/rag/chat', {
        query: sentQuery,
        session_id: activeSessionId || undefined,
      });

      const { answer, sources = [], confidence = 0, retrieved_chunks = 0, session_id } = res.data;

      const assistantMsg = {
        id: String(Date.now() + 1),
        role: 'assistant',
        content: answer || 'I could not generate a response. Please try again.',
        timestamp: new Date(),
        metadata: { sources, confidence, retrieved_chunks },
      };

      setLoading(false);
      setMessages(prev => [...prev, assistantMsg]);

      /* update session list */
      if (session_id) {
        setActiveSessionId(session_id);
        setSessions(prev => {
          const exists = prev.find(s => s.id === session_id);
          if (exists) {
            const updated = { ...exists, message_count: (exists.message_count || 0) + 2 };
            return [updated, ...prev.filter(s => s.id !== session_id)];
          }
          /* brand new session — reload list */
          api.get('/rag/sessions').then(r => setSessions(r.data)).catch(() => { });
          return prev;
        });
      }
    } catch {
      toast.error('Failed to get response from backend');
      setLoading(false);
    }
  };

  /* ── start fresh (no session) ── */
  const handleNewChat = () => {
    setActiveSessionId(null);
    setMessages([WELCOME]);
  };

  /* ══════════════ RENDER ══════════════════════════════════════ */
  return (
    <div className="rag-page-wrapper">

      {/* ═══ LEFT SIDEBAR ══════════════════════════════════════ */}
      <aside className={`chat-history-sidebar ${collapsed ? 'collapsed' : ''}`}>

        {/* collapse toggle */}
        <button
          className="sidebar-collapse-btn"
          onClick={() => setCollapsed(v => !v)}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>

        <AnimatePresence>
          {!collapsed && (
            <motion.div
              className="sidebar-inner"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              {/* header */}
              <div className="chat-sidebar-header">
                <span className="chat-sidebar-title">
                  <MessageSquare size={13} />
                  Chat History
                </span>
                <button className="new-chat-btn" onClick={newSession} title="New session">
                  <Plus size={13} /> New
                </button>
              </div>

              {/* session list */}
              <div className="session-list">
                {sessionsLoading ? (
                  <div className="session-placeholder">
                    <Loader2 size={16} className="spin-icon" /> Loading…
                  </div>
                ) : sessions.length === 0 ? (
                  <div className="session-placeholder">
                    <MessageSquare size={28} style={{ opacity: 0.25 }} />
                    <span>No history yet.</span>
                    <span>Start a new chat!</span>
                  </div>
                ) : (
                  sessions.map(s => (
                    <div
                      key={s.id}
                      className={`session-item ${activeSessionId === s.id ? 'active' : ''}`}
                      onClick={() => selectSession(s.id)}
                    >
                      <MessageSquare size={13} className="session-icon" />
                      <div className="session-body">
                        <span className="session-title">{s.title}</span>
                        <span className="session-meta">
                          <Clock size={9} />
                          {timeAgo(s.started_at)}
                          {s.message_count > 0 && (
                            <span className="session-count">{s.message_count}</span>
                          )}
                        </span>
                      </div>
                      <button
                        className="session-del-btn"
                        onClick={e => deleteSession(e, s.id)}
                        title="Delete"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </aside>

      {/* ═══ MAIN CHAT ════════════════════════════════════════= */}
      <motion.div
        className="rag-chat-container"
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
      >
        {/* header */}
        <div className="chat-header">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <FileText className="text-cyan-400" />
              Speak to ClaimAI
            </h1>
            <p className="text-gray-400 mt-1 text-sm">
              {activeSessionId
                ? `Session #${activeSessionId} — ask questions about your policies & documents`
                : 'Ask questions to search through your extracted knowledge base, policies, and claims.'}
            </p>
          </div>
          <button className="clear-chat-btn" onClick={handleNewChat} title="New Chat">
            <Plus size={16} />
            <span>New Chat</span>
          </button>
        </div>

        {/* chat window */}
        <div className="chat-window">
          <div className="messages-area">
            {msgsLoading ? (
              <div className="msgs-loading">
                <Loader2 size={22} className="spin-icon" /> Loading messages…
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {messages.map(msg => (
                  <motion.div
                    key={msg.id}
                    variants={fadeUp}
                    initial="hidden"
                    animate="visible"
                    exit={{ opacity: 0, y: -10 }}
                    className={`message-wrapper ${msg.role}`}
                  >
                    <div className="message-avatar">
                      {msg.role === 'assistant' ? <Bot size={20} /> : <User size={20} />}
                    </div>
                    <div className="message-content">
                      <div className="message-text">
                        {msg.role === 'assistant' ? (
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        ) : (
                          msg.content
                        )}
                      </div>
                      {msg.metadata?.sources?.length > 0 && (
                        <div className="message-sources">
                          <div className="sources-header">
                            <BookOpen size={14} />
                            <span>Sources ({msg.metadata.sources.length})</span>
                          </div>
                          <div className="sources-list">
                            {msg.metadata.sources.map((src, idx) => (
                              <div key={idx} className="source-item">
                                <CheckCircle2 size={12} />
                                <span>{src.filename}</span>
                                {src.section && (
                                  <span className="section-info">{src.section}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="message-time">
                        {(msg.timestamp instanceof Date
                          ? msg.timestamp
                          : new Date(msg.timestamp)
                        ).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </motion.div>
                ))}

                {loading && (
                  <motion.div
                    key="typing-loader"
                    variants={fadeUp}
                    initial="hidden"
                    animate="visible"
                    exit={{ opacity: 0, y: -10 }}
                    className="message-wrapper assistant"
                  >
                    <div className="message-avatar"><Bot size={20} /></div>
                    <div className="message-content">
                      <div className="typing-indicator">
                        <span /><span /><span />
                      </div>
                    </div>
                  </motion.div>
                )}
                <div ref={messagesEndRef} />
              </AnimatePresence>
            )}
          </div>

          <form className="chat-input-area" onSubmit={handleSend}>
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask about your claims, policies, or coverage…"
              disabled={loading || msgsLoading}
              className="chat-input"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading || msgsLoading}
              className="send-button"
            >
              <Send size={20} />
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}