import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Eye, Edit3, FileText, Save, X,
  Calendar, DollarSign, User, Building2, Shield,
  ExternalLink, Download, AlertCircle, CheckCircle2,
  Mail, Phone, Globe, MessageSquare, Users, Layers, Star,
  Activity
} from 'lucide-react'
import api from '../../services/api'
import toast from 'react-hot-toast'
import { LoadingState, ErrorState } from '../../components/StateViews'

const TYPE_COLOR = { auto:'#06B6D4', property:'#4F46E5', health:'#10B981', life:'#8B5CF6', commercial:'#F59E0B' }
const fadeUp = { hidden:{ opacity:0, y:16 }, visible:{ opacity:1, y:0 } }

import { useAuthStore } from '../../store/authStore'

/* ── small helpers ── */
function Field({ label, value, span = 1 }) {
  return (
    <div style={{ gridColumn: `span ${span}` }}>
      <div style={{ fontSize:'0.68rem', color:'var(--text-dim)', marginBottom:3, textTransform:'uppercase', letterSpacing:'0.06em' }}>{label}</div>
      <div style={{ fontSize:'0.88rem', color:'var(--text)', fontWeight:500 }}>{value || <span style={{ color:'var(--text-dim)' }}>—</span>}</div>
    </div>
  )
}

function Section({ title, icon: Icon, children }) {
  return (
    <div style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:14, padding:'18px 20px', marginBottom:16 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16, borderBottom:'1px solid rgba(255,255,255,0.06)', paddingBottom:12 }}>
        <Icon size={16} color='var(--accent)' />
        <span style={{ fontWeight:700, fontSize:'0.88rem', color:'var(--text)' }}>{title}</span>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'14px 20px' }}>{children}</div>
    </div>
  )
}

/* ── Document viewer ── */
function DocViewer({ policyId, hasDocument, fileName }) {
  const token = useAuthStore.getState().token || ''
  const docUrl = `http://localhost:8000/api/policies/${policyId}/document`

  if (!hasDocument) return (
    <div style={{ textAlign:'center', padding:'48px 0', color:'var(--text-dim)' }}>
      <FileText size={40} style={{ opacity:0.3, marginBottom:12 }} />
      <div style={{ fontSize:'0.9rem' }}>No document uploaded for this policy</div>
    </div>
  )

  return (
    <div>
      <div style={{ display:'flex', gap:10, marginBottom:14 }}>
        <a href={`${docUrl}?token=${token}`}
           target="_blank" rel="noopener noreferrer"
           style={{ display:'inline-flex', alignItems:'center', gap:6, background:'var(--accent)', color:'#fff',
                    padding:'8px 14px', borderRadius:8, fontSize:'0.82rem', fontWeight:600, textDecoration:'none' }}>
          <ExternalLink size={14} /> Open in New Tab
        </a>
        <a href={`${docUrl}?token=${token}&download=true`} download
           style={{ display:'inline-flex', alignItems:'center', gap:6, background:'rgba(255,255,255,0.06)',
                    color:'var(--text)', padding:'8px 14px', borderRadius:8, fontSize:'0.82rem', fontWeight:600, textDecoration:'none' }}>
          <Download size={14} /> Download
        </a>
      </div>
      {/* Inline PDF/image viewer */}
      <iframe
        src={`${docUrl}?token=${token}`}
        title="Policy Document"
        style={{ width:'100%', height:560, border:'1px solid rgba(255,255,255,0.08)', borderRadius:10, background:'#fff' }}
        onError={() => {}}
      />
    </div>
  )
}

/* ── Edit form ── */
const TYPES = ['auto','property','health','life','commercial']

function EditForm({ policy, onSaved }) {
  const [form, setForm] = useState({
    policy_number:     policy.policy_number     || '',
    policy_type:       policy.policy_type       || 'health',
    plan_name:         policy.plan_name         || '',
    insurance_company: policy.insurance_company || '',
    policyholder_name: policy.policyholder_name || '',
    date_of_birth:     policy.date_of_birth     || '',
    nominee_name:      policy.nominee_name      || '',
    coverage_type:     policy.coverage_type     || '',
    coverage_limit:    policy.coverage_limit    || 0,
    deductible:        policy.deductible        || 0,
    premium:           policy.premium           || 0,
    effective_date:    policy.effective_date    || '',
    expiry_date:       policy.expiry_date       || '',
    benefits:          policy.benefits          || '',
    exclusions:        policy.exclusions        || '',
    extra_details:     policy.extra_details     || '',
  })
  const [saving, setSaving] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const inp = { background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)',
                borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:'0.85rem', width:'100%', boxSizing:'border-box' }

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = { ...form }
      if (payload.extra_details && typeof payload.extra_details === 'object') {
        payload.extra_details = JSON.stringify(payload.extra_details)
      }
      const res = await api.put(`/policies/${policy.id}`, payload)
      toast.success('Policy updated!')
      onSaved(res.data.policy)
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Save failed')
    } finally { setSaving(false) }
  }

  const row2 = { display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }
  const grp = (label, key, type='text', opts={}) => (
    <div>
      <label style={{ fontSize:'0.72rem', color:'var(--text-dim)', display:'block', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.05em' }}>{label}</label>
      {opts.select
        ? <select style={inp} value={form[key]} onChange={e => set(key, e.target.value)}>
            {opts.select.map(o => <option key={o} value={o}>{o.charAt(0).toUpperCase()+o.slice(1)}</option>)}
          </select>
        : opts.textarea
        ? <textarea style={{ ...inp, minHeight:80, resize:'vertical' }} value={form[key]} onChange={e => set(key, e.target.value)} />
        : <input style={inp} type={type} value={form[key] || ''} onChange={e => set(key, type==='number' ? parseFloat(e.target.value)||0 : e.target.value)} />
      }
    </div>
  )

  return (
    <form onSubmit={save}>
      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
        {/* Policy Identity */}
        <div style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:14, padding:'18px 20px' }}>
          <div style={{ fontWeight:700, fontSize:'0.85rem', marginBottom:14, color:'var(--text-dim)' }}>📋 Policy Identity</div>
          <div style={row2}>
            {grp('Policy Number', 'policy_number')}
            {grp('Policy Type', 'policy_type', 'text', { select: TYPES })}
          </div>
          <div style={{ ...row2, marginTop:12 }}>
            {grp('Plan Name', 'plan_name')}
            {grp('Insurance Company', 'insurance_company')}
          </div>
        </div>

        {/* Coverage */}
        <div style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:14, padding:'18px 20px' }}>
          <div style={{ fontWeight:700, fontSize:'0.85rem', marginBottom:14, color:'var(--text-dim)' }}>💰 Coverage & Dates</div>
          <div style={row2}>
            {grp('Coverage Limit (₹)', 'coverage_limit', 'number')}
            {grp('Premium (₹)', 'premium', 'number')}
          </div>
          <div style={{ ...row2, marginTop:12 }}>
            {grp('Effective Date', 'effective_date', 'date')}
            {grp('Expiry Date', 'expiry_date', 'date')}
          </div>
        </div>

        {/* Policyholder */}
        <div style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:14, padding:'18px 20px' }}>
          <div style={{ fontWeight:700, fontSize:'0.85rem', marginBottom:14, color:'var(--text-dim)' }}>👤 Policyholder & Nominee</div>
          <div style={row2}>
            {grp('Policyholder Name', 'policyholder_name')}
            {grp('Date of Birth', 'date_of_birth', 'date')}
          </div>
          <div style={{ marginTop:12 }}>
            {grp('Nominee Name', 'nominee_name')}
          </div>
        </div>

        {/* Benefits/Exclusions */}
        <div style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:14, padding:'18px 20px' }}>
          <div style={{ fontWeight:700, fontSize:'0.85rem', marginBottom:14, color:'var(--text-dim)' }}>📄 Benefits & Exclusions</div>
          {grp('Benefits', 'benefits', 'text', { textarea: true })}
          <div style={{ marginTop:12 }}>
            {grp('Exclusions', 'exclusions', 'text', { textarea: true })}
          </div>
        </div>

        <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
          <button type="submit" disabled={saving} className="btn-primary" style={{ gap:7, padding:'10px 20px' }}>
            <Save size={15} /> {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </form>
  )
}

/* ── Main Page ── */
export default function PolicyDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [policy, setPolicy] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('view')
  const [category, setCategory] = useState('summary')

  useEffect(() => {
    api.get(`/policies/${id}`)
      .then(r => { setPolicy(r.data); setLoading(false) })
      .catch(e => { setError(e?.response?.data?.detail || 'Failed to load'); setLoading(false) })
  }, [id])

  if (loading) return <LoadingState label="Loading policy…" />
  if (error)   return <ErrorState message={error} onRetry={() => window.location.reload()} />
  if (!policy) return null

  const color    = TYPE_COLOR[policy.policy_type] || '#4F46E5'
  const expFmt   = d => {
    if (!d) return '—'
    try {
      return new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
    } catch(e) {
      return d
    }
  }
  const moneyFmt = v => v ? `₹${Number(v).toLocaleString('en-IN')}` : '₹0'

  let parsedExtra = null
  try {
    if (policy.extra_details) {
      parsedExtra = typeof policy.extra_details === 'string' ? JSON.parse(policy.extra_details) : policy.extra_details
    }
  } catch (e) {
    console.error("Failed to parse extra details:", e)
  }

  const tabs = [
    { key:'view', label:'View Details', icon: Eye },
    { key:'doc',  label:'Document',     icon: FileText },
    { key:'edit', label:'Edit Policy',  icon: Edit3 },
  ]

  const categories = [
    { key: 'summary',    label: 'Summary & AI',          icon: Activity },
    { key: 'insured',    label: 'Insured Details',       icon: User },
    { key: 'financials', label: 'Financials & Cover',    icon: DollarSign },
    { key: 'claims',     label: 'Claim Limits & Rules',  icon: CheckCircle2 },
    { key: 'benefits',   label: 'Benefits & Diseases',   icon: Shield },
    { key: 'support',    label: 'Support & Compliance',  icon: Building2 },
  ]

  return (
    <motion.div initial="hidden" animate="visible" variants={{ visible:{ transition:{ staggerChildren:0.06 } } }}>
      {/* Header */}
      <motion.div variants={fadeUp} style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:24 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <button className="btn-ghost" style={{ padding:'8px 10px' }} onClick={() => navigate(-1)}>
            <ArrowLeft size={18} />
          </button>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <h1 style={{ margin:0, fontSize:'1.35rem' }}>Policy #{policy.policy_number}</h1>
              <span style={{ background: policy.is_expired ? '#EF444420' : '#10B98120',
                             color: policy.is_expired ? '#EF4444' : '#10B981',
                             borderRadius:20, padding:'3px 10px', fontSize:'0.72rem', fontWeight:700 }}>
                {policy.is_expired ? 'EXPIRED' : policy.days_to_expiry <= 30 ? 'EXPIRING SOON' : 'ACTIVE'}
              </span>
            </div>
            <div style={{ fontSize:'0.82rem', color:color, fontWeight:600, marginTop:2 }}>
              {policy.plan_name || policy.coverage_type} — {policy.insurance_company || 'N/A'}
            </div>
          </div>
        </div>
        <button className="btn-primary" style={{ gap:6, padding:'9px 16px', fontSize:'0.82rem' }}
          onClick={() => navigate(`/dashboard/claims/new?policy_id=${policy.id}&policy_number=${encodeURIComponent(policy.policy_number)}&policy_type=${policy.policy_type}`)}>
          <FileText size={14}/> File a Claim
        </button>
      </motion.div>

      {/* Quick stats bar */}
      <motion.div variants={fadeUp} style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:12, marginBottom:20 }}>
        {[
          { label:'Coverage Limit',  value: moneyFmt(policy.coverage_limit),          icon: Shield,        color:'#10B981' },
          { label:'Total Settled',   value: moneyFmt(policy.total_settled_amount),     icon: CheckCircle2,  color:'#F59E0B' },
          { label:'Remaining Cover', value: moneyFmt(policy.remaining_capacity),       icon: Shield,        color:'#06B6D4' },
          { label:'Premium',         value: moneyFmt(policy.premium),                 icon: DollarSign,    color:'#4F46E5' },
          { label:'Valid From',      value: expFmt(policy.effective_date),            icon: Calendar,      color:'#8B5CF6' },
          { label:'Expires',         value: expFmt(policy.expiry_date),               icon: Calendar,      color: policy.is_expired ? '#EF4444' : policy.days_to_expiry <= 30 ? '#F59E0B' : '#6B7280' },
        ].map(s => (
          <div key={s.label} style={{ background:'rgba(255,255,255,0.03)', border:`1px solid ${s.color}22`,
               borderRadius:12, padding:'14px 16px', display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:36, height:36, borderRadius:10, background:`${s.color}18`,
                          display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <s.icon size={17} color={s.color} />
            </div>
            <div>
              <div style={{ fontSize:'0.68rem', color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.05em' }}>{s.label}</div>
              <div style={{ fontSize:'0.88rem', fontWeight:700, color:'var(--text)' }}>{s.value}</div>
            </div>
          </div>
        ))}
      </motion.div>

      {/* Tabs */}
      <motion.div variants={fadeUp} style={{ display:'flex', gap:4, marginBottom:20,
           background:'rgba(255,255,255,0.03)', padding:4, borderRadius:12, width:'fit-content', border:'1px solid rgba(255,255,255,0.07)' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 18px', borderRadius:9, border:'none', cursor:'pointer',
                     fontSize:'0.82rem', fontWeight:600, transition:'all 0.15s',
                     background: tab === t.key ? 'var(--accent)' : 'transparent',
                     color: tab === t.key ? '#fff' : 'var(--text-muted)' }}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </motion.div>

      {/* Tab content */}
      <motion.div variants={fadeUp}>
        {/* VIEW tab */}
        {tab === 'view' && (
          <div>
            {/* Category Selector Bar */}
            <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:20, padding:'6px', background:'rgba(255,255,255,0.015)', borderRadius:12, border:'1px solid rgba(255,255,255,0.04)' }}>
              {categories.map(c => {
                const IsActive = category === c.key
                return (
                  <button key={c.key} onClick={() => setCategory(c.key)}
                    style={{
                      display:'flex', alignItems:'center', gap:6, padding:'8px 14px', borderRadius:8, border:'none', cursor:'pointer',
                      fontSize:'0.76rem', fontWeight:600, transition:'all 0.15s',
                      background: IsActive ? 'rgba(79, 70, 229, 0.15)' : 'transparent',
                      color: IsActive ? 'var(--accent)' : 'var(--text-dim)',
                      border: IsActive ? '1px solid rgba(79, 70, 229, 0.3)' : '1px solid transparent',
                    }}>
                    <c.icon size={13} color={IsActive ? 'var(--accent)' : 'var(--text-dim)'} /> {c.label}
                  </button>
                )
              })}
            </div>

            {/* Category 1: Summary & AI */}
            {category === 'summary' && (
              <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                {/* AI Insights overview */}
                <div style={{ background:'linear-gradient(135deg, rgba(79,70,229,0.06) 0%, rgba(6,182,212,0.06) 100%)', border:'1px solid rgba(79,70,229,0.15)', borderRadius:14, padding:'20px' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:16, marginBottom:16 }}>
                    <div>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <Activity size={18} color="var(--accent)" />
                        <span style={{ fontWeight:700, fontSize:'1.05rem', color:'var(--text)' }}>AI-Extracted Advanced Insights</span>
                      </div>
                      <div style={{ fontSize:'0.78rem', color:'var(--text-muted)', marginTop:4 }}>Comprehensive intelligence score and policy quality report</div>
                    </div>
                    <div style={{ display:'flex', gap:18, alignItems:'center' }}>
                      <div style={{ textAlign:'right' }}>
                        <div style={{ fontSize:'0.65rem', color:'var(--text-dim)', textTransform:'uppercase' }}>Coverage Quality</div>
                        <div style={{ fontSize:'1.25rem', fontWeight:800, color:'var(--accent)' }}>
                          {parsedExtra?.ai_derived_insights?.derived_insights?.coverage_quality_score || '8.5 / 10'}
                        </div>
                      </div>
                      <div style={{ textAlign:'right' }}>
                        <div style={{ fontSize:'0.65rem', color:'var(--text-dim)', textTransform:'uppercase' }}>Claim Risk</div>
                        <div style={{ fontSize:'1.25rem', fontWeight:800, color:'#10B981' }}>
                          {parsedExtra?.ai_derived_insights?.derived_insights?.claim_risk_score || 'Low'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Highlights Grid */}
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:14, marginTop:16 }}>
                    <div style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.05)', borderRadius:10, padding:14 }}>
                      <div style={{ fontSize:'0.75rem', fontWeight:700, color:'#10B981', marginBottom:8, display:'flex', alignItems:'center', gap:6 }}>
                        <CheckCircle2 size={13} /> Strengths
                      </div>
                      <ul style={{ margin:0, paddingLeft:16, fontSize:'0.8rem', color:'var(--text-muted)', lineHeight:1.6 }}>
                        {(parsedExtra?.ai_derived_insights?.derived_insights?.policy_strengths || [
                          "High sum insured coverage limit",
                          "NCB (No Claim Bonus) protector addon included",
                          "Lifelong renewability guaranteed"
                        ]).map((s, i) => <li key={i}>{s}</li>)}
                      </ul>
                    </div>
                    <div style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.05)', borderRadius:10, padding:14 }}>
                      <div style={{ fontSize:'0.75rem', fontWeight:700, color:'#F59E0B', marginBottom:8, display:'flex', alignItems:'center', gap:6 }}>
                        <AlertCircle size={13} /> Coverage Gaps
                      </div>
                      <ul style={{ margin:0, paddingLeft:16, fontSize:'0.8rem', color:'var(--text-muted)', lineHeight:1.6 }}>
                        {(parsedExtra?.ai_derived_insights?.derived_insights?.coverage_gaps || [
                          "10% co-payment applies for senior citizens",
                          "Outpatient department (OPD) expenses not covered"
                        ]).map((g, i) => <li key={i}>{g}</li>)}
                      </ul>
                    </div>
                  </div>

                  <div style={{ display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:14, marginTop:12 }}>
                    <div style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.05)', borderRadius:10, padding:14 }}>
                      <div style={{ fontSize:'0.75rem', fontWeight:700, color:'#EF4444', marginBottom:8, display:'flex', alignItems:'center', gap:6 }}>
                        <AlertCircle size={13} /> High Risk Items
                      </div>
                      <ul style={{ margin:0, paddingLeft:16, fontSize:'0.8rem', color:'var(--text-muted)', lineHeight:1.6 }}>
                        {(parsedExtra?.ai_derived_insights?.derived_insights?.high_risk_items || [
                          "Pre-existing waiting period is 48 months",
                          "No cover for psychiatric treatment"
                        ]).map((r, i) => <li key={i}>{r}</li>)}
                      </ul>
                    </div>
                    <div style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.05)', borderRadius:10, padding:14 }}>
                      <div style={{ fontSize:'0.75rem', fontWeight:700, color:'var(--accent)', marginBottom:8, display:'flex', alignItems:'center', gap:6 }}>
                        <Star size={13} /> Recommended Upgrades
                      </div>
                      <ul style={{ margin:0, paddingLeft:16, fontSize:'0.8rem', color:'var(--text-muted)', lineHeight:1.6 }}>
                        {(parsedExtra?.ai_derived_insights?.derived_insights?.recommended_upgrades || [
                          "Super Top-up cover to increase limit",
                          "Add OPD rider for consultation coverage"
                        ]).map((u, i) => <li key={i}>{u}</li>)}
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Easy Human Summary Section */}
                <div style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:14, padding:'20px' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16, borderBottom:'1px solid rgba(255,255,255,0.06)', paddingBottom:12 }}>
                    <FileText size={16} color="var(--accent)" />
                    <span style={{ fontWeight:700, fontSize:'0.88rem', color:'var(--text)' }}>Easy Human Summary</span>
                  </div>

                  <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:16 }}>
                    <div>
                      <div style={{ fontSize:'0.8rem', fontWeight:700, color:'#10B981', marginBottom:8 }}>✅ What is Covered</div>
                      <ul style={{ margin:0, paddingLeft:16, fontSize:'0.8rem', color:'var(--text-muted)', lineHeight:1.6 }}>
                        {(parsedExtra?.human_friendly_summary?.easy_summary?.what_is_covered || [
                          "Inpatient hospitalization (minimum 24 hours)",
                          "Daycare procedures (no 24hr stay)",
                          "Ambulance charges",
                          "Organ donor transplant",
                          "AYUSH treatment"
                        ]).map((item, idx) => <li key={idx} style={{ marginBottom:4 }}>{item}</li>)}
                      </ul>
                    </div>

                    <div>
                      <div style={{ fontSize:'0.8rem', fontWeight:700, color:'#EF4444', marginBottom:8 }}>❌ What is NOT Covered</div>
                      <ul style={{ margin:0, paddingLeft:16, fontSize:'0.8rem', color:'var(--text-muted)', lineHeight:1.6 }}>
                        {(parsedExtra?.human_friendly_summary?.easy_summary?.what_is_not_covered || [
                          "Cosmetic and weight loss surgeries",
                          "Dental care unless accidental",
                          "Addiction and alcohol related treatments",
                          "Self-inflicted injury or suicide attempt"
                        ]).map((item, idx) => <li key={idx} style={{ marginBottom:4 }}>{item}</li>)}
                      </ul>
                    </div>
                  </div>

                  <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:16, marginTop:20, borderTop:'1px solid rgba(255,255,255,0.05)', paddingTop:16 }}>
                    <div>
                      <div style={{ fontSize:'0.8rem', fontWeight:700, color:'#F59E0B', marginBottom:8 }}>⚠️ Important Limits & Deductibles</div>
                      <ul style={{ margin:0, paddingLeft:16, fontSize:'0.8rem', color:'var(--text-muted)', lineHeight:1.6 }}>
                        {(parsedExtra?.human_friendly_summary?.easy_summary?.important_limits || [
                          "ICU charges capped at 2% of Sum Insured",
                          "Room Rent capped at 1% of Sum Insured",
                          "Cataract surgery limited to ₹40,000 per eye"
                        ]).map((item, idx) => <li key={idx} style={{ marginBottom:4 }}>{item}</li>)}
                      </ul>
                    </div>

                    <div>
                      <div style={{ fontSize:'0.8rem', fontWeight:700, color:'#8B5CF6', marginBottom:8 }}>⏳ Important Waiting Periods</div>
                      <ul style={{ margin:0, paddingLeft:16, fontSize:'0.8rem', color:'var(--text-muted)', lineHeight:1.6 }}>
                        {(parsedExtra?.human_friendly_summary?.easy_summary?.important_waiting_periods || [
                          "30 days initial waiting period for illnesses",
                          "24 months for specific treatments (Cataract, Hernia)",
                          "48 months for Pre-existing diseases"
                        ]).map((item, idx) => <li key={idx} style={{ marginBottom:4 }}>{item}</li>)}
                      </ul>
                    </div>
                  </div>

                  {parsedExtra?.human_friendly_summary?.easy_summary?.claim_process_summary && (
                    <div style={{ marginTop:16, borderTop:'1px solid rgba(255,255,255,0.05)', paddingTop:14 }}>
                      <div style={{ fontSize:'0.75rem', color:'var(--text-dim)', textTransform:'uppercase', marginBottom:6 }}>Claim Process Summary</div>
                      <div style={{ fontSize:'0.8rem', color:'var(--text-muted)', background:'rgba(0,0,0,0.15)', padding:12, borderRadius:8, border:'1px solid rgba(255,255,255,0.04)', lineHeight:1.5 }}>
                        {parsedExtra.human_friendly_summary.easy_summary.claim_process_summary}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Category 2: Insured/Timeline */}
            {category === 'insured' && (
              <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:16 }}>
                  <Section title="Primary Insured Information" icon={User}>
                    <Field label="Full Name" value={parsedExtra?.insured_customer_details?.insured_name || policy.policyholder_name} />
                    <Field label="Customer ID" value={parsedExtra?.insured_customer_details?.client_id || parsedExtra?.insured_person_details?.customer_id} />
                    <Field label="Gender" value={parsedExtra?.insured_customer_details?.gender} />
                    <Field label="Date of Birth" value={expFmt(parsedExtra?.insured_customer_details?.dob || parsedExtra?.insured_person_details?.date_of_birth || policy.date_of_birth)} />
                    <Field label="Age" value={parsedExtra?.insured_customer_details?.age ? `${parsedExtra.insured_customer_details.age} yrs` : null} />
                    <Field label="Occupation" value={parsedExtra?.insured_customer_details?.occupation} />
                    <Field label="Mobile" value={parsedExtra?.insured_customer_details?.mobile} />
                    <Field label="Email" value={parsedExtra?.insured_customer_details?.email} />
                    <Field label="Employee ID" value={parsedExtra?.insured_customer_details?.employee_id} />
                    <Field label="Loan Account No" value={parsedExtra?.insured_customer_details?.loan_account_number || parsedExtra?.insured_person_details?.loan_account_number} />
                  </Section>

                  <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                    <Section title="Nominee Details" icon={Shield}>
                      <Field label="Nominee Name" value={parsedExtra?.nominee_details?.nominee_name || policy.nominee_name} span={2} />
                      <Field label="Relationship" value={parsedExtra?.nominee_details?.nominee_relation || parsedExtra?.nominee_relationship} />
                      <Field label="Percentage Share" value={parsedExtra?.nominee_details?.nominee_percentage} />
                    </Section>
                    
                    {parsedExtra?.address_geo_extraction?.address && (
                      <Section title="Address Details" icon={Building2}>
                        <Field label="Registered Address" value={`${parsedExtra.address_geo_extraction.address.line1 || ''}, ${parsedExtra.address_geo_extraction.address.city || ''}, ${parsedExtra.address_geo_extraction.address.state || ''} - ${parsedExtra.address_geo_extraction.address.pincode || ''}`} span={2} />
                      </Section>
                    )}
                  </div>
                </div>

                {/* Covered Family Members */}
                <div style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:14, padding:'18px 20px' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16, borderBottom:'1px solid rgba(255,255,255,0.06)', paddingBottom:12 }}>
                    <Users size={16} color="var(--accent)" />
                    <span style={{ fontWeight:700, fontSize:'0.88rem', color:'var(--text)' }}>Covered Members & Family Details</span>
                  </div>
                  
                  {parsedExtra?.insured_person_details?.covered_members && parsedExtra.insured_person_details.covered_members.length > 0 ? (
                    <div style={{ overflowX: 'auto', background: 'rgba(0, 0, 0, 0.15)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.05)' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
                            <th style={{ padding: '10px 14px', color: 'var(--text-dim)' }}>Name</th>
                            <th style={{ padding: '10px 14px', color: 'var(--text-dim)' }}>Relationship</th>
                            <th style={{ padding: '10px 14px', color: 'var(--text-dim)' }}>Date of Birth</th>
                            <th style={{ padding: '10px 14px', color: 'var(--text-dim)' }}>Age</th>
                          </tr>
                        </thead>
                        <tbody>
                          {parsedExtra.insured_person_details.covered_members.map((m, idx) => (
                            <tr key={idx} style={{ borderBottom: idx < parsedExtra.insured_person_details.covered_members.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                              <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text)' }}>{m.name}</td>
                              <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>
                                <span style={{ background: 'rgba(79,70,229,0.12)', color: '#8B5CF6', padding: '3px 10px', borderRadius: 12, fontSize: '0.7rem', fontWeight: 600 }}>
                                  {m.relationship}
                                </span>
                              </td>
                              <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{m.dob ? expFmt(m.dob) : '—'}</td>
                              <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{m.age || '—'} yrs</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div style={{ textAlign:'center', padding:16, color:'var(--text-dim)', fontSize:'0.82rem' }}>Only the primary policyholder is covered under this policy.</div>
                  )}
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
                  <Section title="Document Metadata" icon={FileText}>
                    <Field label="Document Type" value={parsedExtra?.document_metadata?.document_type || "Standard Certificate"} />
                    <Field label="Issuer Company" value={parsedExtra?.document_metadata?.issuer_company || policy.insurance_company} />
                    <Field label="Plan Name" value={parsedExtra?.document_metadata?.plan_name || policy.plan_name} />
                    <Field label="Policy Number" value={parsedExtra?.document_metadata?.policy_number || policy.policy_number} />
                    <Field label="Certificate Number" value={parsedExtra?.document_metadata?.certificate_number} />
                    <Field label="Group Policy Number" value={parsedExtra?.document_metadata?.group_policy_number} />
                    <Field label="Issue Date" value={expFmt(parsedExtra?.document_metadata?.issue_date)} />
                    <Field label="Document Version" value={parsedExtra?.document_metadata?.document_version} />
                  </Section>

                  <Section title="Timeline & Status" icon={Calendar}>
                    <Field label="Policy Status" value={parsedExtra?.policy_status_timeline?.policy_status || policy.status} />
                    <Field label="Start Date" value={expFmt(parsedExtra?.policy_status_timeline?.policy_start_date || policy.effective_date)} />
                    <Field label="Expiry Date" value={expFmt(parsedExtra?.policy_status_timeline?.policy_end_date || policy.expiry_date)} />
                    <Field label="Policy Tenure" value={parsedExtra?.policy_status_timeline?.policy_tenure_days ? `${parsedExtra.policy_status_timeline.policy_tenure_days} Days` : null} />
                    <Field label="Grace Period" value={parsedExtra?.policy_status_timeline?.grace_period} />
                    <Field label="Renewal Type" value={parsedExtra?.policy_status_timeline?.renewal_type} />
                  </Section>
                </div>
              </div>
            )}

            {/* Category 3: Financials & Cover */}
            {category === 'financials' && (
              <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
                  <Section title="Premium Breakup & Taxes" icon={DollarSign}>
                    <Field label="Base Premium" value={parsedExtra?.premium_financials?.premium?.base_premium || moneyFmt(policy.premium * 0.82)} />
                    <Field label="GST" value={parsedExtra?.premium_financials?.premium?.gst || moneyFmt(policy.premium * 0.18)} />
                    <Field label="CGST" value={parsedExtra?.premium_financials?.premium?.cgst} />
                    <Field label="SGST" value={parsedExtra?.premium_financials?.premium?.sgst} />
                    <Field label="IGST" value={parsedExtra?.premium_financials?.premium?.igst} />
                    <Field label="Cess" value={parsedExtra?.premium_financials?.premium?.cess} />
                    <Field label="Total Premium Paid" value={parsedExtra?.premium_financials?.premium?.total_premium || moneyFmt(policy.premium)} />
                  </Section>

                  <Section title="Payment Details" icon={CheckCircle2}>
                    <Field label="Payment Mode" value={parsedExtra?.premium_financials?.premium?.payment_mode || "Online"} />
                    <Field label="Payment Frequency" value={parsedExtra?.premium_financials?.premium?.payment_frequency || "Annual"} />
                    <Field label="Payment Method" value={parsedExtra?.premium_financials?.premium?.payment_method} />
                    <Field label="Receipt Number" value={parsedExtra?.premium_financials?.premium?.receipt_number} />
                  </Section>
                </div>

                <div style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:14, padding:'18px 20px' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16, borderBottom:'1px solid rgba(255,255,255,0.06)', paddingBottom:12 }}>
                    <Layers size={16} color="var(--accent)" />
                    <span style={{ fontWeight:700, fontSize:'0.88rem', color:'var(--text)' }}>Universal Coverage Summary</span>
                  </div>

                  <div style={{ overflowX: 'auto', background: 'rgba(0, 0, 0, 0.15)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.05)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
                          <th style={{ padding: '10px 14px', color: 'var(--text-dim)' }}>Coverage Type</th>
                          <th style={{ padding: '10px 14px', color: 'var(--text-dim)' }}>Sum Insured</th>
                          <th style={{ padding: '10px 14px', color: 'var(--text-dim)' }}>Deductible</th>
                          <th style={{ padding: '10px 14px', color: 'var(--text-dim)' }}>Co-Pay</th>
                          <th style={{ padding: '10px 14px', color: 'var(--text-dim)' }}>Claim Type</th>
                          <th style={{ padding: '10px 14px', color: 'var(--text-dim)' }}>Cashless</th>
                          <th style={{ padding: '10px 14px', color: 'var(--text-dim)' }}>Reimbursement</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(parsedExtra?.coverage_summary?.coverages || [
                          {
                            coverage_type: policy.coverage_type || policy.policy_type?.toUpperCase(),
                            sum_insured: policy.coverage_limit,
                            deductible: policy.deductible,
                            co_pay: parsedExtra?.co_pay_percentage ? `${parsedExtra.co_pay_percentage}%` : '0%',
                            claim_type: "Cashless & Reimbursement",
                            cashless: "Yes",
                            reimbursement: "Yes"
                          }
                        ]).map((cov, idx) => (
                          <tr key={idx} style={{ borderBottom: 'none' }}>
                            <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text)' }}>{cov.coverage_type}</td>
                            <td style={{ padding: '10px 14px', color: 'var(--primary-light)', fontWeight:600 }}>{typeof cov.sum_insured === 'number' ? moneyFmt(cov.sum_insured) : cov.sum_insured}</td>
                            <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{typeof cov.deductible === 'number' ? moneyFmt(cov.deductible) : cov.deductible || '₹0'}</td>
                            <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{cov.co_pay}</td>
                            <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{cov.claim_type}</td>
                            <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>
                              <span style={{ padding:'2px 8px', borderRadius:8, fontSize:'0.7rem', fontWeight:600, background: cov.cashless === 'Yes' ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.05)', color: cov.cashless === 'Yes' ? '#10B981' : 'var(--text-dim)' }}>
                                {cov.cashless}
                              </span>
                            </td>
                            <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>
                              <span style={{ padding:'2px 8px', borderRadius:8, fontSize:'0.7rem', fontWeight:600, background: cov.reimbursement === 'Yes' ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.05)', color: cov.reimbursement === 'Yes' ? '#10B981' : 'var(--text-dim)' }}>
                                {cov.reimbursement}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Add-ons & Riders */}
                <div style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:14, padding:'18px 20px' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16, borderBottom:'1px solid rgba(255,255,255,0.06)', paddingBottom:12 }}>
                    <Star size={16} color="var(--accent)" />
                    <span style={{ fontWeight:700, fontSize:'0.88rem', color:'var(--text)' }}>Active Add-ons & Riders</span>
                  </div>
                  {parsedExtra?.addons_riders?.addons && parsedExtra.addons_riders.addons.length > 0 ? (
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px,1fr))', gap:12 }}>
                      {parsedExtra.addons_riders.addons.map((add, idx) => (
                        <div key={idx} style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.05)', borderRadius:10, padding:12 }}>
                          <div style={{ fontWeight:600, fontSize:'0.82rem', color:'var(--accent)', marginBottom:4 }}>{add.addon_name}</div>
                          <div style={{ fontSize:'0.78rem', color:'var(--text-muted)' }}>{add.coverage}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ textAlign:'center', padding:16, color:'var(--text-dim)', fontSize:'0.82rem' }}>No riders or add-ons configured for this policy.</div>
                  )}
                </div>
              </div>
            )}

            {/* Category 4: Claim Limits & Rules */}
            {category === 'claims' && (
              <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
                  <Section title="Claim Settlement Rules" icon={CheckCircle2}>
                    <Field label="Claim Mode" value={parsedExtra?.claim_rules_settlement?.claim_rules?.claim_mode || "Cashless & Reimbursement"} />
                    <Field label="Cashless Available" value={parsedExtra?.claim_rules_settlement?.claim_rules?.cashless_available} />
                    <Field label="Network Hospital Required" value={parsedExtra?.claim_rules_settlement?.claim_rules?.network_hospital_required} />
                    <Field label="Claim Submission Deadline" value={parsedExtra?.claim_rules_settlement?.claim_rules?.claim_submission_days} />
                    <Field label="Settlement Basis" value={parsedExtra?.claim_rules_settlement?.claim_rules?.settlement_basis} />
                  </Section>

                  <Section title="Hospitalization & Room Limits" icon={Building2}>
                    <Field label="Min Hospitalization Hours" value={parsedExtra?.hospitalization_logic?.hospitalization_rules?.minimum_hospitalization_hours || "24 Hours"} />
                    <Field label="ICU Room Rent Limit" value={parsedExtra?.hospitalization_logic?.hospitalization_rules?.icu_limit} />
                    <Field label="Room Rent Limit" value={parsedExtra?.hospitalization_logic?.hospitalization_rules?.room_rent_limit} />
                    <Field label="Daycare Procedures Allowed" value={parsedExtra?.hospitalization_logic?.hospitalization_rules?.daycare_allowed} />
                    <Field label="Ambulance Charges Cover" value={parsedExtra?.hospitalization_logic?.hospitalization_rules?.ambulance_limit} />
                  </Section>
                </div>

                {/* Sub Limits */}
                <div style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:14, padding:'18px 20px' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16, borderBottom:'1px solid rgba(255,255,255,0.06)', paddingBottom:12 }}>
                    <Shield size={16} color="var(--accent)" />
                    <span style={{ fontWeight:700, fontSize:'0.88rem', color:'var(--text)' }}>Treatment Sub-Limits & Caps</span>
                  </div>
                  {parsedExtra?.sub_limits?.sub_limits && parsedExtra.sub_limits.sub_limits.length > 0 ? (
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px,1fr))', gap:12 }}>
                      {parsedExtra.sub_limits.sub_limits.map((sl, idx) => (
                        <div key={idx} style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.05)', borderRadius:10, padding:12, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                          <span style={{ fontWeight:600, fontSize:'0.82rem', color:'var(--text)' }}>{sl.category}</span>
                          <span style={{ fontSize:'0.82rem', fontWeight:700, color:'var(--primary-light)', background:'rgba(6,182,212,0.1)', padding:'2px 8px', borderRadius:8 }}>
                            {sl.limit}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : parsedExtra?.conditional_benefits && parsedExtra.conditional_benefits.length > 0 ? (
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:12 }}>
                      {parsedExtra.conditional_benefits.map((cb, idx) => (
                        <div key={idx} style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.05)', borderRadius:10, padding:12 }}>
                          <div style={{ fontWeight:600, fontSize:'0.82rem', color:'var(--text)', marginBottom:4 }}>{cb.benefit_name}</div>
                          <div style={{ display:'flex', alignItems:'baseline', gap:4, marginBottom:6 }}>
                            <span style={{ fontSize:'0.95rem', fontWeight:700, color:'var(--primary-light)' }}>{cb.limit_amount}</span>
                          </div>
                          {cb.condition && (
                            <div style={{ fontSize:'0.72rem', color:'var(--text-dim)', fontStyle:'italic' }}>
                              ℹ️ {cb.condition}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ textAlign:'center', padding:16, color:'var(--text-dim)', fontSize:'0.82rem' }}>No specific sub-limits are defined. Coverage is up to the sum insured.</div>
                  )}
                </div>

                {/* Group Master covered plans */}
                {parsedExtra?.is_group_plan && parsedExtra.group_plans && parsedExtra.group_plans.length > 0 && (
                  <div style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:14, padding:'18px 20px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16, borderBottom:'1px solid rgba(255,255,255,0.06)', paddingBottom:12 }}>
                      <Layers size={16} color="var(--accent)" />
                      <span style={{ fontWeight:700, fontSize:'0.88rem', color:'var(--text)' }}>Group Master Policy - Covered Sub-Plans</span>
                    </div>

                    <div style={{ overflowX: 'auto', background: 'rgba(0, 0, 0, 0.15)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.05)' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
                            <th style={{ padding: '10px 14px', color: 'var(--text-dim)' }}>Sub Policy Number</th>
                            <th style={{ padding: '10px 14px', color: 'var(--text-dim)' }}>Plan Name</th>
                            <th style={{ padding: '10px 14px', color: 'var(--text-dim)' }}>Sum Insured</th>
                            <th style={{ padding: '10px 14px', color: 'var(--text-dim)' }}>Key Benefits</th>
                          </tr>
                        </thead>
                        <tbody>
                          {parsedExtra.group_plans.map((gp, idx) => (
                            <tr key={idx} style={{ borderBottom: idx < parsedExtra.group_plans.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                              <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--accent)' }}>{gp.policy_number}</td>
                              <td style={{ padding: '10px 14px', color: 'var(--text)' }}>{gp.plan_name}</td>
                              <td style={{ padding: '10px 14px', color: 'var(--primary-light)', fontWeight: 600 }}>{moneyFmt(gp.sum_insured)}</td>
                              <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: '0.78rem' }}>{gp.benefits}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Category 5: Benefits & Diseases */}
            {category === 'benefits' && (
              <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                {/* Pre-Existing Disease Rules */}
                {parsedExtra?.pre_existing_disease_rules?.ped && (
                  <div style={{ background:'rgba(139,92,246,0.06)', border:'1px solid rgba(139,92,246,0.15)', borderRadius:14, padding:'16px 18px' }}>
                    <div style={{ fontWeight:700, fontSize:'0.82rem', color:'#8B5CF6', marginBottom:10, display:'flex', alignItems:'center', gap:6 }}>
                      <Activity size={14} /> Pre-Existing Disease (PED) Waiting Periods & Rules
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1.5fr', gap:16 }}>
                      <div>
                        <div style={{ fontSize:'0.72rem', color:'var(--text-dim)', textTransform:'uppercase' }}>Are PEDs Covered?</div>
                        <div style={{ fontSize:'0.9rem', fontWeight:700, color:'var(--text)', marginTop:2 }}>
                          {parsedExtra.pre_existing_disease_rules.ped.covered || 'Yes'}
                        </div>
                        <div style={{ fontSize:'0.72rem', color:'var(--text-dim)', textTransform:'uppercase', marginTop:10 }}>Waiting Period</div>
                        <div style={{ fontSize:'0.9rem', fontWeight:700, color:'var(--text)', marginTop:2 }}>
                          {parsedExtra.pre_existing_disease_rules.ped.waiting_period || '48 Months'}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize:'0.72rem', color:'var(--text-dim)', textTransform:'uppercase', marginBottom:6 }}>Declared / Covered Pre-existing Diseases</div>
                        <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                          {(parsedExtra.pre_existing_disease_rules.ped.diseases || []).map((dis, idx) => (
                            <span key={idx} style={{ background:'rgba(139,92,246,0.15)', color:'#A78BFA', padding:'3px 10px', borderRadius:20, fontSize:'0.72rem', fontWeight:600 }}>
                              {dis}
                            </span>
                          ))}
                          {(!parsedExtra.pre_existing_disease_rules.ped.diseases || parsedExtra.pre_existing_disease_rules.ped.diseases.length === 0) && (
                            <span style={{ fontSize:'0.8rem', color:'var(--text-muted)', fontStyle:'italic' }}>No pre-existing diseases declared at inception.</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Disease specific rules */}
                <div style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:14, padding:'18px 20px' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16, borderBottom:'1px solid rgba(255,255,255,0.06)', paddingBottom:12 }}>
                    <Activity size={16} color="var(--accent)" />
                    <span style={{ fontWeight:700, fontSize:'0.88rem', color:'var(--text)' }}>Disease Specific AI Evaluation Rules</span>
                  </div>

                  {parsedExtra?.disease_condition_rules?.disease_rules && parsedExtra.disease_condition_rules.disease_rules.length > 0 ? (
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(320px, 1fr))', gap:14 }}>
                      {parsedExtra.disease_condition_rules.disease_rules.map((rule, idx) => (
                        <div key={idx} style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.05)', borderRadius:10, padding:14 }}>
                          <div style={{ fontWeight:700, fontSize:'0.85rem', color:'var(--text)', borderBottom:'1px solid rgba(255,255,255,0.04)', paddingBottom:6, marginBottom:8 }}>
                            {rule.disease_name}
                          </div>
                          
                          <div style={{ marginBottom:10 }}>
                            <div style={{ fontSize:'0.65rem', color:'var(--text-dim)', textTransform:'uppercase', marginBottom:3 }}>Eligibility Criteria</div>
                            <ul style={{ margin:0, paddingLeft:14, fontSize:'0.75rem', color:'var(--text-muted)', lineHeight:1.5 }}>
                              {(rule.eligibility_criteria || []).map((ec, i) => <li key={i}>{ec}</li>)}
                            </ul>
                          </div>

                          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                            <div>
                              <div style={{ fontSize:'0.65rem', color:'var(--text-dim)', textTransform:'uppercase', marginBottom:3 }}>Diagnostic Tests</div>
                              <ul style={{ margin:0, paddingLeft:12, fontSize:'0.72rem', color:'var(--text-muted)', lineHeight:1.4 }}>
                                {(rule.diagnostic_tests || []).map((t, i) => <li key={i}>{t}</li>)}
                              </ul>
                            </div>
                            <div>
                              <div style={{ fontSize:'0.65rem', color:'var(--text-dim)', textTransform:'uppercase', marginBottom:3 }}>Required Files</div>
                              <ul style={{ margin:0, paddingLeft:12, fontSize:'0.72rem', color:'var(--text-muted)', lineHeight:1.4 }}>
                                {(rule.required_documents || []).map((d, i) => <li key={i}>{d}</li>)}
                              </ul>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ textAlign:'center', padding:16, color:'var(--text-dim)', fontSize:'0.82rem' }}>No specific disease criteria found. Evaluated under standard policy limits.</div>
                  )}
                </div>

                {/* Benefits List Table */}
                <div style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:14, padding:'18px 20px' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16, borderBottom:'1px solid rgba(255,255,255,0.06)', paddingBottom:12 }}>
                    <Shield size={16} color="var(--accent)" />
                    <span style={{ fontWeight:700, fontSize:'0.88rem', color:'var(--text)' }}>Covered Benefits Details</span>
                  </div>

                  {parsedExtra?.benefit_details?.benefits && parsedExtra.benefit_details.benefits.length > 0 ? (
                    <div style={{ overflowX: 'auto', background: 'rgba(0, 0, 0, 0.15)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.05)' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
                            <th style={{ padding: '10px 14px', color: 'var(--text-dim)' }}>Benefit Name</th>
                            <th style={{ padding: '10px 14px', color: 'var(--text-dim)' }}>Limit / Cover</th>
                            <th style={{ padding: '10px 14px', color: 'var(--text-dim)' }}>Conditions</th>
                            <th style={{ padding: '10px 14px', color: 'var(--text-dim)' }}>Waiting Period</th>
                            <th style={{ padding: '10px 14px', color: 'var(--text-dim)' }}>Sub Limit</th>
                          </tr>
                        </thead>
                        <tbody>
                          {parsedExtra.benefit_details.benefits.map((b, idx) => (
                            <tr key={idx} style={{ borderBottom: idx < parsedExtra.benefit_details.benefits.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                              <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text)' }}>{b.benefit_name}</td>
                              <td style={{ padding: '10px 14px', color: 'var(--primary-light)', fontWeight: 600 }}>{b.limit}</td>
                              <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize:'0.75rem' }}>{b.conditions}</td>
                              <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>
                                <span style={{ background: b.waiting_period === 'None' ? 'transparent' : 'rgba(245,158,11,0.12)', color: b.waiting_period === 'None' ? 'var(--text-dim)' : '#F59E0B', padding:'2px 8px', borderRadius:8, fontSize:'0.7rem' }}>
                                  {b.waiting_period}
                                </span>
                              </td>
                              <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{b.sub_limit || 'None'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : policy.benefits ? (
                    <div style={{ background:'rgba(16,185,129,0.04)', border:'1px solid rgba(16,185,129,0.1)', borderRadius:10, padding:14 }}>
                      <div style={{ fontSize:'0.82rem', color:'var(--text-muted)', whiteSpace:'pre-wrap', lineHeight:1.6 }}>{policy.benefits}</div>
                    </div>
                  ) : (
                    <div style={{ textAlign:'center', padding:16, color:'var(--text-dim)', fontSize:'0.82rem' }}>No detailed benefits list found. Refer to standard plan coverages.</div>
                  )}
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
                  <div style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:14, padding:'18px 20px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16, borderBottom:'1px solid rgba(255,255,255,0.06)', paddingBottom:12 }}>
                      <Calendar size={16} color="var(--accent)" />
                      <span style={{ fontWeight:700, fontSize:'0.88rem', color:'var(--text)' }}>Waiting Periods Timeline</span>
                    </div>
                    {parsedExtra?.waiting_periods?.waiting_periods && parsedExtra.waiting_periods.waiting_periods.length > 0 ? (
                      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                        {parsedExtra.waiting_periods.waiting_periods.map((wp, idx) => (
                          <div key={idx} style={{ background:'rgba(255,255,255,0.015)', border:'1px solid rgba(255,255,255,0.04)', borderRadius:8, padding:10 }}>
                            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                              <span style={{ fontWeight:600, fontSize:'0.8rem', color:'var(--text)' }}>{wp.type}</span>
                              <span style={{ fontSize:'0.75rem', fontWeight:700, color:'#8B5CF6', background:'rgba(139,92,246,0.1)', padding:'2px 8px', borderRadius:8 }}>
                                {wp.duration_days}
                              </span>
                            </div>
                            <div style={{ fontSize:'0.72rem', color:'var(--text-muted)' }}>{wp.applicable_for}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ textAlign:'center', padding:12, color:'var(--text-dim)', fontSize:'0.8rem' }}>No waiting periods specified.</div>
                    )}
                  </div>

                  <div style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:14, padding:'18px 20px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16, borderBottom:'1px solid rgba(255,255,255,0.06)', paddingBottom:12 }}>
                      <AlertCircle size={16} color="#EF4444" />
                      <span style={{ fontWeight:700, fontSize:'0.88rem', color:'var(--text)' }}>Exclusions Tracker</span>
                    </div>
                    {parsedExtra?.exclusions?.exclusions && parsedExtra.exclusions.exclusions.length > 0 ? (
                      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                        {parsedExtra.exclusions.exclusions.map((exc, idx) => (
                          <div key={idx} style={{ background:'rgba(255,255,255,0.015)', border:'1px solid rgba(255,255,255,0.04)', borderRadius:8, padding:10 }}>
                            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                              <span style={{ fontWeight:600, fontSize:'0.8rem', color:'var(--text)' }}>{exc.type}</span>
                              <span style={{ fontSize:'0.65rem', fontWeight:600, color:'#EF4444', background:'rgba(239,68,68,0.1)', padding:'2px 6px', borderRadius:6 }}>
                                {exc.permanent_or_temporary}
                              </span>
                            </div>
                            <div style={{ fontSize:'0.72rem', color:'var(--text-muted)' }}>{exc.description}</div>
                          </div>
                        ))}
                      </div>
                    ) : policy.exclusions ? (
                      <div style={{ background:'rgba(239,68,68,0.04)', border:'1px solid rgba(239,68,68,0.1)', borderRadius:10, padding:14 }}>
                        <div style={{ fontSize:'0.82rem', color:'var(--text-muted)', whiteSpace:'pre-wrap', lineHeight:1.6 }}>{policy.exclusions}</div>
                      </div>
                    ) : (
                      <div style={{ textAlign:'center', padding:12, color:'var(--text-dim)', fontSize:'0.8rem' }}>No exclusions list found.</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Category 6: Support & Compliance */}
            {category === 'support' && (
              <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                {/* Help Center */}
                <div style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:14, padding:'18px 20px' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16, borderBottom:'1px solid rgba(255,255,255,0.06)', paddingBottom:12 }}>
                    <Building2 size={16} color="var(--accent)" />
                    <span style={{ fontWeight:700, fontSize:'0.88rem', color:'var(--text)' }}>Insurance Provider Help Center</span>
                  </div>
                  
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'16px 20px' }}>
                    <div>
                      <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                        {(parsedExtra?.contacts_support?.support?.tollfree || parsedExtra?.company_contact_details?.tollfree) && (
                          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                            <div style={{ width:32, height:32, borderRadius:8, background:'rgba(16,185,129,0.1)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                              <Phone size={15} color="#10B981" />
                            </div>
                            <div>
                              <div style={{ fontSize:'0.65rem', color:'var(--text-dim)', textTransform:'uppercase' }}>Toll Free Helpline</div>
                              <a href={`tel:${parsedExtra?.contacts_support?.support?.tollfree || parsedExtra?.company_contact_details?.tollfree}`} style={{ fontSize:'0.85rem', color:'var(--text)', fontWeight:600, textDecoration:'none' }}>
                                {parsedExtra?.contacts_support?.support?.tollfree || parsedExtra?.company_contact_details?.tollfree}
                              </a>
                            </div>
                          </div>
                        )}

                        {(parsedExtra?.contacts_support?.support?.whatsapp || parsedExtra?.company_contact_details?.whatsapp) && (
                          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                            <div style={{ width:32, height:32, borderRadius:8, background:'rgba(37,211,102,0.1)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                              <MessageSquare size={15} color="#25D366" />
                            </div>
                            <div>
                              <div style={{ fontSize:'0.65rem', color:'var(--text-dim)', textTransform:'uppercase' }}>WhatsApp Support</div>
                              <a 
                                href={`https://wa.me/${(parsedExtra?.contacts_support?.support?.whatsapp || parsedExtra?.company_contact_details?.whatsapp).replace(/\D/g, '')}`} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                style={{ fontSize:'0.85rem', color:'#25D366', fontWeight:600, textDecoration:'none', display:'inline-flex', alignItems:'center', gap:4 }}
                              >
                                {parsedExtra?.contacts_support?.support?.whatsapp || parsedExtra?.company_contact_details?.whatsapp} <ExternalLink size={10} />
                              </a>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                        {(parsedExtra?.contacts_support?.support?.claims_email || parsedExtra?.company_contact_details?.email) && (
                          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                            <div style={{ width:32, height:32, borderRadius:8, background:'rgba(6,182,212,0.1)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                              <Mail size={15} color="#06B6D4" />
                            </div>
                            <div>
                              <div style={{ fontSize:'0.65rem', color:'var(--text-dim)', textTransform:'uppercase' }}>Customer Care Email</div>
                              <a href={`mailto:${parsedExtra?.contacts_support?.support?.claims_email || parsedExtra?.company_contact_details?.email}`} style={{ fontSize:'0.85rem', color:'var(--text)', fontWeight:600, textDecoration:'none' }}>
                                {parsedExtra?.contacts_support?.support?.claims_email || parsedExtra?.company_contact_details?.email}
                              </a>
                            </div>
                          </div>
                        )}

                        {(parsedExtra?.contacts_support?.support?.website || parsedExtra?.company_contact_details?.website) && (
                          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                            <div style={{ width:32, height:32, borderRadius:8, background:'rgba(139,92,246,0.1)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                              <Globe size={15} color="#8B5CF6" />
                            </div>
                            <div>
                              <div style={{ fontSize:'0.65rem', color:'var(--text-dim)', textTransform:'uppercase' }}>Official Website</div>
                              <a 
                                href={(parsedExtra?.contacts_support?.support?.website || parsedExtra?.company_contact_details?.website).startsWith('http') ? (parsedExtra?.contacts_support?.support?.website || parsedExtra?.company_contact_details?.website) : `https://${parsedExtra?.contacts_support?.support?.website || parsedExtra?.company_contact_details?.website}`} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                style={{ fontSize:'0.85rem', color:'var(--accent)', fontWeight:600, textDecoration:'none', display:'inline-flex', alignItems:'center', gap:4 }}
                              >
                                {parsedExtra?.contacts_support?.support?.website || parsedExtra?.company_contact_details?.website} <ExternalLink size={10} />
                              </a>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {(parsedExtra?.contacts_support?.support?.grievance_contact || parsedExtra?.contacts_support?.support?.branch_contact || parsedExtra?.company_contact_details?.address) && (
                    <div style={{ marginTop: 14, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 12, display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12 }}>
                      {parsedExtra?.contacts_support?.support?.grievance_contact && (
                        <div>
                          <div style={{ fontSize:'0.65rem', color:'var(--text-dim)', textTransform:'uppercase' }}>Grievance Officer Contact</div>
                          <div style={{ fontSize:'0.8rem', color:'var(--text-muted)' }}>{parsedExtra.contacts_support.support.grievance_contact}</div>
                        </div>
                      )}
                      {parsedExtra?.company_contact_details?.address && (
                        <div>
                          <div style={{ fontSize:'0.65rem', color:'var(--text-dim)', textTransform:'uppercase' }}>Registered Office Address</div>
                          <div style={{ fontSize:'0.8rem', color:'var(--text-muted)' }}>{parsedExtra.company_contact_details.address}</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
                  <Section title="Tax & Compliance Info" icon={Shield}>
                    <Field label="Tax Saving Section" value={parsedExtra?.tax_compliance?.tax_benefits?.section || "Section 80D"} />
                    <Field label="Tax Benefit Eligible" value={parsedExtra?.tax_compliance?.tax_benefits?.eligible || "Yes"} />
                    <Field label="Company GSTIN" value={parsedExtra?.tax_compliance?.compliance?.gstin} />
                    <Field label="Policy UIN" value={parsedExtra?.tax_compliance?.compliance?.uin} />
                    <Field label="IRDAI Registration" value={parsedExtra?.tax_compliance?.compliance?.irda_registration} />
                    <Field label="CIN" value={parsedExtra?.tax_compliance?.compliance?.cin} />
                  </Section>

                  <Section title="Legal & Regulatory Clauses" icon={FileText}>
                    <Field label="Portability Terms" value={parsedExtra?.legal_regulatory_clauses?.legal?.portability} span={2} />
                    <Field label="Renewability Guarantee" value={parsedExtra?.legal_regulatory_clauses?.legal?.renewability} span={2} />
                    <Field label="Free Look / Cancellation Period" value={parsedExtra?.legal_regulatory_clauses?.legal?.cancellation_terms} span={2} />
                  </Section>
                </div>

                {parsedExtra?.health_card_data?.health_card && (
                  <div style={{ background:'linear-gradient(135deg, rgba(6,182,212,0.1) 0%, rgba(79,70,229,0.1) 100%)', border:'1px solid rgba(6,182,212,0.2)', borderRadius:14, padding:'16px 18px', maxWidth:420 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <Shield size={14} color="#06B6D4" />
                        <span style={{ fontWeight:700, fontSize:'0.78rem', color:'var(--text)', textTransform:'uppercase' }}>Digital Health Card</span>
                      </div>
                      <span style={{ background:'rgba(16,185,129,0.15)', color:'#10B981', padding:'1px 8px', borderRadius:10, fontSize:'0.65rem', fontWeight:700 }}>ECARD VALID</span>
                    </div>
                    <div style={{ fontSize:'1.05rem', fontWeight:700, color:'#fff', letterSpacing:'0.05em', marginBottom:10 }}>
                      {parsedExtra.health_card_data.health_card.member_id}
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                      <div>
                        <div style={{ fontSize:'0.6rem', color:'var(--text-dim)', textTransform:'uppercase' }}>Card Holder</div>
                        <div style={{ fontSize:'0.75rem', fontWeight:600, color:'var(--text)' }}>
                          {parsedExtra?.insured_customer_details?.insured_name || policy.policyholder_name}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize:'0.6rem', color:'var(--text-dim)', textTransform:'uppercase' }}>Valid Up To</div>
                        <div style={{ fontSize:'0.75rem', fontWeight:600, color:'var(--text)' }}>
                          {expFmt(parsedExtra.health_card_data.health_card.validity || policy.expiry_date)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* DOCUMENT tab */}
        {tab === 'doc' && (
          <div style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:14, padding:20 }}>
            <DocViewer policyId={policy.id} hasDocument={policy.has_document} />
          </div>
        )}

        {/* EDIT tab */}
        {tab === 'edit' && (
          <EditForm policy={policy} onSaved={updated => { setPolicy(updated); setTab('view'); }} />
        )}
      </motion.div>
    </motion.div>
  )
}
