import { useState, useRef, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Upload, FileText, CheckCircle2, AlertTriangle,
  Loader2, Zap, User, AlertCircle, X, Sparkles, Shield, Send
} from 'lucide-react'
import api from '../../services/api'
import toast from 'react-hot-toast'

/* ── commented out: Form Fill & Photo Upload tabs ─────────────
const TABS = [
  { id: 'form',     icon: FileText, label: 'Form Fill',      desc: 'Fill structured claim form' },
  { id: 'document', icon: Upload,   label: 'Document Upload', desc: 'Upload PDF or claim form'  },
  { id: 'photo',    icon: Camera,   label: 'Photo Upload',    desc: 'Upload damage photos'      },
]
─────────────────────────────────────────────────────────────── */

const CLAIM_TYPE_LABELS = {
  auto_accident: '🚗 Auto Accident',
  property_damage: '🏠 Property Damage',
  theft: '🔒 Theft',
  medical: '🏥 Medical',
  weather: '⛈ Weather Damage',
  other: '📋 Other',
}

const REQUIRED_DOCS = [
  { key: 'claim_form', label: 'Claim Form' },
  { key: 'medical_report', label: 'Medical Report' },
  { key: 'test_report', label: 'Test Report' },
  { key: 'id_card', label: 'Identity Proof (e.g., Aadhaar, PAN, Voter ID)' },
]

const OUTCOME_CONFIG = {
  auto_settled: { icon: CheckCircle2, color: '#10B981', label: 'Auto-Settled ✅', bg: 'rgba(16,185,129,0.1)' },
  adjuster_escalated: { icon: User, color: '#F59E0B', label: 'Sent to Adjuster 📋', bg: 'rgba(245,158,11,0.1)' },
  siu_escalated: { icon: AlertTriangle, color: '#EF4444', label: 'SIU Investigation 🔍', bg: 'rgba(239,68,68,0.1)' },
  rejected: { icon: AlertTriangle, color: '#EF4444', label: 'Coverage Rejected ❌', bg: 'rgba(239,68,68,0.1)' },
}

const AGENT_COLORS = {
  A2_FNOL_Intake: { color: '#06B6D4', label: 'A2 — FNOL Intake' },
  A3_Coverage_Verification: { color: '#4F46E5', label: 'A3 — Coverage Verify' },
  A4_Damage_Assessment: { color: '#10B981', label: 'A4 — Damage Assessment' },
  A5_Fraud_Risk_Scoring: { color: '#F59E0B', label: 'A5 — Fraud Scoring' },
  A6_Settlement: { color: '#10B981', label: 'A6 — Settlement' },
  A7_Adjuster_Handoff: { color: '#EF4444', label: 'A7 — Adjuster Handoff' },
  A8_Chatbot: { color: '#8B5CF6', label: 'A8 — Claimant Notify' },
}

const fadeUp = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }
const stagger = { visible: { transition: { staggerChildren: 0.06 } } }

function fmt(d) {
  try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return d }
}

/* ── Pipeline Result Panel ──────────────────────────────────── */
function PipelineResult({ result, onDone }) {
  const outcome = OUTCOME_CONFIG[result.outcome] || OUTCOME_CONFIG.adjuster_escalated
  const Icon = outcome.icon
  return (
    <motion.div initial="hidden" animate="visible" variants={stagger}>
      <motion.div variants={fadeUp} style={{
        background: outcome.bg, border: `1px solid ${outcome.color}44`,
        borderRadius: 16, padding: '20px 24px', marginBottom: 24,
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', background: `${outcome.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={24} color={outcome.color} />
        </div>
        <div>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: outcome.color }}>{outcome.label}</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 4 }}>{result.outcome_msg}</div>
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <code style={{ color: 'var(--primary-light)', fontSize: '0.85rem' }}>{result.claim_number}</code>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: 2 }}>Pipeline: {result.elapsed_ms}ms</div>
        </div>
      </motion.div>

      <motion.div variants={fadeUp}>
        <div className="dash-section-title" style={{ marginBottom: 12 }}>
          <Zap size={14} color="#4F46E5" /> Agent Pipeline Execution Trace
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(result.pipeline_trace || []).map((step, i) => {
            const cfg = AGENT_COLORS[step.step] || { color: '#818CF8', label: step.step }
            const res = step.result || {}
            return (
              <motion.div key={i} variants={fadeUp} style={{
                background: 'rgba(255,255,255,0.03)',
                border: `1px solid ${step.status === 'error' ? '#EF444444' : `${cfg.color}33`}`,
                borderLeft: `3px solid ${cfg.color}`,
                borderRadius: 10, padding: '12px 16px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontWeight: 700, color: cfg.color, fontSize: '0.85rem' }}>{cfg.label}</span>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>{step.ms}ms</span>
                    <span className={`badge ${step.status === 'success' ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '0.7rem' }}>{step.status}</span>
                  </div>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  {res.message || res.reason || res.error || '—'}
                  {res.fraud_score !== undefined && <span style={{ marginLeft: 8, color: res.fraud_score > 0.5 ? '#EF4444' : '#10B981' }}>Fraud: {res.fraud_score}</span>}
                </div>
              </motion.div>
            )
          })}
        </div>
      </motion.div>

      <motion.div variants={fadeUp} style={{ marginTop: 24, display: 'flex', gap: 12 }}>
        <button className="btn-primary" onClick={onDone}>View My Claims</button>
        <button className="btn-ghost" onClick={() => window.location.reload()}>File Another Claim</button>
      </motion.div>
    </motion.div>
  )
}

/* ── Review Field ───────────────────────────────────────────── */
function ReviewField({ label, value, multiline }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 9, padding: '10px 14px' }}>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: '0.85rem', color: 'var(--text)', lineHeight: multiline ? 1.6 : 1.3, wordBreak: 'break-word' }}>{value || '—'}</div>
    </div>
  )
}

/* ── Main Component ─────────────────────────────────────────── */
export default function FNOLWizard() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  /* policies */
  const [policies, setPolicies] = useState([])
  const [policiesErr, setPoliciesErr] = useState(false)
  const [selectedPol, setSelectedPol] = useState(null)

  /* file */
  const [docFiles, setDocFiles] = useState([])
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef()

  /* extraction */
  const [extracting, setExtracting] = useState(false)
  const [extracted, setExtracted] = useState(null)
  const [extractError, setExtractError] = useState(null)
  // const [extractError, setExtractError] = useState(null)
  const [showMissingModal, setShowMissingModal] = useState(false)

  /* submit */
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)

  /* load policies */
  useEffect(() => {
    api.get('/policies/mine')
      .then(r => {
        setPolicies(r.data || [])
        const pid = searchParams.get('policy_id')
        if (pid) {
          const match = (r.data || []).find(p => String(p.id) === pid)
          if (match) setSelectedPol(match)
        }
      })
      .catch(() => setPoliciesErr(true))
  }, [searchParams])

  /* file handling */
  async function handleFiles(filesList) {
    if (!filesList || filesList.length === 0) return
    const newFiles = Array.from(filesList)
    const updatedFiles = [...docFiles, ...newFiles]
    setDocFiles(updatedFiles)
    setExtracted(null)
    setExtractError(null)
  }

  async function removeFile(index) {
    const updatedFiles = docFiles.filter((_, i) => i !== index)
    setDocFiles(updatedFiles)
    setExtracted(null)
    setExtractError(null)
  }

  /* Explicit AI extraction trigger */
  async function triggerExtraction() {
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
      const res = await api.post('/fnol/extract-from-doc', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setExtracted(res.data)
if (res.data?.missing_categories?.length > 0) {
  setShowMissingModal(true)
}

      toast.success('✨ Details extracted from all documents!')
    } catch {
      setExtractError('AI extraction failed. Please try again or fill manually.')
      toast.error('Extraction failed')
    } finally { setExtracting(false) }
  }

  function onDrop(e) { e.preventDefault(); setDragOver(false); const files = e.dataTransfer.files; if (files && files.length > 0) handleFiles(files) }
  function onFileInput(e) { const files = e.target.files; if (files && files.length > 0) handleFiles(files); e.target.value = '' }
  function clearAllFiles() { setDocFiles([]); setExtracted(null); setExtractError(null) }

  /* submit → fnol/submit with extracted data */
  async function handleSubmit() {
    if (!selectedPol) return toast.error('Please select a policy')
    if (docFiles.length === 0) return toast.error('Please upload a claim document')
    if (!extracted) return toast.error('Waiting for AI extraction…')
    setLoading(true)
    try {
      const res = await api.post('/fnol/submit', {
        policy_id: selectedPol.id,
        incident_date: extracted.incident_date,
        claim_type: extracted.claim_type,
        channel: extracted.channel || 'web',
        incident_description: extracted.incident_description,
        incident_location: extracted.incident_location || '',
        contact_phone: '',
        temp_file_path: extracted.temp_file_path || null,
        temp_file_paths: extracted.temp_file_paths || null,
        extracted_data: extracted,
        raw_text: extracted.raw_text || '',
      })
      setResult(res.data)
      toast.success('Claim submitted! AI pipeline running…')
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Submission failed')
    } finally { setLoading(false) }
  }

  /* ── pipeline done screen ── */
  if (result) return (
    <motion.div initial="hidden" animate="visible" variants={stagger}>
      <motion.div variants={fadeUp} className="page-heading">
        <h1>Claim Submitted — AI Pipeline Complete</h1>
        <p>Your claim was processed through 6 AI agents in real time</p>
      </motion.div>
      <PipelineResult result={result} onDone={() => navigate('/dashboard/claims')} />
    </motion.div>
  )

  const missingSuggested = extracted?.missing_categories?.filter(c =>
    ['claim_form', 'medical_report', 'test_report', 'id_card'].includes(c)
  ) || [];
  const hasAllSuggested = !extracted || missingSuggested.length === 0;

  return (
    <motion.div initial="hidden" animate="visible" variants={stagger} style={{ maxWidth: 720 }}>

      {/* Back */}
      <motion.div variants={fadeUp}>
        <button className="btn-ghost"
          style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}
          onClick={() => navigate(-1)}>
          <ArrowLeft size={14} /> Back
        </button>
      </motion.div>

      {/* Heading */}
      <motion.div variants={fadeUp} className="page-heading">
        <h1>File a New Claim</h1>
        <p>Upload your claim document — ClaimAI extracts all details automatically</p>
      </motion.div>

      {/* ── commented out: Tab selector (Form Fill / Document / Photo) ──
      <motion.div variants={fadeUp} style={{ display:'flex', gap:8, marginBottom:28 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{...}}>
            <t.icon size={20}/><span>{t.label}</span><span>{t.desc}</span>
          </button>
        ))}
      </motion.div>
      ───────────────────────────────────────────────────────────── */}

      {/* Loading overlay */}
      {loading && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{
          position: 'fixed', inset: 0, background: 'rgba(10,12,24,0.85)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          zIndex: 999, gap: 20,
        }}>
          <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: '40px 60px', textAlign: 'center' }}>
            <Loader2 size={40} color="#4F46E5" className="spin" style={{ marginBottom: 16 }} />
            <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: 8 }}>Running AI Pipeline…</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>A2 → A3 → A4 → A5 → A6/A7 agents processing your claim</div>
          </div>
        </motion.div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── STEP 1: Select Policy ── */}
        <motion.div variants={fadeUp} style={{ background: 'var(--surface)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Shield size={16} style={{ color: 'var(--primary)' }} />
            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Step 1 — Select Policy</span>
          </div>

          {policiesErr && (
            <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', fontSize: '0.82rem', color: '#FCA5A5' }}>
              <AlertCircle size={13} style={{ display: 'inline', marginRight: 6 }} />
              Could not load policies.
            </div>
          )}

          {!policiesErr && policies.length === 0 && (
            <div style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>
              No active policies.{' '}
              <button className="btn-ghost" style={{ fontSize: '0.82rem', padding: '4px 8px' }} onClick={() => navigate('/dashboard/policies/add')}>Add a Policy →</button>
            </div>
          )}

          {policies.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {policies.map(p => {
                const sel = selectedPol?.id === p.id
                const planDisplayName = p.plan_name || (p.policy_type ? p.policy_type.charAt(0).toUpperCase() + p.policy_type.slice(1) : '')
                return (
                  <button key={p.id} onClick={() => setSelectedPol(p)} style={{
                    textAlign: 'left', padding: '12px 16px', borderRadius: 10,
                    border: sel ? '1.5px solid var(--primary)' : '1px solid rgba(255,255,255,0.08)',
                    background: sel ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.02)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, transition: 'all 0.18s',
                  }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: sel ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>
                      {p.policy_type === 'health' ? '🏥' : p.policy_type === 'auto' ? '🚗' : p.policy_type === 'property' ? '🏠' : '📋'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '1.1rem', color: sel ? 'var(--primary-light)' : 'var(--text)', marginBottom: '3px' }}>{p.policy_number}</div>
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
        </motion.div>

        {/* ── STEP 2: Upload Document ── */}
        <motion.div variants={fadeUp} style={{ background: 'var(--surface)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px 24px' }}>
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
              <motion.div key="drop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileRef.current?.click()}
                style={{
                  border: `2px dashed ${dragOver ? 'var(--primary)' : 'rgba(255,255,255,0.12)'}`,
                  borderRadius: 12, padding: '36px 24px', textAlign: 'center', cursor: 'pointer',
                  background: dragOver ? 'rgba(99,102,241,0.05)' : 'rgba(255,255,255,0.02)', transition: 'all 0.2s',
                }}>
                <Upload size={28} style={{ color: 'var(--text-dim)', marginBottom: 10 }} />
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Drop your claim documents here</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: 14 }}>PDF,Word · Max 5 MB per file</div>
                <button className="btn-primary" style={{ fontSize: '0.82rem', padding: '8px 18px' }}
                  onClick={e => { e.stopPropagation(); fileRef.current?.click() }}>Browse Files</button>
                <input ref={fileRef} type="file" multiple hidden accept=".pdf,.jpg,.jpeg,.png,.txt,.doc,.docx" onChange={onFileInput} />
              </motion.div>
            ) : (
              <motion.div key="filebox" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {/* File list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
                  {docFiles.map((file, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 10, padding: '12px 16px' }}>
                      <FileText size={20} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{(file.size / 1024).toFixed(1)} KB</div>
                      </div>
                      <button onClick={() => removeFile(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: 4 }} title="Remove file">
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Additional file trigger / Clear all */}
                <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
                  <button className="btn-ghost" style={{ fontSize: '0.82rem', padding: '6px 12px' }} onClick={() => fileRef.current?.click()}>
                    + Add More Files
                  </button>
                  <button className="btn-ghost" style={{ fontSize: '0.82rem', padding: '6px 12px', color: '#EF4444' }} onClick={clearAllFiles}>
                    Clear All
                  </button>
                  {docFiles.length > 0 && !extracted && !extracting && (
                    <button className="btn-primary" style={{ fontSize: '0.82rem', padding: '6px 16px', background: '#10B981', borderColor: '#10B981', color: '#fff', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }} onClick={triggerExtraction}>
                      <Sparkles size={14} /> CliamAI Extract Details
                    </button>
                  )}
                  <input ref={fileRef} type="file" multiple hidden accept=".pdf,.jpg,.jpeg,.png,.txt,.doc,.docx" onChange={onFileInput} />
                </div>

                {extracting && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', background: 'rgba(99,102,241,0.05)', borderRadius: 10, border: '1px solid rgba(99,102,241,0.12)' }}>
                    <Loader2 size={16} className="spin" style={{ color: 'var(--primary)' }} />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>ClaimAI Extracting Claim Details…</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Reading documents and extracting structured data</div>
                    </div>
                  </div>
                )}

                {extractError && !extracting && (
                  <div style={{ display: 'flex', gap: 10, padding: '12px 14px', background: 'rgba(239,68,68,0.07)', borderRadius: 10, border: '1px solid rgba(239,68,68,0.2)', color: '#F87171', fontSize: '0.83rem' }}>
                    <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                    {extractError}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <div style={{ marginTop: 12, fontSize: '0.78rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sparkles size={12} style={{ color: 'var(--primary-light)' }} />
            Required documents: CLAIM FORM, MEDICAL REPORT, TEST REPORT, ID CARD.
          </div>
        </motion.div>

        {/* ── STEP 3: AI Extracted Review ── */}
        <AnimatePresence>
          {extracted && !extracting && (
            <motion.div key="review" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              style={{ background: 'var(--surface)', border: '1.5px solid rgba(16,185,129,0.25)', borderRadius: 14, padding: '20px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <Sparkles size={16} style={{ color: '#10B981' }} />
                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Step 3 — Review Extracted Details</span>
                {extracted.extracted && (
                  <span style={{ marginLeft: 'auto', fontSize: '0.72rem', fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: 'rgba(16,185,129,0.15)', color: '#10B981', border: '1px solid rgba(16,185,129,0.25)' }}>
                    ✓ ClaimAI Extracted
                  </span>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <ReviewField label="Claim Type" value={CLAIM_TYPE_LABELS[extracted.claim_type] || extracted.claim_type} />
                <ReviewField label="Incident Date" value={fmt(extracted.incident_date)} />
                <ReviewField label="Incident Location" value={extracted.incident_location || '—'} />
                <ReviewField label="Channel" value={extracted.channel} />
                <div style={{ gridColumn: '1 / -1' }}>
                  <ReviewField label="Incident Description" value={extracted.incident_description} multiline />
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

{/* {showMissingModal && extracted && (
  <div
    style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.65)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    }}
  >
    <div
      style={{
        width: 620,
        maxWidth: '95vw',
        maxHeight: '85vh',
        overflowY: 'auto',
        background: 'linear-gradient(180deg, rgba(15,23,42,0.96), rgba(30,41,59,0.96))',
border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12,
        padding: 26,
        boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <AlertTriangle size={22} color="#dc2626" />
        <h2 style={{ color: '#b91c1c', margin: 0, fontSize: 24, fontWeight: 800 }}>
          Missing Required Documents
        </h2>
      </div>

      <p style={{ color: '#334155', fontWeight: 600, marginBottom: 18 }}>
        Here is the document validation summary for your upload:
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {REQUIRED_DOCS.map((doc) => {
          const missing = extracted.missing_categories?.includes(doc.key)

          return (
            <div
              key={doc.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 16px',
                borderRadius: 9,
                background: missing ? '#f0c8e1' : '#c8ffdc',
                color: missing ? '#991b1b' : '#166534',
                fontWeight: 700,
              }}
            >
              <span style={{ fontSize: 20 }}>
                {missing ? '❌' : '✅'}
              </span>
              <span>{doc.label}</span>
            </div>
          )
        })}
      </div>

      <p style={{ color: '#b91d1d', marginTop: 22, lineHeight: 1.5 }}>
        If you proceed without these documents, the application might get rejected.
        Do you want to process with the current files or provide the required documents?
      </p>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, marginTop: 24 }}>
        <button
          type="button"
          onClick={() => setShowMissingModal(false)}
          style={{
            padding: '11px 18px',
            borderRadius: 7,
            border: '1px solid #ef4444',
            background: '#fff',
            color: '#dc2626',
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          PROVIDE REQUIRED
        </button>

        <button
          type="button"
          onClick={() => {
            setShowMissingModal(false)
            handleSubmit()
          }}
          style={{
            padding: '11px 18px',
            borderRadius: 7,
            border: 'none',
            background: '#dc2626',
            color: '#fff',
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          PROCESS ANYWAY
        </button>
      </div>
    </div>
  </div>
)} */}

              <div style={{ marginTop: 12, fontSize: '0.76rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 6, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10 }}>
                <AlertCircle size={12} /> ClaimAI-extracted — please verify before submitting.
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── commented out: Form Fill tab ──────────────────────────────────
        {tab === 'form' && (
          <form onSubmit={submitForm} style={{ display:'flex', flexDirection:'column', gap:18 }}>
            <SharedFields meta={form} setFn={set}/>
            incident_location, contact_phone, incident_description, channel inputs...
            <button type="submit" className="btn-primary">Submit & Run AI Pipeline</button>
          </form>
        )}
        ── commented out: Photo Upload tab ───────────────────────────────────
        {tab === 'photo' && (
          <form onSubmit={submitPhotos} style={{ display:'flex', flexDirection:'column', gap:18 }}>
            <SharedFields meta={photoMeta} setFn={setPhoto} showDesc/>
            Camera dropzone, multiple photo upload, photosRef input...
            <button type="submit" className="btn-primary">Upload Photos & Run AI Pipeline</button>
          </form>
        )}
        ──────────────────────────────────────────────────────────────────── */}

        {/* Submit */}
        <motion.div variants={fadeUp} style={{ display: 'flex', gap: 12 }}>
          {hasAllSuggested ? (
            <button className="btn-primary" onClick={handleSubmit}
              disabled={loading || extracting || docFiles.length === 0 || !selectedPol || !extracted}
              style={{ gap: 8, opacity: (docFiles.length === 0 || !selectedPol || !extracted || extracting) ? 0.5 : 1 }}>
              {loading ? <><Loader2 size={15} className="spin" /> Submitting…</> : <><Send size={15} />Read Claim Documents</>}
            </button>
          ) : (
            <button className="btn-primary" onClick={() => fileRef.current?.click()}
              style={{ gap: 8, background: '#F59E0B', borderColor: '#F59E0B', color: '#fff' }}>
              <Upload size={15} /> Upload More Documents
            </button>
          )}
          <button className="btn-ghost" onClick={() => navigate(-1)}>Cancel</button>
        </motion.div>

      </div>
    </motion.div>
  )
}
