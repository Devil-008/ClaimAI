import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { FileText, Clock, CheckCircle2, XCircle, ArrowRight, Eye, AlertTriangle, Loader2 } from 'lucide-react'
import api from '../../services/api'
import ClaimReviewDrawer from '../../components/ClaimReviewDrawer'

const PRIORITY_CONFIG = {
  normal:   { label:'Normal',   cls:'badge-info'    },
  medium:   { label:'Medium',   cls:'badge-info'    },
  urgent:   { label:'Urgent',   cls:'badge-warning' },
  high:     { label:'High',     cls:'badge-warning' },
  critical: { label:'Critical', cls:'badge-danger'  },
  low:      { label:'Low',      cls:'badge-success' },
}

const fadeUp = { hidden:{opacity:0,y:20}, visible:{opacity:1,y:0} }
const stagger = { visible:{ transition:{ staggerChildren:0.08 } } }

function fmt(d) {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) }
  catch { return d }
}

export default function AdjusterHome() {
  const navigate = useNavigate()
  const [claims,    setClaims]    = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)
  const [reviewId,  setReviewId]  = useState(null)   // drawer open

  function loadClaims() {
    setLoading(true)
    api.get('/claims/?status=escalated_adjuster&limit=50')
      .then(r => setClaims(r.data || []))
      .catch(() => setError('Failed to load claims'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadClaims() }, [])

  const stats = [
    { icon:Clock,        label:'In My Queue',   value: loading ? '…' : claims.length,
      color:'#4F46E5', bg:'rgba(79,70,229,0.12)' },
    { icon:Eye,          label:'Under Review',  value: loading ? '…' : claims.filter(c => c.priority === 'high' || c.priority === 'critical').length,
      color:'#F59E0B', bg:'rgba(245,158,11,0.12)' },
    { icon:CheckCircle2, label:'Critical',      value: loading ? '…' : claims.filter(c => c.priority === 'critical').length,
      color:'#EF4444', bg:'rgba(239,68,68,0.12)' },
    { icon:XCircle,      label:'Total Escalated',value: loading ? '…' : claims.length,
      color:'#10B981', bg:'rgba(16,185,129,0.12)' },
  ]

  return (
    <motion.div initial="hidden" animate="visible" variants={stagger}>
      <motion.div variants={fadeUp} className="page-heading">
        <h1>Adjuster Queue</h1>
        <p>AI-escalated complex claims awaiting your review and decision</p>
      </motion.div>

      <motion.div variants={fadeUp} className="stats-grid">
        {stats.map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-card-icon" style={{ background:s.bg }}>
              <s.icon size={20} color={s.color}/>
            </div>
            <div className="stat-value" style={{ color:s.color }}>{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </motion.div>

      <motion.div variants={fadeUp}>
        <div className="dash-section-title">
          <FileText size={16} color="#4F46E5"/> Escalated Claims — Awaiting Decision
        </div>

        {loading && (
          <div style={{ display:'flex', alignItems:'center', gap:10, padding:'24px', color:'var(--text-dim)' }}>
            <Loader2 size={16} className="spin"/> Loading claims…
          </div>
        )}

        {error && (
          <div style={{ padding:'16px', borderRadius:10, background:'rgba(239,68,68,0.07)', border:'1px solid rgba(239,68,68,0.2)', color:'#F87171', fontSize:'0.85rem' }}>
            <AlertTriangle size={14} style={{ display:'inline', marginRight:6 }}/>{error}
          </div>
        )}

        {!loading && !error && claims.length === 0 && (
          <div style={{ padding:'32px', textAlign:'center', color:'var(--text-dim)' }}>
            <CheckCircle2 size={32} style={{ margin:'0 auto 12px', display:'block', color:'#10B981' }}/>
            <div style={{ fontWeight:600, marginBottom:4 }}>All caught up!</div>
            <div style={{ fontSize:'0.85rem' }}>No claims currently assigned for adjuster review.</div>
          </div>
        )}

        {!loading && claims.length > 0 && (
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Claim #</th><th>Type</th><th>Incident Date</th>
                  <th>Priority</th><th>Status</th><th>Action</th>
                </tr>
              </thead>
              <tbody>
                {claims.map(c => {
                  const p = PRIORITY_CONFIG[c.priority] || { label: c.priority, cls:'badge-info' }
                  return (
                    <tr key={c.id}>
                      <td><code style={{ color:'#818CF8', fontSize:'0.82rem' }}>{c.claim_number}</code></td>
                      <td style={{ color:'var(--text-muted)', textTransform:'capitalize' }}>
                        {(c.claim_type || '').replace(/_/g,' ')}
                      </td>
                      <td style={{ color:'var(--text-muted)', fontSize:'0.82rem' }}>{fmt(c.incident_date)}</td>
                      <td><span className={`badge ${p.cls}`}>{p.label}</span></td>
                      <td><span className="badge badge-warning">Escalated — Adjuster</span></td>
                      <td>
                        <button
                          className="btn-primary"
                          style={{ padding:'6px 14px', fontSize:'0.78rem' }}
                          onClick={() => setReviewId(c.id)}
                        >
                          Review <ArrowRight size={12}/>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      <ClaimReviewDrawer
        claimId={reviewId}
        onClose={() => setReviewId(null)}
        onDecision={() => { setReviewId(null); loadClaims() }}
      />
    </motion.div>
  )
}
