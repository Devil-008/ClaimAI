import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, FileText, Calendar, Tag, Activity, Zap, ChevronDown, ChevronUp, ExternalLink, Download } from 'lucide-react'
import api from '../../services/api'
import { LoadingState, ErrorState } from '../../components/StateViews'

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
}

const STATUS_CLS = {
  settled: 'badge-success', closed: 'badge-success',
  rejected: 'badge-danger', escalated_adjuster: 'badge-danger', escalated_siu: 'badge-danger',
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
  const [claim,    setClaim]    = useState(null)
  const [pipeline, setPipeline] = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)
  const [showTrace, setShowTrace] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get(`/claims/${id}`),
      api.get(`/fnol/${id}/pipeline`).catch(() => ({ data: null })),
    ]).then(([claimRes, pipeRes]) => {
      setClaim(claimRes.data)
      setPipeline(pipeRes.data)
    }).catch(e => setError(e?.response?.data?.detail || 'Claim not found'))
      .finally(() => setLoading(false))
  }, [id])

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
                      {res.net_estimate !== undefined && (
                        <span style={{ marginLeft: 8, color: '#10B981', fontWeight: 600 }}>
                          ₹{Number(res.net_estimate).toLocaleString('en-IN')}
                        </span>
                      )}
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
