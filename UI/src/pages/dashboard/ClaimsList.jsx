import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Shield, Car, Home, Heart, Briefcase, FileText, ChevronDown, ChevronRight } from 'lucide-react'
import { useClaims } from '../../hooks/useClaims'
import { LoadingState, ErrorState, EmptyState } from '../../components/StateViews'
import api from '../../services/api'

const PRIORITY_COLOR = { low: '#10B981', medium: '#F59E0B', high: '#EF4444', critical: '#8B5CF6' }
const fadeUp = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }
const stagger = { visible: { transition: { staggerChildren: 0.07 } } }

const getPolicyIcon = (type) => {
  switch (type) {
    case 'auto':
      return <Car size={18} style={{ color: '#22d3ee' }} />; // cyan-400
    case 'property':
      return <Home size={18} style={{ color: '#34d399' }} />; // emerald-400
    case 'health':
      return <Heart size={18} style={{ color: '#fb7185' }} />; // rose-400
    case 'life':
      return <Heart size={18} style={{ color: '#f472b6' }} />; // pink-400
    case 'commercial':
      return <Briefcase size={18} style={{ color: '#fbbf24' }} />; // amber-400
    default:
      return <Shield size={18} style={{ color: '#818cf8' }} />; // indigo-400
  }
}

export default function ClaimsList() {
  const navigate = useNavigate()
  const { claims, loading, error, refetch, STATUS_CONFIG } = useClaims()
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
      <motion.div variants={fadeUp} className="page-heading">
        <h1>All My Claims</h1>
        <p>Full history of all submitted insurance claims grouped by policy</p>
      </motion.div>

      {isDataLoading && <LoadingState label="Fetching claims & policy details…"/>}
      {!isDataLoading && error && <ErrorState message={error} onRetry={refetch}/>}
      {!isDataLoading && !error && claims.length === 0 && (
        <EmptyState label="No claims found. File your first claim to get started."/>
      )}

      {!isDataLoading && !error && claims.length > 0 && (
        <motion.div variants={fadeUp} className="claims-grouped-list">
          {Object.keys(claimsByPolicy).map(policyId => {
            const policyInfo = policyMap[policyId]
            const policyClaims = claimsByPolicy[policyId]
            const icon = policyInfo ? getPolicyIcon(policyInfo.policy_type) : <Shield size={18} style={{ color: '#818cf8' }} />
            const isExpanded = !!expandedPolicies[policyId]

            return (
              <div key={policyId} className="policy-claims-group" style={{ marginBottom: '24px' }}>
                {/* Policy Header Block */}
                <div className="policy-group-header"
                  onClick={() => togglePolicy(policyId)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '16px 20px',
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
                      width: '36px',
                      height: '36px',
                      borderRadius: '8px',
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
                        <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)' }}>
                          {policyInfo ? `${policyInfo.insurance_company || 'Insurance'} — ${policyInfo.plan_name || 'Policy'}` : 'Other Policy'}
                        </h3>
                        <span className="badge badge-info" style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', height: 'fit-content' }}>
                          {policyClaims.length} {policyClaims.length === 1 ? 'Claim' : 'Claims'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '12px', marginTop: '4px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        <span>Policy No: <strong style={{ color: 'var(--text-muted)' }}>{policyInfo?.policy_number || `ID: ${policyId}`}</strong></span>
                        {policyInfo && (
                          <>
                            <span>•</span>
                            <span style={{ textTransform: 'capitalize' }}>Type: {policyInfo.policy_type}</span>
                            <span>•</span>
                            <span>Limit: ₹{parseFloat(policyInfo.coverage_limit || 0).toLocaleString('en-IN')}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {policyInfo && (
                      <button
                        className="btn-ghost"
                        style={{ fontSize: '0.78rem', padding: '6px 12px' }}
                        onClick={(e) => {
                          e.stopPropagation()
                          navigate(`/dashboard/policies/${policyInfo.id}`)
                        }}
                      >
                        View Policy →
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
                      {/* Table containing policy-specific claims */}
                      <div className="dash-table-wrap" style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
                        <table className="dash-table">
                          <thead>
                            <tr>
                              <th>Claim #</th><th>Type</th><th>Incident Date</th>
                              <th>Channel</th><th>Priority</th><th>Status</th><th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {policyClaims.map(c => {
                              const st = STATUS_CONFIG[c.status] || { label: c.status, cls: 'badge-info' }
                              return (
                                <tr key={c.id}>
                                  <td><code style={{ color: 'var(--primary-light)', fontSize: '0.82rem' }}>{c.claim_number}</code></td>
                                  <td style={{ textTransform: 'capitalize' }}>{c.claim_type.replace(/_/g, ' ')}</td>
                                  <td style={{ color: 'var(--text-muted)' }}>
                                    {c.incident_date ? new Date(c.incident_date).toLocaleDateString('en-IN') : '—'}
                                  </td>
                                  <td style={{ color: 'var(--text-muted)', textTransform: 'capitalize' }}>{c.channel}</td>
                                  <td>
                                    <span style={{ color: PRIORITY_COLOR[c.priority], fontWeight: 600, fontSize: '0.8rem' }}>
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
                                      View →
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
        </motion.div>
      )}
    </motion.div>
  )
}

