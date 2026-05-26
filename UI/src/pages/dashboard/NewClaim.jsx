import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Upload, FileText, CheckCircle2, AlertCircle, AlertTriangle,
  Loader2, Send, Shield, X, RefreshCw, Sparkles
} from 'lucide-react'
import api from '../../services/api'
import toast from 'react-hot-toast'

/* ── constants ──────────────────────────────────────────────── */
const CLAIM_TYPE_LABELS = {
  auto_accident: '🚗 Auto Accident',
  property_damage: '🏠 Property Damage',
  theft: '🔓 Theft',
  medical: '🏥 Medical',
  weather: '🌪️ Weather Damage',
  other: '📄 Other',
}

const fadeUp = { hidden: { opacity: 0, y: 18 }, visible: { opacity: 1, y: 0 } }
const stagger = { visible: { transition: { staggerChildren: 0.07 } } }

/* ── helpers ────────────────────────────────────────────────── */
function fmt(dateStr) {
  if (!dateStr) return '—'
  try { return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return dateStr }
}

/* ── component ──────────────────────────────────────────────── */
export default function NewClaim() {
  const navigate = useNavigate()
  const [params] = useSearchParams()

  /* policies */
  const [policies, setPolicies] = useState([])
  const [polLoading, setPolLoading] = useState(true)
  const [selectedPol, setSelectedPol] = useState(null)

  /* file upload */
  const [docFiles, setDocFiles] = useState([])
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef()

  /* extraction state */
  const [extracting, setExtracting] = useState(false)
  const [extracted, setExtracted] = useState(null)   // AI result
  const [extractError, setExtractError] = useState(null)

  /* final submit */
  const [submitting, setSubmitting] = useState(false)

  /* ── load policies ──────────────────────────────────────────── */
  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/policies/mine')
        setPolicies(res.data || [])
        /* pre-select from query params (coming from MyPolicies "File Claim") */
        const pid = params.get('policy_id')
        if (pid) {
          const match = (res.data || []).find(p => String(p.id) === pid)
          if (match) setSelectedPol(match)
        }
      } catch { /* silently fail – user can still type */ }
      finally { setPolLoading(false) }
    })()
  }, [params])

  /* ── file handling ──────────────────────────────────────────── */
  const handleFiles = useCallback((filesList) => {
    if (!filesList || filesList.length === 0) return
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg',
      'text/plain', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    const newFiles = Array.from(filesList)
    for (const f of newFiles) {
      if (!allowed.includes(f.type) && !f.name.match(/\.(pdf|jpg|jpeg|png|txt|doc|docx)$/i)) {
        toast.error(`Unsupported file type: ${f.name}. Upload PDF, image, or Word doc.`)
        return
      }
    }

    const updatedFiles = [...docFiles, ...newFiles]
    setDocFiles(updatedFiles)
    setExtracted(null)
    setExtractError(null)
  }, [docFiles])

  const removeFile = useCallback((index) => {
    const updatedFiles = docFiles.filter((_, i) => i !== index)
    setDocFiles(updatedFiles)
    setExtracted(null)
    setExtractError(null)
  }, [docFiles])

  const clearAllFiles = useCallback(() => {
    setDocFiles([])
    setExtracted(null)
    setExtractError(null)
  }, [])

  /* Explicit AI extraction trigger */
  const triggerExtraction = useCallback(async () => {
    if (docFiles.length === 0) return toast.error('Please upload at least one document')
    if (!selectedPol) return toast.error('Please select a policy first')
    setExtracting(true)
    setExtracted(null)
    setExtractError(null)
    try {
      const fd = new FormData()
      fd.append('policy_id', selectedPol.id)
      docFiles.forEach(f => {
        fd.append('files', f)
      })
      const res = await api.post('/fnol/extract-from-doc', fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setExtracted(res.data)
      if (res.data.extracted) {
        toast.success('✨ Claim details extracted successfully!')
      } else {
        toast('Details partially extracted — please review', { icon: '⚠️' })
      }
    } catch (err) {
      setExtractError('AI extraction failed. Please try again or fill manually.')
      toast.error('Extraction failed')
    } finally {
      setExtracting(false)
    }
  }, [docFiles, selectedPol])

  function onDrop(e) {
    e.preventDefault(); setDragOver(false)
    const files = e.dataTransfer.files
    if (files && files.length > 0) handleFiles(files)
  }

  function onFileInput(e) {
    const files = e.target.files
    if (files && files.length > 0) handleFiles(files)
    e.target.value = ''
  }

  /* ── submit ─────────────────────────────────────────────────── */
  async function handleSubmit() {
    if (!selectedPol) { toast.error('Please select a policy'); return }
    if (docFiles.length === 0) { toast.error('Please upload your claim document'); return }
    if (!extracted) { toast.error('Please wait for AI extraction to complete'); return }

    setSubmitting(true)
    try {
      const payload = {
        policy_id: selectedPol.id,
        incident_date: extracted.incident_date,
        claim_type: extracted.claim_type,
        channel: extracted.channel || 'web',
        incident_description: extracted.incident_description,
        incident_location: extracted.incident_location,
        contact_phone: '',
        temp_file_path: extracted.temp_file_path || null,
        temp_file_paths: extracted.temp_file_paths || null,
        extracted_data: extracted,
        raw_text: extracted.raw_text || '',
      }
      const res = await api.post('/fnol/submit', payload)
      toast.success(`Claim ${res.data.claim?.claim_number || ''} submitted! AI pipeline running…`)
      navigate('/dashboard/claims')
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Submission failed')
    } finally {
      setSubmitting(false)
    }
  }

  /* ── render ─────────────────────────────────────────────────── */
  const missingSuggested = extracted?.missing_categories?.filter(c =>
    ['claim_form', 'medical_report', 'test_report', 'id_card'].includes(c)
  ) || [];
  const hasAllSuggested = !extracted || missingSuggested.length === 0;

  return (
    <motion.div
      initial="hidden" animate="visible" variants={stagger}
      style={{ maxWidth: 700, margin: '0 auto' }}
    >
      {/* Back */}
      <motion.div variants={fadeUp}>
        <button
          className="btn-ghost"
          style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}
          onClick={() => navigate(-1)}
        >
          <ArrowLeft size={14} /> Back
        </button>
      </motion.div>

      {/* Heading */}
      <motion.div variants={fadeUp} className="page-heading">
        <h1>File a New Claim</h1>
        <p>Upload your claim document — our AI will extract all details automatically</p>
      </motion.div>

      {/* ── STEP 1: Select Policy ── */}
      <motion.div variants={fadeUp} style={{ marginBottom: 24 }}>
        <div style={{
          background: 'var(--surface)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 14,
          padding: '20px 24px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Shield size={16} style={{ color: 'var(--primary)' }} />
            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Step 1 — Select Policy</span>
          </div>

          {polLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-dim)', fontSize: '0.85rem' }}>
              <Loader2 size={14} className="spin" /> Loading policies…
            </div>
          ) : policies.length === 0 ? (
            <div style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>
              No active policies found.{' '}
              <button className="btn-ghost" style={{ fontSize: '0.82rem', padding: '4px 8px' }}
                onClick={() => navigate('/dashboard/policies/add')}>Add a Policy</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {policies.map(p => {
                const sel = selectedPol?.id === p.id
                const planDisplayName = p.plan_name || (p.policy_type ? p.policy_type.charAt(0).toUpperCase() + p.policy_type.slice(1) : '')
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPol(p)}
                    style={{
                      textAlign: 'left',
                      padding: '12px 16px',
                      borderRadius: 10,
                      border: sel
                        ? '1.5px solid var(--primary)'
                        : '1px solid rgba(255,255,255,0.08)',
                      background: sel ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.02)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      transition: 'all 0.18s',
                    }}
                  >
                    <div style={{
                      width: 36, height: 36, borderRadius: 8,
                      background: sel ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.05)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '1.1rem'
                    }}>
                      {p.policy_type === 'health' ? '🏥'
                        : p.policy_type === 'auto' ? '🚗'
                          : p.policy_type === 'property' ? '🏠'
                            : p.policy_type === 'life' ? '🛡️' : '📋'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '1.1rem', color: sel ? 'var(--primary-light)' : 'var(--text)', marginBottom: '3px' }}>
                        {p.policy_number}
                      </div>
                      <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                        <span style={{ fontWeight: 600, color: sel ? '#FFF' : 'var(--text)' }}>{planDisplayName}</span>
                        <span style={{ color: 'var(--text-dim)', fontSize: '0.82rem' }}> · Expires {fmt(p.expiry_date)}</span>
                      </div>
                    </div>
                    {sel && <CheckCircle2 size={16} style={{ color: 'var(--primary)', flexShrink: 0 }} />}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </motion.div>

      {/* ── STEP 2: Upload Document ── */}
      <motion.div variants={fadeUp} style={{ marginBottom: 24 }}>
        <div style={{
          background: 'var(--surface)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 14,
          padding: '20px 24px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Upload size={16} style={{ color: 'var(--primary)' }} />
              <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Step 2 — Upload Claim Document</span>
            </div>
            <a
              href="http://localhost:8000/api/fnol/sample-form"
              download
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: '0.78rem',
                fontWeight: 600,
                color: 'var(--accent)',
                textDecoration: 'none',
                background: 'rgba(79,70,229,0.1)',
                padding: '5px 10px',
                borderRadius: 6,
                transition: 'all 0.2s',
                border: '1px solid rgba(79,70,229,0.2)'
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(79,70,229,0.18)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(79,70,229,0.1)'}
            >
              <FileText size={12} /> Download Sample Form
            </a>
          </div>

          <AnimatePresence mode="wait">
            {docFiles.length === 0 ? (
              <motion.div
                key="dropzone"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileRef.current?.click()}
                style={{
                  border: `2px dashed ${dragOver ? 'var(--primary)' : 'rgba(255,255,255,0.12)'}`,
                  borderRadius: 12,
                  padding: '36px 24px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: dragOver ? 'rgba(99,102,241,0.05)' : 'rgba(255,255,255,0.02)',
                  transition: 'all 0.2s',
                }}
              >
                <Upload size={28} style={{ color: 'var(--text-dim)', marginBottom: 10 }} />
                <div style={{ fontWeight: 600, marginBottom: 6 }}>
                  Drop your claim documents here
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: 14 }}>
                  Supports PDF, Word · Max 5 MB per file
                </div>
                <button className="btn-primary" style={{ fontSize: '0.82rem', padding: '8px 18px' }}
                  onClick={e => { e.stopPropagation(); fileRef.current?.click() }}>
                  Browse Files
                </button>
                <input ref={fileRef} type="file" multiple hidden
                  accept=".pdf,.jpg,.jpeg,.png,.txt,.doc,.docx"
                  onChange={onFileInput}
                />
              </motion.div>
            ) : (
              <motion.div
                key="filebox"
                initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              >
                {/* File list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                  {docFiles.map((file, idx) => (
                    <div key={idx} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      background: 'rgba(99,102,241,0.08)',
                      border: '1px solid rgba(99,102,241,0.2)',
                      borderRadius: 10, padding: '12px 16px',
                    }}>
                      <FileText size={20} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {file.name}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                          {(file.size / 1024).toFixed(1)} KB
                        </div>
                      </div>
                      <button
                        onClick={() => removeFile(idx)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: 4 }}
                        title="Remove file"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Additional file trigger / Clear all */}
                <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                  <button className="btn-ghost" style={{ fontSize: '0.82rem', padding: '6px 12px' }} onClick={() => fileRef.current?.click()}>
                    + Add More Files
                  </button>
                  <button className="btn-ghost" style={{ fontSize: '0.82rem', padding: '6px 12px', color: '#EF4444' }} onClick={clearAllFiles}>
                    Clear All
                  </button>
                  {docFiles.length > 0 && !extracted && !extracting && (
                    <button className="btn-primary" style={{ fontSize: '0.82rem', padding: '6px 16px', background: '#10B981', borderColor: '#10B981', color: '#fff', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }} onClick={triggerExtraction}>
                      <Sparkles size={14} /> ClaimAI Extract Details
                    </button>
                  )}
                  <input ref={fileRef} type="file" multiple hidden accept=".pdf,.jpg,.jpeg,.png,.txt,.doc,.docx" onChange={onFileInput} />
                </div>

                {/* Extraction status */}
                {extracting && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    color: 'var(--text-muted)', fontSize: '0.85rem',
                    padding: '14px 16px',
                    background: 'rgba(99,102,241,0.05)',
                    borderRadius: 10, border: '1px solid rgba(99,102,241,0.12)',
                  }}>
                    <Loader2 size={16} className="spin" style={{ color: 'var(--primary)' }} />
                    <div>
                      <div style={{ fontWeight: 600 }}>AI Extraction in Progress…</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                        Reading your documents and extracting claim details
                      </div>
                    </div>
                  </div>
                )}

                {extractError && !extracting && (
                  <div style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    color: '#F87171', fontSize: '0.83rem',
                    padding: '14px 16px',
                    background: 'rgba(239,68,68,0.07)',
                    borderRadius: 10, border: '1px solid rgba(239,68,68,0.2)',
                  }}>
                    <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: 2 }}>Extraction issue</div>
                      <div>{extractError}</div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <div style={{ marginTop: 12, fontSize: '0.78rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sparkles size={12} style={{ color: 'var(--primary-light)' }} />
            Required documents: CLAIM FORM, MEDICAL REPORT, TEST REPORT, ID CARD.
          </div>
        </div>
      </motion.div>

      {/* ── STEP 3: AI-Extracted Review Panel ── */}
      <AnimatePresence>
        {extracted && !extracting && (
          <motion.div
            key="review"
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{ marginBottom: 24 }}
          >
            <div style={{
              background: 'var(--surface)',
              border: '1.5px solid rgba(16,185,129,0.25)',
              borderRadius: 14,
              padding: '20px 24px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <Sparkles size={16} style={{ color: '#10B981' }} />
                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                  Step 3 — Review AI-Extracted Details
                </span>
                {extracted.extracted && (
                  <span style={{
                    marginLeft: 'auto', fontSize: '0.72rem', fontWeight: 600,
                    padding: '2px 8px', borderRadius: 20,
                    background: 'rgba(16,185,129,0.15)', color: '#10B981',
                    border: '1px solid rgba(16,185,129,0.25)'
                  }}>
                    ✓ ClaimAI Extracted
                  </span>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <ReviewField
                  label="Claim Type"
                  value={CLAIM_TYPE_LABELS[extracted.claim_type] || extracted.claim_type}
                />
                <ReviewField
                  label="Incident Date"
                  value={fmt(extracted.incident_date)}
                />
                <ReviewField
                  label="Incident Location"
                  value={extracted.incident_location || '—'}
                />
                <ReviewField
                  label="Channel"
                  value={extracted.channel?.charAt(0).toUpperCase() + (extracted.channel?.slice(1) || '')}
                />
                <div style={{ gridColumn: '1 / -1' }}>
                  <ReviewField
                    label="Incident Description"
                    value={extracted.incident_description}
                    multiline
                  />
                </div>
              </div>

              {/* Categorized Documents List */}
              {extracted.documents && extracted.documents.length > 0 && (
                <div style={{ marginTop: 18, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 14 }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Categorized Documents</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {extracted.documents.map((doc, idx) => {
                      const categoryLabels = {
                        claim_form: '📝 Claim Form',
                        medical_report: '🏥 Medical Report',
                        test_report: '🔬 Test Report',
                        id_card: '🆔 ID Card',
                        other: '📄 Other Document'
                      }
                      return (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8, padding: '8px 12px', fontSize: '0.82rem' }}>
                          <span style={{ fontWeight: 500 }}>{doc.filename}</span>
                          <span style={{ fontWeight: 600, color: 'var(--primary-light)', background: 'rgba(99,102,241,0.1)', padding: '2px 8px', borderRadius: 4, fontSize: '0.72rem' }}>
                            {categoryLabels[doc.category] || doc.category}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Missing Documents Alert */}
              {extracted.missing_categories && extracted.missing_categories.length > 0 && (
                <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 8, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', color: '#FCD34D', fontSize: '0.78rem', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
                    <AlertTriangle size={14} /> Missing Suggested Documents
                  </div>
                  <div>
                    We did not detect the following document types: <span style={{ fontWeight: 600 }}>{extracted.missing_categories.map(c => c.replace('_', ' ').toUpperCase()).join(', ')}</span>.
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'rgba(252,211,77,0.7)' }}>
                    Please upload them for faster approval, or proceed if you do not have them.
                  </div>
                </div>
              )}

              <div style={{
                marginTop: 14, fontSize: '0.76rem', color: 'var(--text-dim)',
                display: 'flex', alignItems: 'center', gap: 6,
                borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12,
              }}>
                <AlertCircle size={12} />
                These details were extracted by AI. Please verify before submitting.
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Submit / Cancel ── */}
      <motion.div variants={fadeUp} style={{ display: 'flex', gap: 12 }}>
        {hasAllSuggested ? (
          <button
            className="btn-primary"
            onClick={handleSubmit}
            disabled={submitting || extracting || docFiles.length === 0 || !selectedPol || !extracted}
            style={{ gap: 8, opacity: (submitting || extracting || docFiles.length === 0 || !selectedPol || !extracted) ? 0.5 : 1 }}
          >
            {submitting
              ? <><Loader2 size={15} className="spin" /> Submitting…</>
              : <><Send size={15} /> Read Claim Documents</>
            }
          </button>
        ) : (
          <button
            className="btn-primary"
            onClick={() => fileRef.current?.click()}
            style={{ gap: 8, background: '#F59E0B', borderColor: '#F59E0B', color: '#fff' }}
          >
            <Upload size={15} /> Upload More Documents
          </button>
        )}
        <button className="btn-ghost" onClick={() => navigate(-1)}>
          Cancel
        </button>
      </motion.div>

      {/* Commented-out manual fields kept for reference */}
      {/* ── MANUAL FIELDS (commented out — now auto-extracted from document) ──
        <div className="form-group">
          <label className="form-label">Claim Type</label>
          <select className="form-input" .../>
        </div>
        <div className="form-group">
          <label className="form-label">Date of Incident</label>
          <input type="date" className="form-input" .../>
        </div>
        <div className="form-group">
          <label className="form-label">Submission Channel</label>
          <select className="form-input" .../>
        </div>
        <div className="form-group">
          <label className="form-label">Incident Description</label>
          <textarea className="form-input" .../>
        </div>
      ── */}
    </motion.div>
  )
}

/* ── sub-component ──────────────────────────────────────────── */
function ReviewField({ label, value, multiline }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 9,
      padding: '10px 14px',
    }}>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{
        fontSize: '0.85rem',
        color: 'var(--text)',
        lineHeight: multiline ? 1.6 : 1.3,
        wordBreak: 'break-word',
      }}>
        {value || '—'}
      </div>
    </div>
  )
}
