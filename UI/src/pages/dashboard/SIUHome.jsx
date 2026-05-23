import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AlertTriangle, Search, ShieldAlert, Eye, TrendingUp, Loader2, CheckCircle2, ArrowRight } from 'lucide-react'
import api from '../../services/api'
import ClaimReviewDrawer from '../../components/ClaimReviewDrawer'

const RISK_CONFIG = {
  critical: { cls:'badge-danger',  label:'Critical' },
  high:     { cls:'badge-warning', label:'High'     },
  medium:   { cls:'badge-info',    label:'Medium'   },
  low:      { cls:'badge-success', label:'Low'      },
}

const fadeUp = { hidden:{opacity:0,y:20}, visible:{opacity:1,y:0} }
const stagger = { visible:{ transition:{ staggerChildren:0.08 } } }

function fmt(d) {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) }
  catch { return d }
}

export default function SIUHome() {
  const navigate  = useNavigate()
  const [claims,     setClaims]    = useState([])
  const [fraudData,  setFraudData] = useState({})
  const [loading,    setLoading]   = useState(true)
  const [error,      setError]     = useState(null)
  const [reviewId,   setReviewId]  = useState(null)

  async function loadClaims() {
    setLoading(true)
    try {
      const r    = await api.get('/claims/?status=escalated_siu&limit=50')
      const list = r.data || []
      setClaims(list)
      const scores = await Promise.all(
        list.map(c =>
          api.get(`/fnol/${c.id}/pipeline`)
            .then(pr => {
              const trace = pr.data?.pipeline_trace || []
              const a5    = trace.find(s => s.step === 'A5_Fraud_Risk_Scoring')
              return { id: c.id, ...(a5?.result || {}) }
            })
            .catch(() => ({ id: c.id }))
        )
      )
      const map = {}
      scores.forEach(s => { map[s.id] = s })
      setFraudData(map)
    } catch { setError('Failed to load SIU cases') }
    finally { setLoading(false) }
  }

  useEffect(() => { loadClaims() }, [])

  const avgScore = claims.length > 0
    ? (claims.reduce((acc, c) => acc + (fraudData[c.id]?.fraud_score || 0), 0) / claims.length).toFixed(2)
    : '—'

  const stats = [
    { icon:AlertTriangle, label:'Open Cases',       value: loading ? '…' : claims.length,
      color:'#8B5CF6', bg:'rgba(139,92,246,0.12)' },
    { icon:Search,        label:'Critical Risk',    value: loading ? '…' : claims.filter(c => fraudData[c.id]?.risk_level === 'critical').length,
      color:'#EF4444', bg:'rgba(239,68,68,0.12)' },
    { icon:ShieldAlert,   label:'High Risk',        value: loading ? '…' : claims.filter(c => fraudData[c.id]?.risk_level === 'high').length,
      color:'#F59E0B', bg:'rgba(245,158,11,0.12)' },
    { icon:TrendingUp,    label:'Avg Fraud Score',  value: loading ? '…' : avgScore,
      color:'#8B5CF6', bg:'rgba(139,92,246,0.12)' },
  ]

  return (
    <motion.div initial="hidden" animate="visible" variants={stagger}>
      <motion.div variants={fadeUp} className="page-heading">
        <h1>SIU Investigations</h1>
        <p>Fraud-flagged cases referred by the ClaimAI Fraud &amp; Risk Scoring Agent (A5)</p>
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
          <ShieldAlert size={16} color="#8B5CF6"/> Active Fraud Cases
        </div>

        {loading && (
          <div style={{ display:'flex', alignItems:'center', gap:10, padding:'24px', color:'var(--text-dim)' }}>
            <Loader2 size={16} className="spin"/> Loading SIU cases…
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
            <div style={{ fontWeight:600, marginBottom:4 }}>No active SIU cases</div>
            <div style={{ fontSize:'0.85rem' }}>No fraud-flagged claims currently require investigation.</div>
          </div>
        )}

        {!loading && claims.length > 0 && (
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Claim #</th><th>Type</th><th>Incident Date</th>
                  <th>Fraud Score</th><th>Risk Level</th><th>Red Flags</th><th>Action</th>
                </tr>
              </thead>
              <tbody>
                {claims.map(c => {
                  const fd         = fraudData[c.id] || {}
                  const risk       = RISK_CONFIG[fd.risk_level] || { cls:'badge-info', label: fd.risk_level || '—' }
                  const score      = fd.fraud_score ?? null
                  const flags      = fd.red_flags || []
                  const scoreColor = score > 0.8 ? '#EF4444' : score > 0.5 ? '#F59E0B' : '#10B981'
                  return (
                    <tr key={c.id}>
                      <td><code style={{ color:'#A78BFA', fontSize:'0.82rem' }}>{c.claim_number}</code></td>
                      <td style={{ color:'var(--text-muted)', textTransform:'capitalize' }}>
                        {(c.claim_type || '').replace(/_/g,' ')}
                      </td>
                      <td style={{ color:'var(--text-muted)', fontSize:'0.82rem' }}>{fmt(c.incident_date)}</td>
                      <td>
                        {score !== null ? (
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <div style={{ width:48, height:6, borderRadius:3, background:'rgba(255,255,255,0.08)', overflow:'hidden' }}>
                              <div style={{ width:`${score*100}%`, height:'100%', background:scoreColor, borderRadius:3 }}/>
                            </div>
                            <span style={{ color:scoreColor, fontWeight:700, fontSize:'0.82rem' }}>{score.toFixed(2)}</span>
                          </div>
                        ) : <span style={{ color:'var(--text-dim)' }}>—</span>}
                      </td>
                      <td><span className={`badge ${risk.cls}`}>{risk.label}</span></td>
                      <td>
                        {flags.length > 0 ? (
                          <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                            {flags.map(f => (
                              <span key={f} style={{
                                background:'rgba(139,92,246,0.12)', color:'#A78BFA',
                                padding:'2px 6px', borderRadius:4, fontSize:'0.7rem', fontWeight:600,
                              }}>{f}</span>
                            ))}
                          </div>
                        ) : <span style={{ color:'var(--text-dim)', fontSize:'0.82rem' }}>—</span>}
                      </td>
                      <td>
                        <button
                          className="btn-primary"
                          style={{ padding:'6px 14px', fontSize:'0.78rem' }}
                          onClick={() => setReviewId(c.id)}
                        >
                          <Eye size={12}/> Review
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
