import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Eye, Edit3, FileText, Save, X,
  Calendar, DollarSign, User, Building2, Shield,
  ExternalLink, Download, AlertCircle, CheckCircle2
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
      <motion.div variants={fadeUp} style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
        {[
          { label:'Coverage',  value: moneyFmt(policy.coverage_limit), icon: Shield,    color:'#10B981' },
          { label:'Premium',   value: moneyFmt(policy.premium),        icon: DollarSign, color:'#4F46E5' },
          { label:'Valid From',value: expFmt(policy.effective_date),   icon: Calendar,   color:'#06B6D4' },
          { label:'Expires',   value: expFmt(policy.expiry_date),      icon: Calendar,   color: policy.is_expired ? '#EF4444' : policy.days_to_expiry <= 30 ? '#F59E0B' : '#6B7280' },
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
            <Section title="Policy Identity" icon={Shield}>
              <Field label="Policy Number"    value={policy.policy_number} />
              <Field label="Policy Type"      value={policy.policy_type?.charAt(0).toUpperCase()+policy.policy_type?.slice(1)} />
              <Field label="Plan Name"        value={policy.plan_name} />
              <Field label="Insurance Co."    value={policy.insurance_company} />
            </Section>
            <Section title="Policyholder & Nominee" icon={User}>
              <Field label="Policyholder"     value={policy.policyholder_name} />
              <Field label="Date of Birth"    value={policy.date_of_birth && expFmt(policy.date_of_birth)} />
              <Field label="Nominee"          value={policy.nominee_name} />
              <Field label="Status"           value={policy.status?.toUpperCase()} />
            </Section>
            <Section title="Coverage" icon={DollarSign}>
              <Field label="Coverage Limit"   value={moneyFmt(policy.coverage_limit)} />
              <Field label="Premium"          value={moneyFmt(policy.premium)} />
              <Field label="Deductible"       value={moneyFmt(policy.deductible)} />
              <Field label="Coverage Type"    value={policy.coverage_type} />
            </Section>

            {parsedExtra && (
              <div style={{ marginTop: 16 }}>
                <Section title="AI-Extracted Advanced Insights" icon={Shield}>
                  <Field label="Cover Type" value={parsedExtra.cover_type} />
                  <Field label="Premium Frequency" value={parsedExtra.premium_frequency} />
                  <Field label="Co-Pay Percentage" value={parsedExtra.co_pay_percentage ? `${parsedExtra.co_pay_percentage}%` : '0%'} />
                  <Field label="Pre-Existing Disease Waiting" value={parsedExtra.pre_existing_disease_waiting_months ? `${parsedExtra.pre_existing_disease_waiting_months} Months` : 'None'} />
                  <Field label="Network Hospital Required" value={parsedExtra.network_hospital_required ? 'Yes' : 'No'} />
                  <Field label="Renewal Date" value={parsedExtra.renewal_date && expFmt(parsedExtra.renewal_date)} />
                  <Field label="Insured Members" value={parsedExtra.insured_members && parsedExtra.insured_members.length > 0 ? parsedExtra.insured_members.join(', ') : 'Policyholder only'} span={2} />
                  <Field label="Nominee Relationship" value={parsedExtra.nominee_relationship} />
                  <Field label="Extraction Confidence" value={parsedExtra.extraction_confidence ? `${(parsedExtra.extraction_confidence * 100).toFixed(0)}%` : 'N/A'} />
                </Section>

                {parsedExtra.risk_indicators && parsedExtra.risk_indicators.length > 0 && (
                  <div style={{ background:'rgba(245,158,11,0.06)', border:'1px solid rgba(245,158,11,0.15)', borderRadius:14, padding:'16px 18px', marginBottom:16 }}>
                    <div style={{ fontWeight:700, fontSize:'0.82rem', color:'#F59E0B', marginBottom:10 }}>⚠️ AI-Identified Risk & Policy Indicators</div>
                    <ul style={{ margin:0, paddingLeft:20, fontSize:'0.82rem', color:'var(--text-muted)', lineHeight:1.6 }}>
                      {parsedExtra.risk_indicators.map((risk, idx) => (
                        <li key={idx} style={{ marginBottom:4 }}>{risk}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {parsedExtra.documents_required_for_claim && parsedExtra.documents_required_for_claim.length > 0 && (
                  <div style={{ background:'rgba(6,182,212,0.06)', border:'1px solid rgba(6,182,212,0.15)', borderRadius:14, padding:'16px 18px', marginBottom:16 }}>
                    <div style={{ fontWeight:700, fontSize:'0.82rem', color:'#06B6D4', marginBottom:10 }}>📋 Documents Required For Claim</div>
                    <ul style={{ margin:0, paddingLeft:20, fontSize:'0.82rem', color:'var(--text-muted)', lineHeight:1.6 }}>
                      {parsedExtra.documents_required_for_claim.map((doc, idx) => (
                        <li key={idx} style={{ marginBottom:4 }}>{doc}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {parsedExtra.waiting_periods && parsedExtra.waiting_periods.length > 0 && (
                  <div style={{ background:'rgba(139,92,246,0.06)', border:'1px solid rgba(139,92,246,0.15)', borderRadius:14, padding:'16px 18px', marginBottom:16 }}>
                    <div style={{ fontWeight:700, fontSize:'0.82rem', color:'#8B5CF6', marginBottom:10 }}>⏳ Policy Waiting Periods</div>
                    <ul style={{ margin:0, paddingLeft:20, fontSize:'0.82rem', color:'var(--text-muted)', lineHeight:1.6 }}>
                      {parsedExtra.waiting_periods.map((wp, idx) => (
                        <li key={idx} style={{ marginBottom:4 }}>
                          {typeof wp === 'object' ? `${wp.condition || wp.type || 'Standard'}: ${wp.duration_months || wp.duration || 'N/A'}` : wp}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {((parsedExtra.claim_contact && Object.keys(parsedExtra.claim_contact).length > 0) || (parsedExtra.grievance_contact && Object.keys(parsedExtra.grievance_contact).length > 0)) && (
                  <Section title="Emergency & Contact Support" icon={Shield}>
                    <Field label="Claim Contact Email / Phone" value={parsedExtra.claim_contact ? `${parsedExtra.claim_contact.email || ''} ${parsedExtra.claim_contact.phone || ''}`.trim() : 'N/A'} />
                    <Field label="Grievance Contact Email / Phone" value={parsedExtra.grievance_contact ? `${parsedExtra.grievance_contact.email || ''} ${parsedExtra.grievance_contact.phone || ''}`.trim() : 'N/A'} />
                  </Section>
                )}
              </div>
            )}

            {(policy.benefits || policy.exclusions) && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginTop:16 }}>
                {policy.benefits && (
                  <div style={{ background:'rgba(16,185,129,0.06)', border:'1px solid rgba(16,185,129,0.15)',
                       borderRadius:14, padding:'16px 18px' }}>
                    <div style={{ fontWeight:700, fontSize:'0.82rem', color:'#10B981', marginBottom:10 }}>✅ Benefits</div>
                    <div style={{ fontSize:'0.82rem', color:'var(--text-muted)', whiteSpace:'pre-wrap', lineHeight:1.6 }}>{policy.benefits}</div>
                  </div>
                )}
                {policy.exclusions && (
                  <div style={{ background:'rgba(239,68,68,0.06)', border:'1px solid rgba(239,68,68,0.15)',
                       borderRadius:14, padding:'16px 18px' }}>
                    <div style={{ fontWeight:700, fontSize:'0.82rem', color:'#EF4444', marginBottom:10 }}>❌ Exclusions</div>
                    <div style={{ fontSize:'0.82rem', color:'var(--text-muted)', whiteSpace:'pre-wrap', lineHeight:1.6 }}>{policy.exclusions}</div>
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
