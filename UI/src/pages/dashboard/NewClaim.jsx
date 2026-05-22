import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Upload, FileText, CheckCircle2, AlertCircle,
  Loader2, Send, Shield, X, RefreshCw, Sparkles
} from 'lucide-react'
import api from '../../services/api'
import toast from 'react-hot-toast'

/* ── constants ──────────────────────────────────────────────── */
const CLAIM_TYPE_LABELS = {
  auto_accident:    '🚗 Auto Accident',
  property_damage:  '🏠 Property Damage',
  theft:            '🔓 Theft',
  medical:          '🏥 Medical',
  weather:          '🌪️ Weather Damage',
  other:            '📄 Other',
}

const fadeUp  = { hidden: { opacity: 0, y: 18 }, visible: { opacity: 1, y: 0 } }
const stagger = { visible: { transition: { staggerChildren: 0.07 } } }

/* ── helpers ────────────────────────────────────────────────── */
function fmt(dateStr) {
  if (!dateStr) return '—'
  try { return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return dateStr }
}

/* ── component ──────────────────────────────────────────────── */
export default function NewClaim() {
  const navigate       = useNavigate()
  const [params]       = useSearchParams()

  /* policies */
  const [policies,     setPolicies]     = useState([])
  const [polLoading,   setPolLoading]   = useState(true)
  const [selectedPol,  setSelectedPol]  = useState(null)

  /* file upload */
  const [file,         setFile]         = useState(null)
  const [dragOver,     setDragOver]     = useState(false)
  const fileRef                         = useRef()

  /* extraction state */
  const [extracting,   setExtracting]   = useState(false)
  const [extracted,    setExtracted]    = useState(null)   // AI result
  const [extractError, setExtractError] = useState(null)

  /* final submit */
  const [submitting,   setSubmitting]   = useState(false)

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
  const handleFile = useCallback(async (f) => {
    if (!f) return
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg',
                     'text/plain', 'application/msword',
                     'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    if (!allowed.includes(f.type) && !f.name.match(/\.(pdf|jpg|jpeg|png|txt|doc|docx)$/i)) {
      toast.error('Unsupported file type. Upload PDF, image, or Word doc.')
      return
    }
    setFile(f)
    setExtracted(null)
    setExtractError(null)

    /* auto-extract immediately */
    setExtracting(true)
    try {
      const fd = new FormData()
      fd.append('file', f)
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
      setExtractError('AI extraction failed. You can still submit manually after uploading.')
      toast.error('Extraction failed — check your document and retry')
    } finally {
      setExtracting(false)
    }
  }, [])

  function onDrop(e) {
    e.preventDefault(); setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) handleFile(f)
  }

  function onFileInput(e) {
    const f = e.target.files?.[0]
    if (f) handleFile(f)
    e.target.value = ''
  }

  function clearFile() {
    setFile(null); setExtracted(null); setExtractError(null)
  }

  /* ── submit ─────────────────────────────────────────────────── */
  async function handleSubmit() {
    if (!selectedPol) { toast.error('Please select a policy'); return }
    if (!file)        { toast.error('Please upload your claim document'); return }
    if (!extracted)   { toast.error('Please wait for AI extraction to complete'); return }

    setSubmitting(true)
    try {
      const payload = {
        policy_id:            selectedPol.id,
        incident_date:        extracted.incident_date,
        claim_type:           extracted.claim_type,
        channel:              extracted.channel || 'web',
        incident_description: extracted.incident_description,
        incident_location:    extracted.incident_location,
        contact_phone:        '',
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
          <ArrowLeft size={14}/> Back
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
            <Shield size={16} style={{ color: 'var(--primary)' }}/>
            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Step 1 — Select Policy</span>
          </div>

          {polLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-dim)', fontSize: '0.85rem' }}>
              <Loader2 size={14} className="spin"/> Loading policies…
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
                    {sel && <CheckCircle2 size={16} style={{ color: 'var(--primary)', flexShrink: 0 }}/>}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Upload size={16} style={{ color: 'var(--primary)' }}/>
            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Step 2 — Upload Claim Document</span>
          </div>

          <AnimatePresence mode="wait">
            {!file ? (
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
                <Upload size={28} style={{ color: 'var(--text-dim)', marginBottom: 10 }}/>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>
                  Drop your claim document here
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: 14 }}>
                  Supports PDF, JPG, PNG, Word · Max 20 MB
                </div>
                <button className="btn-primary" style={{ fontSize: '0.82rem', padding: '8px 18px' }}
                  onClick={e => { e.stopPropagation(); fileRef.current?.click() }}>
                  Browse File
                </button>
                <input ref={fileRef} type="file" hidden
                  accept=".pdf,.jpg,.jpeg,.png,.txt,.doc,.docx"
                  onChange={onFileInput}
                />
              </motion.div>
            ) : (
              <motion.div
                key="filebox"
                initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              >
                {/* File info bar */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  background: 'rgba(99,102,241,0.08)',
                  border: '1px solid rgba(99,102,241,0.2)',
                  borderRadius: 10, padding: '12px 16px',
                  marginBottom: 16,
                }}>
                  <FileText size={20} style={{ color: 'var(--primary)', flexShrink: 0 }}/>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {file.name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                      {(file.size / 1024).toFixed(1)} KB
                    </div>
                  </div>
                  <button
                    onClick={clearFile}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: 4 }}
                    title="Remove file"
                  >
                    <X size={16}/>
                  </button>
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
                    <Loader2 size={16} className="spin" style={{ color: 'var(--primary)' }}/>
                    <div>
                      <div style={{ fontWeight: 600 }}>AI Extraction in Progress…</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                        Reading your document and extracting claim details
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
                    <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }}/>
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: 2 }}>Extraction issue</div>
                      <div>{extractError}</div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
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
                <Sparkles size={16} style={{ color: '#10B981' }}/>
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
                    ✓ AI Extracted
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

              <div style={{
                marginTop: 14, fontSize: '0.76rem', color: 'var(--text-dim)',
                display: 'flex', alignItems: 'center', gap: 6,
                borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12,
              }}>
                <AlertCircle size={12}/>
                These details were extracted by AI. Please verify before submitting.
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Submit / Cancel ── */}
      <motion.div variants={fadeUp} style={{ display: 'flex', gap: 12 }}>
        <button
          className="btn-primary"
          onClick={handleSubmit}
          disabled={submitting || extracting || !file || !selectedPol || !extracted}
          style={{ gap: 8, opacity: (submitting || extracting || !file || !selectedPol || !extracted) ? 0.5 : 1 }}
        >
          {submitting
            ? <><Loader2 size={15} className="spin"/> Submitting…</>
            : <><Send size={15}/> Submit Claim</>
          }
        </button>
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
