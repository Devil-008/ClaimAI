import { motion } from 'framer-motion'
import { BarChart3, TrendingUp, TrendingDown, CheckCircle2, Clock, AlertTriangle, Star, Zap } from 'lucide-react'

const KPI_TREND = [
  { date:'Nov 10', stp:100, tat:45, fraud:0.052 },
  { date:'Nov 15', stp:50,  tat:60, fraud:0.086 },
  { date:'Nov 20', stp:33,  tat:75, fraud:0.357 },
  { date:'Nov 22', stp:50,  tat:70, fraud:0.289 },
  { date:'Nov 25', stp:40,  tat:80, fraud:0.313 },
]

const AGENT_PERF = [
  { agent:'A1 Orchestrator',      successRate:'99.8%', avgLatency:'120ms', status:'healthy'  },
  { agent:'A2 FNOL Intake',       successRate:'99.5%', avgLatency:'340ms', status:'healthy'  },
  { agent:'A3 Coverage Verify',   successRate:'99.9%', avgLatency:'85ms',  status:'healthy'  },
  { agent:'A4 Damage Assessment', successRate:'97.2%', avgLatency:'1.8s',  status:'degraded' },
  { agent:'A5 Fraud Scoring',     successRate:'99.1%', avgLatency:'200ms', status:'healthy'  },
  { agent:'A6 Settlement',        successRate:'99.7%', avgLatency:'150ms', status:'healthy'  },
  { agent:'A7 Adjuster Handoff',  successRate:'100%',  avgLatency:'90ms',  status:'healthy'  },
  { agent:'A8 Chatbot',           successRate:'98.9%', avgLatency:'95ms',  status:'healthy'  },
]

const fadeUp = { hidden:{opacity:0,y:20}, visible:{opacity:1,y:0} }
const stagger = { visible:{ transition:{ staggerChildren:0.07 } } }

export default function SupervisorHome() {
  const kpis = [
    { icon:CheckCircle2, label:'STP Rate (This Week)', value:'40%',  target:'≥60%', color:'#F59E0B', bg:'rgba(245,158,11,0.12)', delta:'▲ +7% vs last week', up:true },
    { icon:Clock,        label:'Avg TAT (Auto)',        value:'70min',target:'<2hrs', color:'#10B981', bg:'rgba(16,185,129,0.12)', delta:'▼ −5min vs last week', up:true },
    { icon:AlertTriangle,label:'Fraud Recall @10%',     value:'87%',  target:'≥85%', color:'#10B981', bg:'rgba(16,185,129,0.12)', delta:'▲ On Target', up:true },
    { icon:Star,         label:'Customer CSAT',         value:'4.2',  target:'≥4.3', color:'#F59E0B', bg:'rgba(245,158,11,0.12)', delta:'▼ −0.1 vs target', up:false },
    { icon:Zap,          label:'Tool Call Success',     value:'99.7%',target:'≥99.5%',color:'#10B981',bg:'rgba(16,185,129,0.12)', delta:'▲ Above Target', up:true },
    { icon:BarChart3,    label:'Hallucination Rate',    value:'0.3%', target:'<0.5%', color:'#10B981',bg:'rgba(16,185,129,0.12)', delta:'✓ Within Rails', up:true },
  ]

  return (
    <motion.div initial="hidden" animate="visible" variants={stagger}>
      <motion.div variants={fadeUp} className="page-heading">
        <h1>KPI Command Center</h1>
        <p>Real-time performance metrics across all 8 AI agents and claim pipelines</p>
      </motion.div>

      {/* KPI Cards */}
      <motion.div variants={fadeUp} className="stats-grid" style={{ gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))' }}>
        {kpis.map(k => (
          <div key={k.label} className="stat-card">
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
              <div className="stat-card-icon" style={{ background:k.bg }}>
                <k.icon size={18} color={k.color}/>
              </div>
              <span style={{ fontSize:'0.7rem', color:'var(--text-dim)' }}>Target: {k.target}</span>
            </div>
            <div className="stat-value" style={{ color:k.color, fontSize:'1.7rem' }}>{k.value}</div>
            <div className="stat-label">{k.label}</div>
            <div className={`stat-delta ${k.up ? 'up' : 'down'}`}>{k.delta}</div>
          </div>
        ))}
      </motion.div>

      {/* KPI trend sparklines (text-based since no chart lib yet) */}
      <motion.div variants={fadeUp} style={{ marginBottom:24 }}>
        <div className="dash-section-title"><TrendingUp size={16} color="#10B981"/> STP Rate Trend (Last 5 Days)</div>
        <div className="stat-card">
          <div style={{ display:'flex', alignItems:'flex-end', gap:12, height:80 }}>
            {KPI_TREND.map(d => (
              <div key={d.date} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                <span style={{ fontSize:'0.7rem', color:'var(--text-dim)' }}>{d.stp}%</span>
                <div style={{
                  width:'100%', height:`${d.stp * 0.5}px`,
                  background:`linear-gradient(to top, #4F46E5, #818CF8)`,
                  borderRadius:'4px 4px 0 0', minHeight:8,
                  opacity: 0.7 + (d.stp/200),
                }}/>
                <span style={{ fontSize:'0.68rem', color:'var(--text-dim)', textAlign:'center' }}>{d.date}</span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Agent performance table */}
      <motion.div variants={fadeUp}>
        <div className="dash-section-title"><Zap size={16} color="#4F46E5"/> Agent Performance Matrix</div>
        <div className="dash-table-wrap">
          <table className="dash-table">
            <thead>
              <tr><th>Agent</th><th>Success Rate</th><th>Avg Latency</th><th>Status</th></tr>
            </thead>
            <tbody>
              {AGENT_PERF.map(a => (
                <tr key={a.agent}>
                  <td style={{ fontWeight:600 }}>{a.agent}</td>
                  <td>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{ width:64, height:5, borderRadius:3, background:'rgba(255,255,255,0.08)' }}>
                        <div style={{ width:a.successRate, height:'100%', background:'#10B981', borderRadius:3 }}/>
                      </div>
                      <span style={{ color:'#10B981', fontWeight:600, fontSize:'0.83rem' }}>{a.successRate}</span>
                    </div>
                  </td>
                  <td style={{ color:'var(--text-muted)', fontSize:'0.83rem' }}>{a.avgLatency}</td>
                  <td>
                    <span className={`badge ${a.status==='healthy' ? 'badge-success' : 'badge-warning'}`}>
                      {a.status === 'healthy' ? '● Healthy' : '⚠ Degraded'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </motion.div>
  )
}
