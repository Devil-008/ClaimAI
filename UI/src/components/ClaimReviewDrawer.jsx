/**
 * ClaimReviewDrawer — slide-in review panel for Adjuster / SIU
 * Shows full claim details + AI fraud trace + Approve / Reject with notes
 */
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, FileText, Calendar, Tag, Activity, ShieldAlert,
  CheckCircle2, XCircle, Loader2, ExternalLink, AlertTriangle, Zap
} from 'lucide-react'
import api from '../services/api'
import toast from 'react-hot-toast'
import { useAuthStore } from '../store/authStore'

const AGENT_COLORS = {
  A2_FNOL_Intake:           { color:'#06B6D4', label:'A2 — FNOL Intake'       },
  A3_Coverage_Verification: { color:'#4F46E5', label:'A3 — Coverage Verify'   },
  A4_Damage_Assessment:     { color:'#10B981', label:'A4 — Damage Assessment' },
  A5_Fraud_Risk_Scoring:    { color:'#F59E0B', label:'A5 — Fraud Scoring'     },
  A6_Settlement:            { color:'#10B981', label:'A6 — Settlement'        },
  A7_Adjuster_Handoff:      { color:'#EF4444', label:'A7 — Adjuster Handoff'  },
  A8_Chatbot:               { color:'#8B5CF6', label:'A8 — Notify'            },
}

function fmt(d) {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) }
  catch { return d }
}

function Field({ label, value, accent }) {
  return (
    <div style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:8, padding:'10px 14px' }}>
      <div style={{ fontSize:'0.68rem', color:'var(--text-dim)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:3 }}>{label}</div>
      <div style={{ fontSize:'0.86rem', color: accent || 'var(--text)', fontWeight: accent ? 700 : 400, lineHeight:1.5, wordBreak:'break-word' }}>{value || '—'}</div>
    </div>
  )
}

export default function ClaimReviewDrawer({ claimId, onClose, onDecision }) {
  const { user } = useAuthStore()
  const [claim,            setClaim]            = useState(null)
  const [pipeline,         setPipeline]         = useState(null)
  const [loading,          setLoading]          = useState(true)
  const [notes,            setNotes]            = useState('')
  const [acting,           setActing]           = useState(null)  // 'approve' | 'reject' | 'partial_approve'
  const [showPartialInput, setShowPartialInput] = useState(false)
  const [customAmount,     setCustomAmount]     = useState('')
  const [showRequestInput, setShowRequestInput] = useState(false)
  const [requestMessage,   setRequestMessage]   = useState('')
  const [documents,        setDocuments]        = useState([])

  useEffect(() => {
    if (!claimId) return
    setLoading(true); setClaim(null); setPipeline(null); setNotes(''); setShowPartialInput(false); setCustomAmount(''); setDocuments([])
    Promise.all([
      api.get(`/claims/${claimId}`),
      api.get(`/fnol/${claimId}/pipeline`).catch(() => ({ data: null })),
      api.get(`/claims/${claimId}/documents`).catch(() => ({ data: [] })),
    ]).then(([cr, pr, dr]) => {
      setClaim(cr.data)
      setPipeline(pr.data)
      setDocuments(dr.data || [])
      const trace = pr.data?.pipeline_trace || []
      const a5 = trace.find(s => s.step === 'A5_Fraud_Risk_Scoring')
      const a4 = trace.find(s => s.step === 'A4_Damage_Assessment')
      const recPayout = a5?.result?.recommended_payout ?? a4?.result?.net_estimate
      if (recPayout) {
        setCustomAmount(recPayout.toString())
      }
    }).finally(() => setLoading(false))
  }, [claimId])

  async function decide(action, amount) {
    setActing(action)
    try {
      const payload = { action, notes: notes || undefined }
      if (action === 'partial_approve') {
        payload.amount = parseFloat(amount)
      }
      const res = await api.post(`/claims/${claimId}/decision`, payload)
      toast.success(
        action === 'approve' 
          ? (user?.role === 'adjuster' ? '✅ Recommendation submitted!' : '✅ Claim approved & settled!') 
          : action === 'partial_approve' 
          ? (user?.role === 'adjuster' ? `✅ Recommendation submitted for ₹${parseFloat(amount).toLocaleString('en-IN')}!` : `✅ Claim partially approved for ₹${parseFloat(amount).toLocaleString('en-IN')}!`)
          : (user?.role === 'adjuster' ? '✅ Rejection recommendation submitted!' : '❌ Claim rejected')
      )
      onDecision?.(res.data)
      onClose()
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Action failed')
    } finally { setActing(null) }
  }

  async function handleRequestDocuments() {
    if (!requestMessage.trim()) return toast.error('Please enter details of the requested documents')
    setActing('request')
    try {
      const res = await api.post(`/claims/${claimId}/request-documents`, { message: requestMessage })
      toast.success(
        res.data.status === 'escalated_siu'
          ? '⚠️ Max request limit exceeded. Claim escalated to SIU Investigator!'
          : '📧 Document request sent to claimant!'
      )
      onDecision?.(res.data)
      onClose()
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to request documents')
    } finally {
      setActing(null)
      setShowRequestInput(false)
      setRequestMessage('')
    }
  }

  const trace    = pipeline?.pipeline_trace || []
  const a5       = trace.find(s => s.step === 'A5_Fraud_Risk_Scoring')
  const a4       = trace.find(s => s.step === 'A4_Damage_Assessment')
  const fraudRes = a5?.result || {}
  const dmgRes   = a4?.result || {}

  const scoreColor = fraudRes.fraud_score > 0.7 ? '#EF4444'
                   : fraudRes.fraud_score > 0.4 ? '#F59E0B' : '#10B981'

  return (
    <AnimatePresence>
      {claimId && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            onClick={onClose}
            style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:200 }}
          />

          {/* Drawer */}
          <motion.div
            key="drawer"
            initial={{ x:'100%' }} animate={{ x:0 }} exit={{ x:'100%' }}
            transition={{ type:'spring', stiffness:320, damping:32 }}
            style={{
              position:'fixed', top:0, right:0, bottom:0, width: 560,
              background:'var(--bg-card, #13152a)', borderLeft:'1px solid rgba(255,255,255,0.08)',
              zIndex:201, display:'flex', flexDirection:'column', overflowY:'auto',
            }}
          >
            {/* Header */}
            <div style={{ padding:'20px 24px', borderBottom:'1px solid rgba(255,255,255,0.07)', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
              <div>
                <div style={{ fontWeight:700, fontSize:'1rem' }}>Claim Review</div>
                <div style={{ fontSize:'0.78rem', color:'var(--text-dim)', marginTop:2 }}>
                  {claim ? <code style={{ color:'#818CF8' }}>{claim.claim_number}</code> : '…'}
                </div>
              </div>
              <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-dim)', padding:6 }}>
                <X size={18}/>
              </button>
            </div>

            {loading && (
              <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:10, color:'var(--text-dim)' }}>
                <Loader2 size={18} className="spin"/> Loading claim details…
              </div>
            )}

            {!loading && claim && (
              <div style={{ flex:1, padding:'20px 24px', display:'flex', flexDirection:'column', gap:20, overflowY:'auto' }}>

                {/* Claim Info */}
                <div>
                  <div style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>
                    <FileText size={12} style={{ display:'inline', marginRight:5 }}/>Claim Details
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                    <Field label="Type"          value={(claim.claim_type||'').replace(/_/g,' ').replace(/\b\w/g, c=>c.toUpperCase())}/>
                    <Field label="Incident Date" value={fmt(claim.incident_date)}/>
                    <Field label="Priority"      value={claim.priority} accent={claim.priority==='critical'?'#EF4444':claim.priority==='high'?'#F59E0B':null}/>
                    <Field label="Channel"       value={(claim.channel||'').toUpperCase()}/>
                    <div style={{ gridColumn:'1/-1' }}>
                      <Field label="Incident Description" value={claim.incident_description}/>
                    </div>
                    <div style={{ gridColumn:'1/-1', borderTop:'1px dashed rgba(255,255,255,0.08)', marginTop:6, paddingTop:10, display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
                      <Field label="Policy Limit" value={claim.policy_coverage_limit !== undefined ? `₹${Number(claim.policy_coverage_limit).toLocaleString('en-IN')}` : '—'}/>
                      <Field label="Total Settled" value={claim.policy_total_settled_amount !== undefined ? `₹${Number(claim.policy_total_settled_amount).toLocaleString('en-IN')}` : '—'}/>
                      <Field label="Remaining Cover" value={claim.policy_remaining_capacity !== undefined ? `₹${Number(claim.policy_remaining_capacity).toLocaleString('en-IN')}` : '—'} accent={claim.policy_remaining_capacity > 0 ? '#10B981' : '#EF4444'}/>
                    </div>
                  </div>
                  {documents.length > 0 ? (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Uploaded Documents</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {documents.map(doc => {
                          const categoryLabels = {
                            claim_form: '📝 Claim Form',
                            medical_report: '🏥 Medical Report',
                            test_report: '🔬 Test Report',
                            id_card: '🆔 ID Card',
                            other: '📄 Other Document'
                          }
                          const token = JSON.parse(localStorage.getItem('claimai-auth') || '{}')?.state?.token || ''
                          const docUrl = `http://localhost:8000/api/claims/${claimId}/documents/${doc.id}?token=${token}`
                          return (
                            <div key={doc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8, padding: '8px 12px', fontSize: '0.8rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                                <FileText size={16} style={{ color: 'var(--primary-light)', flexShrink: 0 }} />
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>
                                    {doc.filename}
                                  </div>
                                  <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                                    {categoryLabels[doc.category] || doc.category}
                                  </div>
                                </div>
                              </div>
                              <a
                                href={docUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  fontSize: '0.75rem',
                                  fontWeight: 600,
                                  color: 'var(--primary-light)',
                                  textDecoration: 'none',
                                  padding: '4px 8px',
                                  borderRadius: 4,
                                  background: 'rgba(99,102,241,0.1)'
                                }}
                              >
                                View <ExternalLink size={10} />
                              </a>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ) : claim.document_url && (
                    <a href={`http://localhost:8000${claim.document_url}?token=${JSON.parse(localStorage.getItem('claimai-auth') || '{}')?.state?.token || ''}`} target="_blank" rel="noopener noreferrer"
                      style={{ display:'inline-flex', alignItems:'center', gap:6, marginTop:10,
                        padding:'7px 14px', borderRadius:8, fontSize:'0.8rem', fontWeight:600,
                        background:'rgba(99,102,241,0.1)', border:'1px solid rgba(99,102,241,0.25)',
                        color:'var(--primary-light)', textDecoration:'none' }}>
                      <FileText size={13}/> View Uploaded Document <ExternalLink size={11}/>
                    </a>
                  )}
                </div>

                {/* Adjuster Recommendation */}
                {claim.adjuster_recommended_action && (
                  <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(99,102,241,0.2)', borderLeft: '3px solid #818CF8', borderRadius: 10, padding: '14px 16px' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                      <FileText size={12} style={{ display: 'inline', marginRight: 5, color: '#818CF8' }}/> Adjuster Recommendation
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Action:</span>
                        <span style={{
                          fontSize: '0.82rem', fontWeight: 700, textTransform: 'uppercase',
                          color: claim.adjuster_recommended_action === 'approve' ? '#10B981' : claim.adjuster_recommended_action === 'partial_approve' ? '#F59E0B' : '#EF4444'
                        }}>
                          {claim.adjuster_recommended_action === 'approve' ? 'Approve & Settle' : claim.adjuster_recommended_action === 'partial_approve' ? 'Partially Approve' : 'Reject'}
                        </span>
                      </div>
                      {claim.adjuster_recommended_action === 'partial_approve' && claim.adjuster_recommended_amount !== undefined && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Recommended Amount:</span>
                          <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#F59E0B' }}>
                            ₹{Number(claim.adjuster_recommended_amount).toLocaleString('en-IN')}
                          </span>
                        </div>
                      )}
                      {claim.adjuster_recommended_notes && (
                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 8, marginTop: 4 }}>
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Remarks:</div>
                          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: 1.5 }}>
                            "{claim.adjuster_recommended_notes}"
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Fraud Score */}
                {fraudRes.fraud_score !== undefined && (
                  <div style={{ background:'rgba(255,255,255,0.02)', border:`1px solid ${scoreColor}33`, borderLeft:`3px solid ${scoreColor}`, borderRadius:10, padding:'14px 16px' }}>
                    <div style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>
                      <ShieldAlert size={12} style={{ display:'inline', marginRight:5 }}/>A5 Fraud Risk Score
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:10 }}>
                      <div style={{ fontSize:'2rem', fontWeight:800, color:scoreColor }}>{Number(fraudRes.fraud_score).toFixed(2)}</div>
                      <div>
                        <div style={{ fontSize:'0.85rem', fontWeight:600, color:scoreColor, textTransform:'capitalize' }}>{fraudRes.risk_level} Risk</div>
                        <div style={{ fontSize:'0.75rem', color:'var(--text-dim)' }}>
                          {fraudRes.siu_referred ? '🚨 SIU Referral Triggered' : fraudRes.auto_settle ? '✅ Auto-Settle Eligible' : '⚠ Adjuster Review Required'}
                        </div>
                      </div>
                      <div style={{ marginLeft:'auto', textAlign:'right', fontSize:'0.78rem', color:'var(--text-muted)' }}>
                        Recommended Payout<br/>
                        <strong style={{ color:'var(--primary-light)', fontSize:'0.95rem' }}>
                          ₹{Number(fraudRes.recommended_payout !== undefined ? fraudRes.recommended_payout : (dmgRes.net_estimate || 0)).toLocaleString('en-IN')}
                        </strong>
                        <div style={{ fontSize:'0.68rem', color:'var(--text-dim)', marginTop: 2 }}>
                          (Est. Net: ₹{Number(dmgRes.net_estimate || 0).toLocaleString('en-IN')})
                        </div>
                      </div>
                    </div>
                    {(fraudRes.red_flags || []).length > 0 && (
                      <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                        {(fraudRes.red_flags || []).map(f => (
                          <span key={f} style={{ background:'rgba(239,68,68,0.1)', color:'#FCA5A5', padding:'2px 7px', borderRadius:4, fontSize:'0.68rem', fontWeight:600 }}>
                            {f}
                          </span>
                        ))}
                      </div>
                    )}
                    {fraudRes.message && (
                      <div style={{ marginTop:8, fontSize:'0.78rem', color:'var(--text-muted)', fontStyle:'italic' }}>{fraudRes.message}</div>
                    )}
                  </div>
                )}

                {/* Agent Trace */}
                {trace.length > 0 && (
                  <div>
                    <div style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>
                      <Zap size={12} style={{ display:'inline', marginRight:5 }}/>AI Pipeline Trace
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                      {trace.map((s, i) => {
                        const cfg = AGENT_COLORS[s.step] || { color:'#818CF8', label:s.step }
                        const res = s.result || {}
                        return (
                          <div key={i} style={{
                            borderLeft:`3px solid ${cfg.color}`, borderRadius:6, padding:'8px 12px',
                            background:'rgba(255,255,255,0.02)', border:`1px solid ${cfg.color}22`,
                          }}>
                            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:2 }}>
                              <span style={{ fontWeight:700, fontSize:'0.78rem', color:cfg.color }}>{cfg.label}</span>
                              <span className={`badge ${s.status==='success'?'badge-success':'badge-danger'}`} style={{ fontSize:'0.65rem' }}>{s.status}</span>
                            </div>
                            <div style={{ fontSize:'0.76rem', color:'var(--text-muted)' }}>{res.message || res.reason || res.error || '—'}</div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Decision Notes */}
                <div>
                  <div style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>
                    Decision Notes <span style={{ color:'var(--text-dim)', fontWeight:400 }}>(optional)</span>
                  </div>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Add notes for rejection reason or approval remarks…"
                    rows={3}
                    style={{
                      width:'100%', boxSizing:'border-box', resize:'vertical',
                      background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.1)',
                      borderRadius:8, padding:'10px 12px', color:'var(--text)', fontSize:'0.84rem',
                      outline:'none', fontFamily:'inherit', lineHeight:1.6,
                    }}
                  />
                </div>

                {/* Action Buttons */}
                <div style={{ display:'flex', flexDirection: 'column', gap: 12, paddingBottom: 8 }}>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <button
                      className="btn-primary"
                      disabled={!!acting}
                      onClick={() => decide('approve')}
                      style={{ flex: 1, gap: 8, background: 'linear-gradient(135deg,#059669,#10B981)', borderColor: '#059669' }}
                    >
                      {acting==='approve'
                        ? (user?.role === 'adjuster' ? <><Loader2 size={14} className="spin"/> Recommending…</> : <><Loader2 size={14} className="spin"/> Approving…</>)
                        : (user?.role === 'adjuster' ? <><CheckCircle2 size={14}/> Recommend Approval</> : <><CheckCircle2 size={14}/> Approve &amp; Settle</>)}
                    </button>
                    <button
                      className="btn-primary"
                      disabled={!!acting}
                      onClick={() => setShowPartialInput(!showPartialInput)}
                      style={{ 
                        flex: 1, 
                        gap: 8, 
                        background: 'linear-gradient(135deg,#D97706,#F59E0B)', 
                        borderColor: '#D97706',
                        boxShadow: showPartialInput ? 'inset 0 2px 4px rgba(0,0,0,0.4)' : 'none',
                        border: showPartialInput ? '1.5px solid var(--text)' : '1px solid transparent'
                      }}
                    >
                      <AlertTriangle size={14}/>
                      {showPartialInput 
                        ? (user?.role === 'adjuster' ? 'Cancel Recommendation' : 'Cancel Partial')
                        : (user?.role === 'adjuster' ? 'Recommend Partial' : 'Partially Approve')
                      }
                    </button>
                  </div>

                  <AnimatePresence>
                    {showPartialInput && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        style={{
                          background: 'rgba(245, 158, 11, 0.05)',
                          border: '1px solid rgba(245, 158, 11, 0.25)',
                          borderRadius: 8,
                          padding: 16,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 12,
                          overflow: 'hidden'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#F59E0B', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            {user?.role === 'adjuster' ? 'Recommended Amount (₹)' : 'Settlement Amount (₹)'}
                          </span>
                          {(fraudRes.recommended_payout !== undefined ? fraudRes.recommended_payout : dmgRes.net_estimate) && (
                            <button
                              type="button"
                              onClick={() => setCustomAmount((fraudRes.recommended_payout !== undefined ? fraudRes.recommended_payout : dmgRes.net_estimate).toString())}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--primary-light)',
                                fontSize: '0.72rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                padding: 0,
                                textDecoration: 'underline'
                              }}
                            >
                              Use AI Recommended (₹{Number(fraudRes.recommended_payout !== undefined ? fraudRes.recommended_payout : dmgRes.net_estimate).toLocaleString('en-IN')})
                            </button>
                          )}
                        </div>
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                          <span style={{ position: 'absolute', left: 12, color: 'var(--text-dim)', fontSize: '0.9rem', fontWeight: 600 }}>₹</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            value={customAmount}
                            onChange={e => setCustomAmount(e.target.value)}
                            placeholder="0.00"
                            style={{
                              width: '100%',
                              boxSizing: 'border-box',
                              background: 'rgba(0,0,0,0.2)',
                              border: '1px solid rgba(255,255,255,0.1)',
                              borderRadius: 6,
                              padding: '10px 12px 10px 24px',
                              color: 'var(--text)',
                              fontSize: '0.9rem',
                              fontWeight: 600,
                              outline: 'none',
                            }}
                          />
                        </div>
                        <button
                          type="button"
                          className="btn-primary"
                          disabled={!!acting || !customAmount || parseFloat(customAmount) <= 0}
                          onClick={() => decide('partial_approve', customAmount)}
                          style={{
                            background: 'linear-gradient(135deg,#D97706,#F59E0B)',
                            borderColor: '#D97706',
                            width: '100%',
                            gap: 6
                          }}
                        >
                          {acting === 'partial_approve' ? (
                            <><Loader2 size={14} className="spin"/> Submitting…</>
                          ) : (
                            user?.role === 'adjuster' ? <>Confirm Recommendation</> : <>Confirm Partial Approval</>
                          )}
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <button
                    className="btn-primary"
                    disabled={!!acting}
                    onClick={() => { setShowRequestInput(!showRequestInput); setShowPartialInput(false); }}
                    style={{
                      width: '100%', gap: 8,
                      background: 'linear-gradient(135deg,#3B82F6,#2563EB)', borderColor: '#3B82F6',
                      boxShadow: showRequestInput ? 'inset 0 2px 4px rgba(0,0,0,0.4)' : 'none',
                      border: showRequestInput ? '1.5px solid var(--text)' : '1px solid transparent'
                    }}
                  >
                    <FileText size={14}/>
                    {showRequestInput ? 'Cancel Request' : 'Request More Info'}
                  </button>

                  <AnimatePresence>
                    {showRequestInput && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        style={{
                          background: 'rgba(59, 130, 246, 0.05)',
                          border: '1px solid rgba(59, 130, 246, 0.25)',
                          borderRadius: 8,
                          padding: 16,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 12,
                          overflow: 'hidden'
                        }}
                      >
                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#3B82F6', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          What documents are required?
                        </div>
                        <textarea
                          value={requestMessage}
                          onChange={e => setRequestMessage(e.target.value)}
                          placeholder="Describe the additional documents required (e.g. Please upload original pathology test report)..."
                          rows={3}
                          style={{
                            width: '100%', boxSizing: 'border-box', resize: 'vertical',
                            background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: 6, padding: '10px 12px', color: 'var(--text)', fontSize: '0.84rem',
                            outline: 'none', fontFamily: 'inherit', lineHeight: 1.5,
                          }}
                        />
                        <button
                          type="button"
                          className="btn-primary"
                          disabled={!!acting || !requestMessage.trim()}
                          onClick={handleRequestDocuments}
                          style={{
                            background: 'linear-gradient(135deg,#3B82F6,#2563EB)',
                            borderColor: '#2563EB',
                            width: '100%',
                            gap: 6
                          }}
                        >
                          {acting === 'request' ? (
                            <><Loader2 size={14} className="spin"/> Sending…</>
                          ) : (
                            <>Send Request (Attempt {Number(claim.document_request_count || 0) + 1}/3)</>
                          )}
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <button
                    className="btn-ghost"
                    disabled={!!acting}
                    onClick={() => decide('reject')}
                    style={{ width: '100%', gap: 8, color: '#EF4444', borderColor: 'rgba(239,68,68,0.35)' }}
                  >
                    {acting==='reject'
                      ? (user?.role === 'adjuster' ? <><Loader2 size={14} className="spin"/> Recommending…</> : <><Loader2 size={14} className="spin"/> Rejecting…</>)
                      : (user?.role === 'adjuster' ? <><XCircle size={14}/> Recommend Rejection</> : <><XCircle size={14}/> Reject Claim</>)}
                  </button>
                </div>

                <div style={{ fontSize:'0.72rem', color:'var(--text-dim)', display:'flex', alignItems:'center', gap:5 }}>
                  <AlertTriangle size={11}/>
                  {user?.role === 'adjuster'
                    ? "This will submit your recommendation and escalate the claim to the SIU Investigator for re-verification."
                    : "This action is permanent. The claimant will be notified immediately."
                  }
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
