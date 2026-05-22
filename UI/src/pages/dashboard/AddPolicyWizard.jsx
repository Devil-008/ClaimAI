import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Upload, Edit3, CheckCircle2,
  Loader2, Save, RefreshCw, FileText, User,
  Calendar, DollarSign, Building2, ChevronDown, ChevronUp
} from 'lucide-react'
import api from '../../services/api'
import toast from 'react-hot-toast'

const POLICY_TYPES = [
  { value: 'auto',       label: '🚗 Auto / Vehicle'    },
  { value: 'property',   label: '🏠 Property / Home'   },
  { value: 'health',     label: '🏥 Health / Medical'  },
  { value: 'life',       label: '🛡 Life Insurance'    },
  { value: 'commercial', label: '🏢 Commercial'         },
]

const TABS = [
  { id: 'upload', icon: Upload, label: 'Upload Document', desc: 'PDF, DOC, image' },
  { id: 'manual', icon: Edit3,  label: 'Fill Manually',   desc: 'Enter details by hand' },
]

const fadeUp = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }
const stagger = { visible: { transition: { staggerChildren: 0.06 } } }

function Field({ label, required, children, half }) {
  return (
    <div className="form-group" style={half ? {} : {}}>
      <label className="form-label">
        {label}{required && <span style={{ color: '#EF4444' }}> *</span>}
      </label>
      {children}
    </div>
  )
}

// ── Confidence badge ──────────────────────────────────────────
function ConfBadge({ conf }) {
  const cfg = {
    high:   { color: '#10B981', bg: 'rgba(16,185,129,0.12)', label: '✅ High confidence' },
    medium: { color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', label: '⚠️ Medium — verify fields' },
    low:    { color: '#EF4444', bg: 'rgba(239,68,68,0.12)',  label: '❌ Low — many fields missing' },
  }[conf] || {}
  return (
    <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: 6, background: cfg.bg, color: cfg.color }}>
      {cfg.label}
    </span>
  )
}

// ── Extracted field preview card ──────────────────────────────
function ExtractedPreview({ ext, rawText, show, setShow }) {
  const fields = [
    { icon: FileText,   label: 'Policy Number',     value: ext.policy_number     },
    { icon: Building2,  label: 'Insurance Company',  value: ext.insurance_company },
    { icon: FileText,   label: 'Plan Name',          value: ext.plan_name         },
    { icon: User,       label: 'Policyholder',       value: ext.policyholder_name },
    { icon: Calendar,   label: 'Date of Birth',      value: ext.date_of_birth     },
    { icon: User,       label: 'Nominee',            value: ext.nominee_name      },
    { icon: DollarSign, label: 'Coverage Limit',     value: ext.coverage_limit ? `₹${Number(ext.coverage_limit).toLocaleString('en-IN')}` : null },
    { icon: DollarSign, label: 'Premium',            value: ext.premium ? `₹${Number(ext.premium).toLocaleString('en-IN')}` : null },
    { icon: Calendar,   label: 'Effective Date',     value: ext.effective_date    },
    { icon: Calendar,   label: 'Expiry Date',        value: ext.expiry_date       },
  ]

  return (
    <div style={{ marginBottom: 20 }}>
      {/* Banner */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 18px', borderRadius: 12,
        background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)',
        marginBottom: 12,
      }}>
        <CheckCircle2 size={20} color="#10B981"/>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, color: '#10B981', fontSize: '0.9rem' }}>
            Document analysed — review extracted data below
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
            <ConfBadge conf={ext.extraction_confidence}/>
            {ext.note && <span style={{ marginLeft: 8 }}>{ext.note}</span>}
          </div>
        </div>
      </div>

      {/* Extracted fields quick-view */}
      <div
        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: '0.82rem', color: 'var(--text-dim)' }}
        onClick={() => setShow(v => !v)}>
        {show ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
        {show ? 'Hide' : 'Show'} extracted field summary
      </div>

      {show && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 8, marginBottom: 16 }}>
          {fields.filter(f => f.value).map(f => (
            <div key={f.label} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'rgba(255,255,255,0.03)', borderRadius: 8,
              padding: '8px 12px', border: '1px solid rgba(255,255,255,0.06)',
            }}>
              <f.icon size={13} color="var(--primary-light)"/>
              <div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>{f.label}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text)', fontWeight: 500 }}>{f.value}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Raw text preview */}
      {rawText && (
        <details style={{ marginBottom: 8 }}>
          <summary style={{ fontSize: '0.78rem', color: 'var(--text-dim)', cursor: 'pointer', marginBottom: 6 }}>
            📄 View raw extracted text
          </summary>
          <pre style={{
            background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: '10px 14px',
            fontSize: '0.72rem', color: 'var(--text-muted)', overflowX: 'auto',
            maxHeight: 200, whiteSpace: 'pre-wrap', lineHeight: 1.6,
          }}>{rawText}</pre>
        </details>
      )}
    </div>
  )
}

// ── Full policy form ──────────────────────────────────────────
function PolicyForm({ data, setData, onSubmit, loading, btnLabel, hint }) {
  const set = (k, v) => setData(f => ({ ...f, [k]: v }))
  const [showExtra, setShowExtra] = useState(true)

  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {hint && (
        <div style={{
          padding: '10px 14px', borderRadius: 10, marginBottom: 18,
          background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
          fontSize: '0.8rem', color: '#FCD34D',
        }}>✏️ {hint}</div>
      )}

      {/* Section: Policy Identity */}
      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.08em', marginBottom: 12, marginTop: 4 }}>
        POLICY IDENTITY
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <Field label="Policy Number" required>
          <input className="form-input" placeholder="e.g. 27704113" value={data.policy_number || ''}
            onChange={e => set('policy_number', e.target.value)} required/>
        </Field>
        <Field label="Policy Type" required>
          <select className="form-input" value={data.policy_type || 'health'} onChange={e => set('policy_type', e.target.value)}>
            {POLICY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </Field>
        <Field label="Plan / Product Name">
          <input className="form-input" placeholder="e.g. GC 360°" value={data.plan_name || ''}
            onChange={e => set('plan_name', e.target.value)}/>
        </Field>
        <Field label="Insurance Company">
          <input className="form-input" placeholder="e.g. Care Health Insurance Limited" value={data.insurance_company || ''}
            onChange={e => set('insurance_company', e.target.value)}/>
        </Field>
      </div>

      {/* Section: Coverage */}
      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.08em', marginBottom: 12 }}>
        COVERAGE & PREMIUM
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
        <Field label="Coverage Limit (₹)" required>
          <input className="form-input" type="number" min={0} placeholder="500000"
            value={data.coverage_limit || ''} onChange={e => set('coverage_limit', e.target.value)} required/>
        </Field>
        <Field label="Annual Premium (₹)">
          <input className="form-input" type="number" min={0} placeholder="12000"
            value={data.premium || 0} onChange={e => set('premium', e.target.value)}/>
        </Field>
        <Field label="Deductible (₹)">
          <input className="form-input" type="number" min={0} placeholder="0"
            value={data.deductible || 0} onChange={e => set('deductible', e.target.value)}/>
        </Field>
      </div>

      {/* Section: Dates */}
      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.08em', marginBottom: 12 }}>
        POLICY PERIOD
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <Field label="Effective Date" required>
          <input className="form-input" type="date" value={data.effective_date || ''}
            onChange={e => set('effective_date', e.target.value)} required/>
        </Field>
        <Field label="Expiry Date" required>
          <input className="form-input" type="date" value={data.expiry_date || ''}
            onChange={e => set('expiry_date', e.target.value)} required/>
        </Field>
      </div>

      {/* Section: Policyholder Details — collapsible */}
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: 12 }}
        onClick={() => setShowExtra(v => !v)}
      >
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.08em' }}>
          POLICYHOLDER & NOMINEE
        </div>
        {showExtra ? <ChevronUp size={14} color="var(--text-dim)"/> : <ChevronDown size={14} color="var(--text-dim)"/>}
      </div>
      {showExtra && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <Field label="Policyholder Name">
            <input className="form-input" placeholder="e.g. Rupam Ghosh" value={data.policyholder_name || ''}
              onChange={e => set('policyholder_name', e.target.value)}/>
          </Field>
          <Field label="Date of Birth">
            <input className="form-input" type="date" value={data.date_of_birth || ''}
              onChange={e => set('date_of_birth', e.target.value)}/>
          </Field>
          <Field label="Nominee Name">
            <input className="form-input" placeholder="e.g. Legal Heir" value={data.nominee_name || ''}
              onChange={e => set('nominee_name', e.target.value)}/>
          </Field>
          <Field label="Coverage Description">
            <input className="form-input" placeholder="e.g. Comprehensive Health Cover" value={data.coverage_type || ''}
              onChange={e => set('coverage_type', e.target.value)}/>
          </Field>
        </div>
      )}

      {/* Benefits & Exclusions */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
        <Field label="Benefits">
          <textarea className="form-input" rows={10} placeholder="Covered: hospitalization, OPD…"
            value={data.benefits || ''} onChange={e => set('benefits', e.target.value)} style={{ resize: 'vertical', minHeight: 200, lineHeight: 1.5 }}/>
        </Field>
        <Field label="Exclusions">
          <textarea className="form-input" rows={10} placeholder="Not covered: pre-existing (2 yr), cosmetic…"
            value={data.exclusions || ''} onChange={e => set('exclusions', e.target.value)} style={{ resize: 'vertical', minHeight: 200, lineHeight: 1.5 }}/>
        </Field>
      </div>

      <button type="submit" className="btn-primary" disabled={loading} style={{ gap: 8, alignSelf: 'flex-start' }}>
        {loading
          ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }}/> Saving…</>
          : <><Save size={15}/> {btnLabel}</>
        }
      </button>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </form>
  )
}

// ── Main Wizard ───────────────────────────────────────────────
export default function AddPolicyWizard() {
  const navigate = useNavigate()
  const fileRef  = useRef()
  const [tab,       setTab]       = useState('upload')
  const [loading,   setLoading]   = useState(false)
  const [uploading, setUploading] = useState(false)
  const [extracted, setExtracted] = useState(null)
  const [rawText,   setRawText]   = useState('')
  const [showExt,   setShowExt]   = useState(true)
  const [docFile,   setDocFile]   = useState(null)

  const emptyForm = {
    policy_number: '', policy_type: 'health', plan_name: '', insurance_company: '',
    policyholder_name: '', date_of_birth: '', nominee_name: '',
    coverage_type: '', coverage_limit: '', deductible: 0, premium: 0,
    effective_date: '', expiry_date: '', benefits: '', exclusions: '',
    extra_details: '',
  }
  const [formData, setFormData] = useState(emptyForm)

  // ── Upload & extract ────────────────────────────────────────
  async function handleUpload(e) {
    e.preventDefault()
    if (!docFile) return toast.error('Please select a file first')
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', docFile)
      const res = await api.post('/policies/upload', fd)
      if (!res.data.extracted) {
        toast.error('Could not extract text. Please fill manually.')
        setTab('manual')
        return
      }
      const ext = res.data.extracted
      setExtracted(ext)
      setRawText(ext.raw_text_preview || '')
      // Pre-populate form (include file_path so confirm-upload stores it)
      const benefitsStr = Array.isArray(ext.benefits) ? ext.benefits.join('\n') : (ext.benefits || '')
      const exclusionsStr = Array.isArray(ext.exclusions) ? ext.exclusions.join('\n') : (ext.exclusions || '')
      setFormData({
        policy_number:     ext.policy_number     || '',
        policy_type:       ext.policy_type       || 'health',
        plan_name:         ext.plan_name         || '',
        insurance_company: ext.insurance_company || '',
        policyholder_name: ext.policyholder_name || '',
        date_of_birth:     ext.date_of_birth     || '',
        nominee_name:      ext.nominee_name      || '',
        coverage_type:     ext.coverage_type     || '',
        coverage_limit:    ext.coverage_limit    || '',
        deductible:        ext.deductible        || 0,
        premium:           ext.premium           || 0,
        effective_date:    ext.effective_date    || '',
        expiry_date:       ext.expiry_date       || '',
        benefits:          benefitsStr,
        exclusions:        exclusionsStr,
        file_path:         ext.file_path         || res.data.file_path || '',
        extra_details:     ext.extra_details     || '',
      })
      toast.success(`${res.data.message}`)
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Upload failed')
    } finally { setUploading(false) }
  }

  // ── Save ────────────────────────────────────────────────────
  async function handleSave(e) {
    e.preventDefault()
    if (!formData.policy_number || !formData.effective_date || !formData.expiry_date || !formData.coverage_limit) {
      return toast.error('Policy Number, Coverage Limit, and Dates are required')
    }
    setLoading(true)
    try {
      const endpoint = extracted ? '/policies/confirm-upload' : '/policies/add-manual'
      await api.post(endpoint, {
        ...formData,
        coverage_limit: Number(formData.coverage_limit),
        deductible:     Number(formData.deductible || 0),
        premium:        Number(formData.premium    || 0),
        date_of_birth:  formData.date_of_birth || null,
      })
      toast.success('Policy saved! You can now file claims against it.')
      navigate('/dashboard/policies')
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to save policy')
    } finally { setLoading(false) }
  }

  return (
    <motion.div initial="hidden" animate="visible" variants={stagger} style={{ maxWidth: 780 }}>
      {/* Back */}
      <motion.div variants={fadeUp}>
        <button className="btn-ghost"
          style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}
          onClick={() => navigate(-1)}>
          <ArrowLeft size={14}/> Back to My Policies
        </button>
      </motion.div>

      {/* Heading */}
      <motion.div variants={fadeUp} className="page-heading">
        <h1>Add a Policy</h1>
        <p>Upload your policy PDF for AI extraction, or fill details manually. Claims can only be filed against registered policies.</p>
      </motion.div>

      {/* Tabs */}
      <motion.div variants={fadeUp} style={{ display: 'flex', gap: 8, marginBottom: 28 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setExtracted(null) }} style={{
            flex: 1, padding: '12px 8px', borderRadius: 12, cursor: 'pointer',
            border: `2px solid ${tab === t.id ? 'var(--primary)' : 'rgba(255,255,255,0.08)'}`,
            background: tab === t.id ? 'rgba(79,70,229,0.15)' : 'rgba(255,255,255,0.02)',
            color: tab === t.id ? 'var(--primary-light)' : 'var(--text-muted)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, transition: 'all 0.2s',
          }}>
            <t.icon size={20}/>
            <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{t.label}</span>
            <span style={{ fontSize: '0.68rem', opacity: 0.7 }}>{t.desc}</span>
          </button>
        ))}
      </motion.div>

      <AnimatePresence mode="wait">
        {/* ── Upload tab: drop zone ────────────────────────── */}
        {tab === 'upload' && !extracted && (
          <motion.form key="upload"
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
            onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            <div onClick={() => fileRef.current.click()} style={{
              border: `2px dashed ${docFile ? 'var(--primary)' : 'rgba(255,255,255,0.12)'}`,
              borderRadius: 16, padding: '44px 24px', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
              background: docFile ? 'rgba(79,70,229,0.08)' : 'rgba(255,255,255,0.02)', transition: 'all 0.2s',
            }}>
              {docFile
                ? <CheckCircle2 size={40} color="var(--primary-light)"/>
                : <Upload size={40} color="var(--text-dim)"/>
              }
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 600, color: docFile ? 'var(--primary-light)' : 'var(--text-muted)', marginBottom: 4 }}>
                  {docFile ? docFile.name : 'Click to upload your policy document'}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>PDF, DOC, DOCX, TXT — up to 10 MB</div>
              </div>
            </div>
            <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
              style={{ display: 'none' }} onChange={e => setDocFile(e.target.files[0])}/>

            {/* What AI extracts */}
            <div style={{ padding: '14px 18px', borderRadius: 12, background: 'rgba(79,70,229,0.08)', border: '1px solid rgba(79,70,229,0.2)', fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.8 }}>
              🤖 <strong style={{ color: 'var(--primary-light)' }}>ClaimAI will extract:</strong>{' '}
              Policy Number · Plan Name · Insurer · Policyholder Name · Date of Birth · Nominee ·
              Coverage Limit · Premium · Effective &amp; Expiry Dates · Benefits · Exclusions
            </div>

            <button type="submit" className="btn-primary" disabled={uploading || !docFile} style={{ gap: 8, alignSelf: 'flex-start' }}>
              {uploading
                ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }}/> Analysing PDF…</>
                : <><Upload size={15}/> Reading Policy Documents</>
              }
            </button>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </motion.form>
        )}

        {/* ── After extraction: review + confirm ─────────── */}
        {tab === 'upload' && extracted && (
          <motion.div key="confirm"
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <ExtractedPreview ext={extracted} rawText={rawText} show={showExt} setShow={setShowExt}/>
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              <button className="btn-ghost" onClick={() => { setExtracted(null); setDocFile(null) }}
                style={{ padding: '7px 12px', fontSize: '0.78rem', display: 'flex', gap: 4, alignItems: 'center' }}>
                <RefreshCw size={12}/> Re-upload
              </button>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                Review the fields below. AI-extracted values are pre-filled — correct if needed.
              </span>
            </div>
            <PolicyForm data={formData} setData={setFormData}
              onSubmit={handleSave} loading={loading}
              btnLabel="Confirm & Save Policy"/>
          </motion.div>
        )}

        {/* ── Manual tab ──────────────────────────────────── */}
        {tab === 'manual' && (
          <motion.div key="manual"
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <PolicyForm data={formData} setData={setFormData}
              onSubmit={handleSave} loading={loading}
              btnLabel="Save Policy"/>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
