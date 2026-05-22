import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FileText, Clock, CheckCircle2, AlertCircle, PlusCircle, ArrowRight, RefreshCw, Shield, Car, Home, Heart, Briefcase, ChevronDown, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useClaims } from '../../hooks/useClaims'
import { LoadingState, ErrorState, EmptyState } from '../../components/StateViews'
import { useAuthStore } from '../../store/authStore'
import api from '../../services/api'

const PRIORITY_COLOR = {
  low:      '#10B981',
  medium:   '#F59E0B',
  high:     '#EF4444',
  critical: '#8B5CF6',
}

const PIPELINE_STEPS = [
  'fnol_received',
  'coverage_verification',
  'damage_assessment',
  'fraud_scoring',
  'settlement_pending',
  'settled',
]

const STEP_LABEL = {
  fnol_received:         'FNOL Intake',
  coverage_verification: 'Coverage Verify',
  damage_assessment:     'Damage Assessment',
  fraud_scoring:         'Fraud Scoring',
  settlement_pending:    'Settlement',
  settled:               'Settled',
}

const fadeUp = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }
const stagger = { visible: { transition: { staggerChildren: 0.08 } } }

const getPolicyIcon = (type) => {
  switch (type) {
    case 'auto':
      return <Car size={16} style={{ color: '#22d3ee' }} />; // cyan-400
    case 'property':
      return <Home size={16} style={{ color: '#34d399' }} />; // emerald-400
    case 'health':
      return <Heart size={16} style={{ color: '#fb7185' }} />; // rose-400
    case 'life':
      return <Heart size={16} style={{ color: '#f472b6' }} />; // pink-400
    case 'commercial':
      return <Briefcase size={16} style={{ color: '#fbbf24' }} />; // amber-400
    default:
      return <Shield size={16} style={{ color: '#818cf8' }} />; // indigo-400
  }
}

export default function PolicyholderHome() {
  const navigate = useNavigate()
  const user     = useAuthStore(s => s.user)
  const { claims, stats, loading, error, refetch, STATUS_CONFIG } = useClaims()

  // Fetch policies
  const [policies, setPolicies] = useState([])
  const [policiesLoading, setPoliciesLoading] = useState(true)
  const [expandedPolicies, setExpandedPolicies] = useState({})

  const togglePolicy = (policyId) => {
    setExpandedPolicies(prev => ({
      ...prev,
      [policyId]: !prev[policyId]
    }))
  }

  useEffect(() => {
    api.get('/policies/mine')
      .then(res => setPolicies(res.data))
      .catch(() => {})
      .finally(() => setPoliciesLoading(false))
  }, [])

  // Active policies count
  const activePoliciesCount = policies.filter(p => !p.is_expired).length

  // Pick the most recent in-progress claim for the pipeline tracker
  const inProgressClaim = claims.find(c => !['settled', 'closed', 'rejected'].includes(c.status))

  const statCards = [
    { icon: Shield,       label: 'Active Policies', value: policiesLoading ? '—' : activePoliciesCount, color: '#8B5CF6', bg: 'rgba(139,92,246,0.12)', onClick: () => navigate('/dashboard/policies') },
    { icon: FileText,     label: 'Total Claims',    value: loading ? '—' : stats.total,      color: '#06B6D4', bg: 'rgba(6,182,212,0.12)'   },
    { icon: CheckCircle2, label: 'Settled',          value: loading ? '—' : stats.settled,    color: '#10B981', bg: 'rgba(16,185,129,0.12)'  },
    { icon: Clock,        label: 'In Progress',      value: loading ? '—' : stats.inProgress, color: '#F59E0B', bg: 'rgba(245,158,11,0.12)'  },
    { icon: AlertCircle,  label: 'Needs Attention',  value: loading ? '—' : stats.needsAttn,  color: '#EF4444', bg: 'rgba(239,68,68,0.12)'   },
  ]

  // Group claims by policy_id
  const claimsByPolicy = claims.reduce((acc, c) => {
    const pid = c.policy_id || 'unassigned'
    if (!acc[pid]) acc[pid] = []
    acc[pid].push(c)
    return acc
  }, {})

  const policyMap = {}
  policies.forEach(p => {
    policyMap[p.id] = p
  })

  const isDataLoading = loading || policiesLoading

  return (
    <motion.div initial="hidden" animate="visible" variants={stagger}>
      {/* Heading */}
      <motion.div variants={fadeUp} className="page-heading" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1>My Claims</h1>
          <p>Welcome back, <strong>{user?.full_name}</strong> — track and manage your insurance claims in real time</p>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button className="btn-ghost"
            style={{ padding: '8px 14px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={() => navigate('/dashboard/policies')}>
            <Shield size={14}/> My Policies
          </button>
          <button className="btn-ghost"
            style={{ padding: '8px 14px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={refetch} title="Refresh">
            <RefreshCw size={14}/> Refresh
          </button>
          <button className="btn-primary"
            style={{ padding: '8px 14px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={() => navigate('/dashboard/claims/new')}>
            <PlusCircle size={14}/> File Claim
          </button>
        </div>
      </motion.div>

      {/* Stat cards */}
      <motion.div variants={fadeUp} className="stats-grid">
        {statCards.map(s => (
          <div key={s.label} className="stat-card"
            onClick={s.onClick}
            style={{ cursor: s.onClick ? 'pointer' : 'default' }}
          >
            <div className="stat-card-icon" style={{ background: s.bg }}>
              <s.icon size={20} color={s.color}/>
            </div>
            <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </motion.div>

      {/* Claims table */}
      <motion.div variants={fadeUp}>
        <div className="dash-section-title">
          <FileText size={16} color="var(--primary-light)"/> My Claims
        </div>

        {isDataLoading && <LoadingState label="Fetching your claims & policies…"/>}
        {!isDataLoading && error && <ErrorState message={error} onRetry={refetch}/>}
        {!isDataLoading && !error && claims.length === 0 && (
          <EmptyState label="You haven't filed any claims yet. Click 'File a New Claim' to get started."/>
        )}

        {!isDataLoading && !error && claims.length > 0 && (
          <div className="claims-grouped-list">
            {Object.keys(claimsByPolicy).map(policyId => {
              const policyInfo = policyMap[policyId]
              const policyClaims = claimsByPolicy[policyId]
              const icon = policyInfo ? getPolicyIcon(policyInfo.policy_type) : <Shield size={16} style={{ color: '#818cf8' }} />
              const isExpanded = !!expandedPolicies[policyId]

              return (
                <div key={policyId} className="policy-claims-group" style={{ marginBottom: '20px' }}>
                  {/* Policy Header Block */}
                  <div className="policy-group-header"
                    onClick={() => togglePolicy(policyId)}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '14px 18px',
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid var(--border)',
                      borderBottom: isExpanded ? 'none' : '1px solid var(--border)',
                      borderTopLeftRadius: 'var(--radius-lg)',
                      borderTopRightRadius: 'var(--radius-lg)',
                      borderBottomLeftRadius: isExpanded ? 0 : 'var(--radius-lg)',
                      borderBottomRightRadius: isExpanded ? 0 : 'var(--radius-lg)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '6px',
                        background: 'rgba(255, 255, 255, 0.03)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '1px solid var(--border)'
                      }}>
                        {icon}
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <h3 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 700, color: 'var(--text)' }}>
                            {policyInfo ? `${policyInfo.insurance_company || 'Insurance'} — ${policyInfo.plan_name || 'Policy'}` : 'Other Policy'}
                          </h3>
                          <span className="badge badge-info" style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: '4px', height: 'fit-content' }}>
                            {policyClaims.length} {policyClaims.length === 1 ? 'Claim' : 'Claims'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: '10px', marginTop: '2px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          <span>Policy No: <strong style={{ color: 'var(--text-muted)' }}>{policyInfo?.policy_number || `ID: ${policyId}`}</strong></span>
                          {policyInfo && (
                            <>
                              <span>•</span>
                              <span style={{ textTransform: 'capitalize' }}>Type: {policyInfo.policy_type}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {policyInfo && (
                        <button
                          className="btn-ghost"
                          style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                          onClick={(e) => {
                            e.stopPropagation()
                            navigate(`/dashboard/policies/${policyInfo.id}`)
                          }}
                        >
                          View Policy
                        </button>
                      )}
                      <div style={{ color: 'var(--text-dim)', display: 'flex', alignItems: 'center' }}>
                        {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                      </div>
                    </div>
                  </div>

                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        style={{ overflow: 'hidden' }}
                      >
                        <div className="dash-table-wrap" style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
                          <table className="dash-table">
                            <thead>
                              <tr>
                                <th>Claim #</th>
                                <th>Type</th>
                                <th>Date Filed</th>
                                <th>Priority</th>
                                <th>Status</th>
                                <th></th>
                              </tr>
                            </thead>
                            <tbody>
                              {policyClaims.map(c => {
                                const st = STATUS_CONFIG[c.status] || { label: c.status, cls: 'badge-info' }
                                const dateStr = c.incident_date
                                  ? new Date(c.incident_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                                  : '—'
                                return (
                                  <tr key={c.id}>
                                    <td><code style={{ color: 'var(--primary-light)', fontSize: '0.82rem' }}>{c.claim_number}</code></td>
                                    <td style={{ textTransform: 'capitalize' }}>{c.claim_type.replace(/_/g, ' ')}</td>
                                    <td style={{ color: 'var(--text-muted)' }}>{dateStr}</td>
                                    <td>
                                      <span style={{
                                        color: PRIORITY_COLOR[c.priority] || 'var(--text-muted)',
                                        fontWeight: 600, fontSize: '0.8rem',
                                      }}>
                                        ● {c.priority?.charAt(0).toUpperCase() + c.priority?.slice(1)}
                                      </span>
                                    </td>
                                    <td><span className={`badge ${st.cls}`}>{st.label}</span></td>
                                    <td>
                                      <button
                                        className="btn-ghost"
                                        style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          navigate(`/dashboard/claims/${c.id}`)
                                        }}
                                      >
                                        View <ArrowRight size={12}/>
                                      </button>
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            })}
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

