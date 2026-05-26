import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Plus, Shield, Calendar, DollarSign, AlertCircle,
  CheckCircle2, Clock, ChevronRight, Trash2, FileText, RefreshCw, Eye, Edit3
} from 'lucide-react'
import api from '../../services/api'
import { LoadingState, ErrorState, EmptyState } from '../../components/StateViews'
import toast from 'react-hot-toast'

const TYPE_ICON  = { auto:'🚗', property:'🏠', health:'🏥', life:'🛡', commercial:'🏢' }
const TYPE_COLOR = {
  auto:       '#06B6D4',
  property:   '#4F46E5',
  health:     '#10B981',
  life:       '#8B5CF6',
  commercial: '#F59E0B',
}

const fadeUp = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }
const stagger = { visible: { transition: { staggerChildren: 0.07 } } }

function StatusBadge({ policy }) {
  const style = { flexShrink: 0, whiteSpace: 'nowrap' }
  if (policy.is_expired) return <span className="badge badge-danger" style={style}>Expired</span>
  if (policy.days_to_expiry <= 30) return <span className="badge badge-warning" style={style}>Expiring Soon</span>
  return <span className="badge badge-success" style={style}>Active</span>
}

function PolicyCard({ policy, onFileClaim, onDelete, onView }) {
  const color  = TYPE_COLOR[policy.policy_type] || '#4F46E5'
  const icon   = TYPE_ICON[policy.policy_type]  || '📋'
  const expFmt = new Date(policy.expiry_date).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
  const effFmt = new Date(policy.effective_date).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })

  return (
    <motion.div variants={fadeUp} style={{
      background: 'rgba(255,255,255,0.03)',
      border: `1px solid ${color}33`,
      borderLeft: `4px solid ${color}`,
      borderRadius: 16, padding: '20px 22px',
      display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.3rem', flexShrink: 0,
          }}>{icon}</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {policy.policy_number}
            </div>
            <div style={{ fontSize: '0.78rem', color: color, fontWeight: 600, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${policy.policy_type.charAt(0).toUpperCase() + policy.policy_type.slice(1)} Insurance${policy.coverage_type ? ` — ${policy.coverage_type}` : ''}`}>
              {policy.policy_type.charAt(0).toUpperCase() + policy.policy_type.slice(1)} Insurance
              {policy.coverage_type && ` — ${policy.coverage_type}`}
            </div>
          </div>
        </div>
        <StatusBadge policy={policy}/>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
        {[
          { icon: DollarSign, label: 'Remaining Cover', value: `₹${Number(policy.remaining_capacity || 0).toLocaleString('en-IN')}` },
          { icon: DollarSign, label: 'Total Limit',     value: `₹${Number(policy.coverage_limit || 0).toLocaleString('en-IN')}` },
          { icon: Calendar,   label: 'Expires',         value: expFmt },
        ].map(s => (
          <div key={s.label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 3 }}>
              <s.icon size={10}/> {s.label}
            </div>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Date range */}
      <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
        📅 Valid: {effFmt} → {expFmt}
        {policy.days_to_expiry > 0
          ? <span style={{ marginLeft: 8, color: policy.days_to_expiry <= 30 ? '#F59E0B' : '#10B981' }}>
              ({policy.days_to_expiry} days left)
            </span>
          : <span style={{ marginLeft: 8, color: '#EF4444' }}>(Expired)</span>
        }
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button
          className="btn-ghost"
          style={{ gap: 6, fontSize: '0.82rem', padding: '9px 14px', color: 'var(--text-muted)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8 }}
          onClick={() => onView(policy)}
          title="View details"
        >
          <Eye size={14}/> View
        </button>
        <button
          className="btn-primary"
          style={{ flex: 1, gap: 6, fontSize: '0.82rem', padding: '9px 14px', justifyContent: 'center' }}
          disabled={policy.is_expired}
          onClick={() => onFileClaim(policy)}
        >
          <FileText size={14}/> File a Claim
        </button>
        <button
          className="btn-ghost"
          style={{ gap: 6, fontSize: '0.82rem', padding: '9px 14px', color: '#EF4444' }}
          onClick={() => onDelete(policy)}
          title="Remove policy"
        >
          <Trash2 size={14}/>
        </button>
      </div>
    </motion.div>
  )
}

export default function MyPolicies() {
  const navigate   = useNavigate()
  const [policies, setPolicies] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await api.get('/policies/mine')
      setPolicies(res.data)
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to load policies')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  function handleView(policy) {
    navigate(`/dashboard/policies/${policy.id}`)
  }

  function handleFileClaim(policy) {
    // Navigate to FNOL wizard with policy pre-selected
    navigate(`/dashboard/claims/new?policy_id=${policy.id}&policy_number=${encodeURIComponent(policy.policy_number)}&policy_type=${policy.policy_type}`)
  }

  async function handleDelete(policy) {
    if (!window.confirm(`Remove policy ${policy.policy_number}? This cannot be undone.`)) return
    try {
      await api.delete(`/policies/${policy.id}`)
      toast.success('Policy removed')
      setPolicies(p => p.filter(x => x.id !== policy.id))
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Cannot remove policy')
    }
  }

  const active  = policies.filter(p => !p.is_expired).length
  const expired = policies.filter(p =>  p.is_expired).length
  const expiring = policies.filter(p => !p.is_expired && p.days_to_expiry <= 30).length

  return (
    <motion.div initial="hidden" animate="visible" variants={stagger}>
      {/* Heading */}
      <motion.div variants={fadeUp} className="page-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>My Policies</h1>
          <p>Manage your insurance policies and file claims against them</p>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button className="btn-ghost" style={{ padding: '8px 12px', fontSize: '0.8rem', gap: 5 }} onClick={load}>
            <RefreshCw size={13}/> Refresh
          </button>
          <button className="btn-primary" style={{ gap: 6, padding: '9px 16px', fontSize: '0.85rem' }}
            onClick={() => navigate('/dashboard/policies/add')}>
            <Plus size={15}/> Add Policy
          </button>
        </div>
      </motion.div>

      {/* Summary stats */}
      {!loading && policies.length > 0 && (
        <motion.div variants={fadeUp} className="stats-grid" style={{ marginBottom: 24 }}>
          {[
            { icon: Shield,       label: 'Total Policies', value: policies.length, color: '#4F46E5', bg: 'rgba(79,70,229,0.12)'  },
            { icon: CheckCircle2, label: 'Active',         value: active,          color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
            { icon: AlertCircle,  label: 'Expiring Soon',  value: expiring,        color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
            { icon: Clock,        label: 'Expired',        value: expired,         color: '#EF4444', bg: 'rgba(239,68,68,0.12)'  },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <div className="stat-card-icon" style={{ background: s.bg }}><s.icon size={20} color={s.color}/></div>
              <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))}
        </motion.div>
      )}

      {/* States */}
      {loading && <LoadingState label="Loading your policies…"/>}
      {!loading && error && <ErrorState message={error} onRetry={load}/>}
      {!loading && !error && policies.length === 0 && (
        <motion.div variants={fadeUp} style={{ textAlign: 'center', padding: '60px 0' }}>
          <div style={{ fontSize: '3rem', marginBottom: 16 }}>📋</div>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>No policies registered yet</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: 24 }}>
            Add your insurance policy to start filing claims
          </div>
          <button className="btn-primary" style={{ gap: 6 }}
            onClick={() => navigate('/dashboard/policies/add')}>
            <Plus size={15}/> Add Your First Policy
          </button>
        </motion.div>
      )}

      {/* Policy cards */}
      {!loading && !error && policies.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(380px,1fr))', gap: 16 }}>
          {policies.map(p => (
            <PolicyCard
              key={p.id}
              policy={p}
              onView={handleView}
              onFileClaim={handleFileClaim}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </motion.div>
  )
}
