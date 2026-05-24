import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, FileText, Calendar, Tag, Activity, Zap, ChevronDown, ChevronUp, ExternalLink, Download, Upload, X } from 'lucide-react'
import api from '../../services/api'
import { LoadingState, ErrorState } from '../../components/StateViews'
import toast from 'react-hot-toast'
import { useAuthStore } from '../../store/authStore'

const STATUS_LABEL = {
  fnol_received:         'FNOL Received',
  coverage_verification: 'Verifying Coverage',
  damage_assessment:     'Assessing Damage',
  fraud_scoring:         'Fraud Scoring',
  settlement_pending:    'Settlement Pending',
  settled:               'Settled',
  escalated_adjuster:    'With Adjuster',
  escalated_siu:         'Pending for SIU Observation',
  rejected:              'Rejected',
  closed:                'Closed',
  documents_required:    'Documents Required ⚠️',
  documents_rejected:    'Documents Rejected ❌',
}

const STATUS_CLS = {
  settled: 'badge-success', closed: 'badge-success',
  rejected: 'badge-danger', escalated_adjuster: 'badge-danger', escalated_siu: 'badge-danger',
  documents_rejected: 'badge-danger',
}

const PIPELINE_STEPS = [
  'fnol_received','coverage_verification','damage_assessment',
  'fraud_scoring','settlement_pending','settled',
]

const AGENT_META = {
  A2_FNOL_Intake:           { color: '#06B6D4', label: 'A2 — FNOL Intake'        },
  A3_Coverage_Verification: { color: '#4F46E5', label: 'A3 — Coverage Verify'    },
  A4_Damage_Assessment:     { color: '#10B981', label: 'A4 — Damage Assessment'  },
  A5_Fraud_Risk_Scoring:    { color: '#F59E0B', label: 'A5 — Fraud Scoring'      },
  A6_Settlement:            { color: '#10B981', label: 'A6 — Settlement'         },
  A7_Adjuster_Handoff:      { color: '#EF4444', label: 'A7 — Adjuster Handoff'  },
  A8_Chatbot:               { color: '#8B5CF6', label: 'A8 — Claimant Notify'   },

}

const fadeUp = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }
const stagger = { visible: { transition: { staggerChildren: 0.08 } } }

export default function ClaimDetail() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [claim,    setClaim]    = useState(null)
  const [pipeline, setPipeline] = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)
  const [showTrace, setShowTrace] = useState(true)
  const [documents, setDocuments] = useState([])

  // Additional document request / rejection state
  const [newDocs, setNewDocs] = useState([])
  const [uploadingDocs, setUploadingDocs] = useState(false)
  const moreDocsRef = useRef()

  // Reject documents (adjuster)
  const [showRejectModal, setShowRejectModal]   = useState(false)
  const [rejectReason,    setRejectReason]      = useState('')
  const [rejectingDocs,   setRejectingDocs]     = useState(false)

  const loadData = () => {
    Promise.all([
      api.get(`/claims/${id}`),
      api.get(`/fnol/${id}/pipeline`).catch(() => ({ data: null })),
      api.get(`/claims/${id}/documents`).catch(() => ({ data: [] })),
    ]).then(([claimRes, pipeRes, docsRes]) => {
      setClaim(claimRes.data)
      setPipeline(pipeRes.data)
      setDocuments(docsRes.data || [])
    }).catch(e => setError(e?.response?.data?.detail || 'Claim not found'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadData()
  }, [id])

  const handleNewDocs = (e) => {
    const files = Array.from(e.target.files)
    if (files.length > 0) {
      setNewDocs(prev => [...prev, ...files])
    }
  }

  const removeNewDoc = (index) => {
    setNewDocs(prev => prev.filter((_, i) => i !== index))
  }

  const submitNewDocs = async (e) => {
    e.preventDefault()
    if (newDocs.length === 0) {
      toast.error('Please select at least one document.')
      return
    }

    setUploadingDocs(true)
    const formData = new FormData()
    newDocs.forEach(file => {
      formData.append('files', file)
    })

    try {
      await api.post(`/claims/${id}/upload-more-documents`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      toast.success('Documents uploaded successfully!')
      setNewDocs([])
      if (moreDocsRef.current) moreDocsRef.current.value = ''
      loadData()
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to upload documents.')
    } finally {
      setUploadingDocs(false)
    }
  }

  const handleRejectDocuments = async () => {
    if (!rejectReason.trim()) {
      toast.error('Please provide a rejection reason.')
      return
    }
    setRejectingDocs(true)
    try {
      await api.post(`/claims/${id}/reject-documents`, { reason: rejectReason.trim() })
      toast.success('Documents rejected. Policyholder notified to resubmit.')
      setShowRejectModal(false)
      setRejectReason('')
      loadData()
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to reject documents.')
    } finally {
      setRejectingDocs(false)
    }
  }

  if (loading) return <LoadingState label="Loading claim details…"/>
  if (error)   return <ErrorState message={error} onRetry={() => navigate(-1)}/>
  if (!claim)  return null

  const stepIdx = PIPELINE_STEPS.indexOf(claim.status)
  const stCls   = STATUS_CLS[claim.status] || 'badge-info'
  const trace   = pipeline?.pipeline_trace || []

  return (
    <motion.div initial="hidden" animate="visible" variants={stagger}>
      {/* Back */}
      <motion.div variants={fadeUp}>
        <button className="btn-ghost"
          style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}
          onClick={() => navigate(-1)}>
          <ArrowLeft size={14}/> Back
        </button>
      </motion.div>

      {/* Header */}
      <motion.div variants={fadeUp} className="page-heading">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: '1.4rem' }}>{claim.claim_number}</h1>
          <span className={`badge ${stCls}`}>{STATUS_LABEL[claim.status] || claim.status}</span>
          {claim.document_url && (
            <a
              href={`http://localhost:8000${claim.document_url}?token=${JSON.parse(localStorage.getItem('claimai-auth') || '{}')?.state?.token || ''}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                marginLeft: 'auto',
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600,
                background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)',
                color: 'var(--primary-light)', textDecoration: 'none', cursor: 'pointer',
                transition: 'all 0.18s',
              }}
              title="View uploaded claim document"
            >
              <FileText size={14}/> View Document <ExternalLink size={12}/>
            </a>
          )}
        </div>
        <p style={{ textTransform: 'capitalize' }}>{claim.claim_type.replace(/_/g, ' ')}</p>
      </motion.div>

      {/* Info cards */}
      <motion.div variants={fadeUp} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 16, marginBottom: 24 }}>
        {[
          { icon: Calendar, label: 'Incident Date', value: claim.incident_date ? new Date(claim.incident_date).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—' },
          { icon: Tag,      label: 'Priority',       value: claim.priority?.charAt(0).toUpperCase() + claim.priority?.slice(1) },
          { icon: Activity, label: 'Channel',        value: claim.channel?.toUpperCase() },
          { icon: FileText, label: 'Auto-Settle',    value: claim.auto_settle_eligible ? '✅ Eligible' : '—' },
        ].map(item => (
          <div key={item.label} className="stat-card" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: '14px 16px' }}>
            <item.icon size={18} color="var(--primary-light)"/>
            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: 2 }}>{item.label}</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)' }}>{item.value}</div>
            </div>
          </div>
        ))}
      </motion.div>

      {/* Documents Required Banner */}
      {claim.status === 'documents_required' && (
        <motion.div variants={fadeUp} style={{ marginBottom: 24 }}>
          <div className="dash-section-title" style={{ color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: 6 }}>
            ⚠️ Action Required: Additional Documents Requested
          </div>
          <div className="stat-card" style={{ padding: '20px', border: '1px solid rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.03)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
              <div>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--warning)', letterSpacing: '0.05em' }}>
                  Request Message
                </span>
                <p style={{ fontSize: '0.95rem', color: 'var(--text)', marginTop: 4, lineHeight: 1.5 }}>
                  {claim.document_request_message || 'Please upload the requested supporting documents.'}
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                  Request Count: {claim.document_request_count || 1} / 3
                </span>
                {claim.document_request_by_role && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: 2 }}>
                    Requested by: <span style={{ textTransform: 'capitalize' }}>{claim.document_request_by_role.replace(/_/g, ' ')}</span>
                  </div>
                )}
              </div>
            </div>

            {user?.role === 'policyholder' ? (
              <UploadDocsArea newDocs={newDocs} setNewDocs={setNewDocs} moreDocsRef={moreDocsRef}
                handleNewDocs={handleNewDocs} removeNewDoc={removeNewDoc}
                submitNewDocs={submitNewDocs} uploadingDocs={uploadingDocs}
                accentColor="var(--warning)" buttonGradient="linear-gradient(135deg, var(--warning) 0%, #D97706 100%)"
              />
            ) : (
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 12, marginTop: 12, fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                Waiting for the policyholder to upload the requested files.
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Documents Rejected Banner */}
      {claim.status === 'documents_rejected' && (
        <motion.div variants={fadeUp} style={{ marginBottom: 24 }}>
          <div className="dash-section-title" style={{ color: '#EF4444', display: 'flex', alignItems: 'center', gap: 6 }}>
            ❌ Documents Rejected — Resubmission Required
          </div>
          <div className="stat-card" style={{ padding: '20px', border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.03)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
              <div>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', color: '#EF4444', letterSpacing: '0.05em' }}>
                  Rejection Reason
                </span>
                <p style={{ fontSize: '0.95rem', color: 'var(--text)', marginTop: 4, lineHeight: 1.5 }}>
                  {claim.document_rejection_message || 'Your submitted documents were rejected. Please resubmit with correct documents.'}
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                  Rejection Count: {claim.document_rejection_count || 1} / 3
                </span>
              </div>
            </div>

            {user?.role === 'policyholder' ? (
              <>
                <div style={{ borderTop: '1px solid rgba(239,68,68,0.15)', paddingTop: 12, marginTop: 4, marginBottom: 16, fontSize: '0.82rem', color: '#FCA5A5', background: 'rgba(239,68,68,0.05)', borderRadius: 8, padding: '10px 14px' }}>
                  ⚠️ Please upload the correct or updated documents. Further rejections may escalate your claim to SIU investigation.
                </div>
                <UploadDocsArea newDocs={newDocs} setNewDocs={setNewDocs} moreDocsRef={moreDocsRef}
                  handleNewDocs={handleNewDocs} removeNewDoc={removeNewDoc}
                  submitNewDocs={submitNewDocs} uploadingDocs={uploadingDocs}
                  accentColor="#EF4444" buttonGradient="linear-gradient(135deg, #EF4444 0%, #DC2626 100%)"
                />
              </>
            ) : (
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 12, marginTop: 12, fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                Waiting for the policyholder to resubmit the corrected documents.
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Adjuster: Reject Documents action (shown when docs are available) */}
      {['adjuster','siu_investigator','supervisor','admin'].includes(user?.role) &&
        documents.length > 0 &&
        ['escalated_adjuster','escalated_siu','settlement_pending'].includes(claim.status) && (
        <motion.div variants={fadeUp} style={{ marginBottom: 24 }}>
          <div className="stat-card" style={{ padding: '16px 20px', border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.03)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#EF4444', marginBottom: 4 }}>Document Review Action</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                  Reject submitted documents and request the policyholder to resubmit with corrections.
                  {claim.document_rejection_count > 0 && (
                    <span style={{ marginLeft: 8, color: '#FCA5A5' }}>
                      ({claim.document_rejection_count}/3 rejections used)
                    </span>
                  )}
                </div>
              </div>
              <button
                id="btn-reject-documents"
                onClick={() => setShowRejectModal(true)}
                style={{
                  padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem',
                  background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)',
                  color: '#EF4444', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.18s'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.22)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.12)'}
              >
                ❌ Reject Documents
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Reject Documents Modal */}
      {showRejectModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24
        }}>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 32, maxWidth: 480, width: '100%' }}>
            <h3 style={{ margin: '0 0 8px', color: '#EF4444', fontSize: '1.1rem' }}>❌ Reject Submitted Documents</h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-dim)', marginBottom: 20 }}>
              Provide a clear reason so the policyholder knows what to fix and resubmit.
              After 3 rejections the claim will auto-escalate to SIU.
            </p>
            <textarea
              id="reject-documents-reason"
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="e.g. Medical report is blurry and unreadable. Please resubmit a clear scanned copy."
              rows={4}
              style={{
                width: '100%', padding: '12px 14px', borderRadius: 8, resize: 'vertical',
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(239,68,68,0.3)',
                color: 'var(--text)', fontSize: '0.88rem', lineHeight: 1.5, boxSizing: 'border-box'
              }}
            />
            {claim.document_rejection_count >= 2 && (
              <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', color: '#FCA5A5', fontSize: '0.78rem' }}>
                ⚠️ Warning: This is the final rejection allowed ({(claim.document_rejection_count||0)+1}/3).
                Confirming will auto-escalate this claim to SIU.
              </div>
            )}
            <div style={{ display: 'flex', gap: 12, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowRejectModal(false); setRejectReason('') }}
                style={{ padding: '8px 18px', borderRadius: 8, background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.85rem' }}>
                Cancel
              </button>
              <button onClick={handleRejectDocuments} disabled={rejectingDocs || !rejectReason.trim()}
                style={{
                  padding: '8px 18px', borderRadius: 8, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
                  background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
                  border: 'none', color: '#fff', opacity: !rejectReason.trim() ? 0.5 : 1
                }}>
                {rejectingDocs ? 'Rejecting…' : 'Confirm Rejection'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Description */}
      {claim.incident_description && (
        <motion.div variants={fadeUp} style={{ marginBottom: 24 }}>
          <div className="dash-section-title"><FileText size={14} color="var(--primary-light)"/> Description</div>
          <div className="stat-card" style={{ padding: '16px 20px' }}>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.7 }}>
              {claim.incident_description}
            </p>
          </div>
        </motion.div>
      )}

      {/* Uploaded Documents */}
      {documents.length > 0 && (
        <motion.div variants={fadeUp} style={{ marginBottom: 24 }}>
          <div className="dash-section-title"><FileText size={14} color="var(--primary-light)"/> Uploaded Documents</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {documents.map((doc) => {
              const categoryLabels = {
                claim_form: '📝 Claim Form',
                medical_report: '🏥 Medical Report',
                test_report: '🔬 Test Report',
                id_card: '🆔 ID Card',
                other: '📄 Other Document'
              }
              const token = JSON.parse(localStorage.getItem('claimai-auth') || '{}')?.state?.token || ''
              const docUrl = `http://localhost:8000/api/claims/${id}/documents/${doc.id}?token=${token}`
              return (
                <div key={doc.id} className="stat-card" style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px',
                  border: doc.is_rejected ? '1px solid rgba(239,68,68,0.35)' : undefined,
                  background: doc.is_rejected ? 'rgba(239,68,68,0.04)' : undefined,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                    <FileText size={20} style={{ color: doc.is_rejected ? '#EF4444' : 'var(--primary-light)', flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>
                        {doc.filename}
                        {doc.is_rejected && <span style={{ marginLeft: 6, fontSize: '0.7rem', color: '#EF4444', background: 'rgba(239,68,68,0.12)', padding: '1px 6px', borderRadius: 4 }}>REJECTED</span>}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: 2 }}>
                        {categoryLabels[doc.category] || doc.category}
                        {doc.is_rejected && doc.rejection_reason && (
                          <span style={{ marginLeft: 4, color: '#FCA5A5' }}>· {doc.rejection_reason}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <a href={docUrl} target="_blank" rel="noopener noreferrer"
                    className="btn-ghost"
                    style={{ padding: '6px 10px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none', color: 'var(--primary-light)' }}
                  >
                    View <ExternalLink size={12} />
                  </a>
                </div>
              )
            })}
          </div>
        </motion.div>
      )}

      {/* Visual pipeline tracker */}
      <motion.div variants={fadeUp} style={{ marginBottom: 24 }}>
        <div className="dash-section-title"><Activity size={14} color="var(--primary-light)"/> Claim Status Pipeline</div>
        <div className="stat-card">
          {PIPELINE_STEPS.map((step, i) => {
            const done   = i < stepIdx
            const active = i === stepIdx
            const label  = step.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
            return (
              <div key={step} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: i < PIPELINE_STEPS.length - 1 ? 12 : 0 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                  background: done ? 'rgba(16,185,129,0.2)' : active ? 'rgba(79,70,229,0.2)' : 'rgba(255,255,255,0.05)',
                  border: `2px solid ${done ? '#10B981' : active ? '#818CF8' : 'rgba(255,255,255,0.1)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.75rem', fontWeight: 700,
                  color: done ? '#10B981' : active ? '#818CF8' : 'var(--text-dim)',
                }}>
                  {done ? '✓' : i + 1}
                </div>
                <span style={{
                  fontSize: '0.88rem', fontWeight: active ? 600 : 400,
                  color: done ? 'var(--text-muted)' : active ? 'var(--text)' : 'var(--text-dim)',
                }}>{label}</span>
                {active && <span className="badge badge-info" style={{ marginLeft: 'auto' }}>In Progress</span>}
                {done   && <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--success)' }}>Done</span>}
              </div>
            )
          })}
        </div>
      </motion.div>

      {/* Agent trace (if pipeline was run) */}
      {trace.length > 0 && (
        <motion.div variants={fadeUp}>
          <div
            className="dash-section-title"
            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}
            onClick={() => setShowTrace(v => !v)}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Zap size={14} color="#4F46E5"/> AI Agent Execution Trace
              <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontWeight: 400 }}>
                {pipeline?.elapsed_ms}ms total
              </span>
            </span>
            {showTrace ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
          </div>

          {showTrace && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {trace.map((step, i) => {
                const meta = AGENT_META[step.step] || { color: '#818CF8', label: step.step }
                const res  = step.result || {}
                return (
                  <motion.div key={i} variants={fadeUp} style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: `1px solid ${step.status === 'error' ? '#EF444444' : `${meta.color}33`}`,
                    borderLeft: `3px solid ${meta.color}`,
                    borderRadius: 10, padding: '12px 16px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, color: meta.color, fontSize: '0.82rem' }}>{meta.label}</span>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>{step.ms}ms</span>
                        <span className={`badge ${step.status === 'success' ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '0.68rem' }}>
                          {step.status}
                        </span>
                      </div>
                    </div>
                    <div style={{ fontSize: '0.79rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                      {res.message || res.reason || res.error || '—'}
                      {res.fraud_score !== undefined && (
                        <span style={{ marginLeft: 8, color: res.fraud_score > 0.5 ? '#EF4444' : '#F59E0B' }}>
                          · Fraud: {res.fraud_score}
                        </span>
                      )}
                    </div>
                    {res.red_flags?.length > 0 && (
                      <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {res.red_flags.map(f => (
                          <span key={f} style={{
                            background: 'rgba(239,68,68,0.1)', color: '#FCA5A5',
                            padding: '1px 6px', borderRadius: 4, fontSize: '0.67rem',
                          }}>{f}</span>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )
              })}
            </div>
          )}
        </motion.div>
      )}
    </motion.div>
  )
}

/* ─── Reusable upload area (used by both required & rejected banners) ─────── */
function UploadDocsArea({ newDocs, setNewDocs, moreDocsRef, handleNewDocs, removeNewDoc, submitNewDocs, uploadingDocs, accentColor, buttonGradient }) {
  const borderColor = `${accentColor}40`
  return (
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 16, marginTop: 16 }}>
      <div
        style={{ border: `2px dashed ${borderColor}`, borderRadius: 10, padding: '24px 16px', textAlign: 'center', background: 'rgba(255,255,255,0.01)', cursor: 'pointer', transition: 'all 0.2s' }}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); const files = Array.from(e.dataTransfer.files); if (files.length > 0) setNewDocs(prev => [...prev, ...files]) }}
        onClick={() => moreDocsRef.current?.click()}
        onMouseEnter={e => e.currentTarget.style.borderColor = accentColor}
        onMouseLeave={e => e.currentTarget.style.borderColor = borderColor}
      >
        <Upload size={24} style={{ color: accentColor, marginBottom: 8 }}/>
        <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text)' }}>
          Drag &amp; drop files here, or <span style={{ color: 'var(--primary-light)', textDecoration: 'underline' }}>browse</span>
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: 4 }}>Supports PDFs, images, etc. Multiple files allowed.</div>
        <input type="file" ref={moreDocsRef} onChange={handleNewDocs} multiple style={{ display: 'none' }}/>
      </div>

      {newDocs.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>Selected Files ({newDocs.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {newDocs.map((file, index) => (
              <div key={index} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: '0.8rem' }}>
                <span style={{ color: 'var(--text)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '80%' }}>{file.name}</span>
                <button type="button" onClick={() => removeNewDoc(index)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                  <X size={14}/>
                </button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <button type="button" className="btn-primary" onClick={submitNewDocs} disabled={uploadingDocs}
              style={{ padding: '8px 16px', fontSize: '0.85rem', boxShadow: 'none', background: buttonGradient }}>
              {uploadingDocs ? 'Uploading...' : 'Submit Documents'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
