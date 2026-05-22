import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Network, Upload, Plus, X, BrainCircuit, RefreshCw, FileText, CheckCircle, Clock, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { LoadingState, ErrorState, EmptyState } from '../../components/StateViews';

const fadeUp = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }
const stagger = { visible: { transition: { staggerChildren: 0.07 } } }

// Modal Backdrop + Animation Variants
const backdropVariants = { hidden: { opacity: 0 }, visible: { opacity: 1 } };
const modalVariants = {
  hidden: { opacity: 0, y: 50, scale: 0.95 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', damping: 25, stiffness: 300 } },
  exit: { opacity: 0, y: 20, scale: 0.95 }
};

const getVisualizerUrl = (docId) => {
  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
  const host = apiBase.replace(/\/api$/, '');
  return `${host}/api/knowledge-graph/visualize/${docId}`;
};

const getStaticGraphUrl = (docId) => {
  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
  const host = apiBase.replace(/\/api$/, '');
  return `${host}/uploads/graphs/graph_doc_{doc_id}.html`.replace('{doc_id}', docId);
};

export default function KnowledgeGraph() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [files, setFiles] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const fileInputRef = useRef(null);

  const loadDocuments = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await api.get('/knowledge-graph/documents');
      setDocuments(res.data);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDocuments() }, [loadDocuments]);

  // Modal handlers
  const openModal = () => setIsModalOpen(true);
  const closeModal = () => {
    if (generating) return;
    setIsModalOpen(false);
    setFiles([]);
    setPrompt('');
  };

  // Drag and drop handlers
  const handleDragOver = (e) => { e.preventDefault(); setDragging(true); };
  const handleDragLeave = () => { setDragging(false); };
  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setFiles(Array.from(e.target.files));
    }
  };

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const formatSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const generateGraph = async () => {
    if (files.length === 0) return toast.error('Please select at least one document');
    setGenerating(true);
    try {
      const formData = new FormData();
      files.forEach(f => {
        formData.append('files', f, f.name);
      });
      formData.append('prompt', prompt);

      await api.post('/knowledge-graph/generate', formData);
      
      toast.success('Knowledge Graph generated successfully!');
      closeModal();
      loadDocuments();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to generate Knowledge Graph');
    } finally {
      setGenerating(false);
    }
  };

  const deleteDocument = async (id) => {
    if (!window.confirm("Are you sure you want to delete this document from the knowledge base?")) return;
    try {
      await api.delete(`/knowledge-graph/documents/${id}`);
      toast.success("Document deleted successfully");
      loadDocuments();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to delete document');
    }
  };

  return (
    <motion.div initial="hidden" animate="visible" variants={stagger}>
      
      {/* Heading */}
      <motion.div variants={fadeUp} className="page-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Network size={28} color="var(--primary)" />
            <h1 style={{ margin: 0 }}>Knowledge Graph</h1>
          </div>
          <p style={{ marginTop: 8 }}>Manage knowledge base documents and ClaimAI-extracted entity graphs.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button className="btn-ghost" style={{ padding: '8px 12px', fontSize: '0.8rem', gap: 5 }} onClick={loadDocuments}>
            <RefreshCw size={13}/> Refresh
          </button>
          <button className="btn-primary" style={{ gap: 6, padding: '9px 16px', fontSize: '0.85rem' }} onClick={openModal}>
            <Plus size={15}/> Upload Document
          </button>
        </div>
      </motion.div>

      {/* Table Section */}
      <motion.div variants={fadeUp} style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', overflow: 'hidden' }}>
        
        {loading && <LoadingState label="Loading documents..." />}
        {!loading && error && <ErrorState message={error} onRetry={loadDocuments} />}
        {!loading && !error && documents.length === 0 && (
          <EmptyState 
            icon={<FileText size={48} color="var(--text-dim)"/>}
            title="No Documents Uploaded"
            message="Upload documents to extract Knowledge Graph and Summaries."
            action={<button className="btn-primary" onClick={openModal}><Plus size={16}/> Upload First Document</button>}
          />
        )}
        
        {!loading && !error && documents.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '16px 20px', color: 'var(--text-muted)', fontWeight: 600 }}>Document Name</th>
                  <th style={{ padding: '16px 20px', color: 'var(--text-muted)', fontWeight: 600 }}>Size</th>
                  <th style={{ padding: '16px 20px', color: 'var(--text-muted)', fontWeight: 600 }}>Uploaded By</th>
                  <th style={{ padding: '16px 20px', color: 'var(--text-muted)', fontWeight: 600 }}>Upload Time</th>
                  <th style={{ padding: '16px 20px', color: 'var(--text-muted)', fontWeight: 600 }}>Status</th>
                  <th style={{ padding: '16px 20px', color: 'var(--text-muted)', fontWeight: 600 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc, idx) => (
                  <tr key={doc.id} style={{ borderBottom: idx === documents.length - 1 ? 'none' : '1px solid var(--border)', transition: 'background 0.2s', ':hover': { background: 'rgba(255,255,255,0.02)' } }}>
                    <td style={{ padding: '16px 20px', fontWeight: 500, color: 'var(--text)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <FileText size={16} color="var(--primary-light)" />
                        {doc.filename}
                      </div>
                    </td>
                    <td style={{ padding: '16px 20px', color: 'var(--text-dim)' }}>
                      {formatSize(doc.file_size)}
                    </td>
                    <td style={{ padding: '16px 20px', color: 'var(--text-dim)' }}>
                      {doc.uploader_name}
                    </td>
                    <td style={{ padding: '16px 20px', color: 'var(--text-dim)' }}>
                      {new Date(doc.created_at).toLocaleString('en-IN', {
                        day: '2-digit', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                      })}
                    </td>
                    <td style={{ padding: '16px 20px' }}>
                      {doc.status === 'completed' ? (
                         <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#10B981', fontSize: '0.8rem', fontWeight: 600, background: 'rgba(16, 185, 129, 0.1)', padding: '4px 8px', borderRadius: 6 }}>
                          <CheckCircle size={14} /> Completed
                        </div>
                      ) : (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#F59E0B', fontSize: '0.8rem', fontWeight: 600, background: 'rgba(245, 158, 11, 0.1)', padding: '4px 8px', borderRadius: 6 }}>
                          <Clock size={14} /> Processing
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
                      {/* {doc.status === 'completed' && (
                        <>
                          <a 
                            href={getVisualizerUrl(doc.id)} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="btn-primary" 
                            style={{ 
                              padding: '6px 12px', 
                              fontSize: '0.78rem', 
                              display: 'inline-flex', 
                              alignItems: 'center', 
                              gap: 6,
                              textDecoration: 'none',
                              color: '#ffffff',
                              background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                              border: 'none',
                              borderRadius: 8,
                              fontWeight: 500,
                              boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
                              transition: 'all 0.2s'
                            }}
                            title="Open Interactive Cyberpunk Vis.js Graph Explorer"
                          >
                            <Network size={14} />
                            Explore Graph
                          </a>
                          <a 
                            href={getStaticGraphUrl(doc.id)} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            style={{ 
                              padding: '6px 12px', 
                              fontSize: '0.78rem', 
                              display: 'inline-flex', 
                              alignItems: 'center', 
                              gap: 6,
                              textDecoration: 'none',
                              color: '#9CA3AF',
                              background: 'rgba(255, 255, 255, 0.05)',
                              border: '1px solid rgba(255, 255, 255, 0.1)',
                              borderRadius: 8,
                              fontWeight: 500,
                              transition: 'all 0.2s'
                            }}
                            title="View Standalone Static HTML Graph"
                          >
                            <FileText size={14} />
                            Static HTML
                          </a>
                        </>
                      )} */}
                      <button 
                        className="btn-ghost" 
                        style={{ padding: '6px', color: '#EF4444', marginLeft: doc.status === 'completed' ? '12px' : 'auto' }} 
                        onClick={() => deleteDocument(doc.id)}
                        title="Delete Document"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* Upload Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, padding: 20
          }}>
            <motion.div 
              variants={backdropVariants} initial="hidden" animate="visible" exit="hidden"
              style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
              onClick={closeModal}
            />
            <motion.div 
              variants={modalVariants} initial="hidden" animate="visible" exit="exit"
              style={{
                position: 'relative', width: '100%', maxWidth: 700,
                background: 'var(--bg)', borderRadius: 20, border: '1px solid var(--border)',
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', overflow: 'hidden', display: 'flex', flexDirection: 'column'
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
                <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text)' }}>Upload Document</h2>
                <button className="btn-ghost" onClick={closeModal} style={{ padding: 6 }} disabled={generating}>
                  <X size={20} color="var(--text-dim)"/>
                </button>
              </div>

              {/* Body */}
              <div style={{ padding: '24px', flex: 1, overflowY: 'auto', maxHeight: '70vh' }}>
                <div 
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  style={{
                    border: `2px dashed ${dragging ? 'var(--primary)' : 'var(--border)'}`,
                    backgroundColor: dragging ? 'var(--surface-hover)' : 'var(--surface)',
                    borderRadius: 16, padding: '40px 20px', textAlign: 'center',
                    transition: 'all 0.2s', cursor: 'pointer', marginBottom: 20
                  }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={40} color={dragging ? 'var(--primary)' : 'var(--text-dim)'} style={{ marginBottom: 12 }} />
                  <h3 style={{ color: 'var(--text)', margin: '0 0 8px 0', fontSize: '1.1rem' }}>Drag & Drop Knowledge Base Documents</h3>
                  <p style={{ color: 'var(--text-dim)', margin: 0, fontSize: '0.9rem' }}>Or click to browse files (PDF, DOCX, TXT supported)</p>
                  <input type="file" multiple ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileSelect} />
                </div>

                {files.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                    {files.map((file, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <FileText size={18} color="var(--primary-light)" />
                          <div>
                            <div style={{ fontSize: '0.95rem', fontWeight: 500 }}>{file.name}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>{formatSize(file.size)}</div>
                          </div>
                        </div>
                        <button className="btn-ghost" style={{ padding: 4, color: '#EF4444' }} onClick={() => removeFile(idx)}><X size={16} /></button>
                      </div>
                    ))}
                  </div>
                )}

                <div>
                  <label style={{ display: 'block', marginBottom: 8, fontWeight: 600, color: 'var(--text-muted)', fontSize: '0.95rem' }}>Graph Extraction Prompt (Optional)</label>
                  <textarea 
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="E.g., Extract all entities related to insurance policy terms and their relationships..."
                    style={{
                      width: '100%', height: 90, background: 'var(--surface)', border: '1px solid var(--border)',
                      color: 'var(--text)', padding: 16, borderRadius: 12, outline: 'none', fontSize: '0.95rem',
                      resize: 'vertical'
                    }}
                  />
                </div>
              </div>

              {/* Footer */}
              <div style={{ padding: '20px 24px', borderTop: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <button className="btn-ghost" onClick={closeModal} disabled={generating} style={{ padding: '10px 20px', fontSize: '0.95rem' }}>Cancel</button>
                <button className="btn-primary" onClick={generateGraph} disabled={generating || files.length === 0} style={{ padding: '10px 20px', fontSize: '0.95rem', gap: 8 }}>
                  {generating ? <RefreshCw size={18} className="spin" /> : <BrainCircuit size={18} />}
                  {generating ? 'Processing with Mistral & ArangoDB...' : 'Upload & Generate'}
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </motion.div>
  );
}
