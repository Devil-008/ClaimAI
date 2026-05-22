import { motion } from 'framer-motion'
import { Activity, Server, Cpu, MemoryStick, AlertTriangle, CheckCircle2, Clock } from 'lucide-react'

const SERVICES = [
  { name:'API Gateway',           status:'healthy',  ping:45,   err:0.10, cpu:22.5, mem:41.0 },
  { name:'FNOL Intake Agent',     status:'healthy',  ping:120,  err:0.20, cpu:18.0, mem:35.5 },
  { name:'Coverage Verif. Agent', status:'healthy',  ping:85,   err:0.00, cpu:12.0, mem:28.0 },
  { name:'Damage Assessment',     status:'degraded', ping:850,  err:1.50, cpu:55.0, mem:72.0 },
  { name:'Fraud Scoring Agent',   status:'healthy',  ping:200,  err:0.50, cpu:30.0, mem:48.0 },
  { name:'Settlement Agent',      status:'healthy',  ping:150,  err:0.10, cpu:15.0, mem:32.0 },
  { name:'Claimant Chatbot',      status:'healthy',  ping:90,   err:0.30, cpu:20.0, mem:40.0 },
  { name:'MySQL Database',        status:'healthy',  ping:10,   err:0.00, cpu:8.0,  mem:55.0 },
  { name:'Payment Gateway',       status:'healthy',  ping:300,  err:0.20, cpu:10.0, mem:20.0 },
]

const STATUS_CFG = {
  healthy:  { label:'Healthy',  cls:'badge-success', dot:'#10B981' },
  degraded: { label:'Degraded', cls:'badge-warning', dot:'#F59E0B' },
  down:     { label:'Down',     cls:'badge-danger',  dot:'#EF4444' },
}

function UsageBar({ value, warn=70, danger=90 }) {
  const color = value >= danger ? '#EF4444' : value >= warn ? '#F59E0B' : '#10B981'
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
      <div style={{ width:64, height:5, borderRadius:3, background:'rgba(255,255,255,0.08)', overflow:'hidden' }}>
        <div style={{ width:`${value}%`, height:'100%', background:color, borderRadius:3 }}/>
      </div>
      <span style={{ color, fontSize:'0.8rem', fontWeight:600 }}>{value}%</span>
    </div>
  )
}

const fadeUp = { hidden:{opacity:0,y:20}, visible:{opacity:1,y:0} }
const stagger = { visible:{ transition:{ staggerChildren:0.07 } } }

export default function ITOpsHome() {
  const healthy  = SERVICES.filter(s => s.status === 'healthy').length
  const degraded = SERVICES.filter(s => s.status === 'degraded').length
  const down     = SERVICES.filter(s => s.status === 'down').length

  const stats = [
    { icon:CheckCircle2, label:'Healthy Services', value:healthy,  color:'#10B981', bg:'rgba(16,185,129,0.12)' },
    { icon:AlertTriangle,label:'Degraded',          value:degraded, color:'#F59E0B', bg:'rgba(245,158,11,0.12)' },
    { icon:Server,       label:'Down',              value:down,     color:'#EF4444', bg:'rgba(239,68,68,0.12)'  },
    { icon:Clock,        label:'P95 Latency',       value:'1.55s',  color:'#4F46E5', bg:'rgba(79,70,229,0.12)'  },
  ]

  return (
    <motion.div initial="hidden" animate="visible" variants={stagger}>
      <motion.div variants={fadeUp} className="page-heading">
        <h1>System Health Monitor</h1>
        <p>Real-time observability across all services, agents, and infrastructure components</p>
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

      {/* Alert banner if degraded */}
      {degraded > 0 && (
        <motion.div variants={fadeUp}>
          <div style={{
            background:'rgba(245,158,11,0.1)', border:'1px solid rgba(245,158,11,0.3)',
            borderRadius:12, padding:'12px 20px', marginBottom:24,
            display:'flex', alignItems:'center', gap:12, fontSize:'0.88rem',
          }}>
            <AlertTriangle size={18} color="#F59E0B"/>
            <div>
              <strong style={{ color:'#F59E0B' }}>⚠ Damage Assessment Agent is degraded</strong>
              <span style={{ color:'var(--text-muted)', marginLeft:12 }}>
                Elevated latency (850ms) and error rate (1.5%). Consider scaling up or checking CV model endpoint.
              </span>
            </div>
          </div>
        </motion.div>
      )}

      {/* Services table */}
      <motion.div variants={fadeUp}>
        <div className="dash-section-title">
          <Activity size={16} color="#F59E0B"/> Service Health Matrix
        </div>
        <div className="dash-table-wrap">
          <table className="dash-table">
            <thead>
              <tr>
                <th>Service</th><th>Status</th><th>Response Time</th>
                <th>Error Rate</th>
                <th><Cpu size={12} style={{ verticalAlign:'middle' }}/> CPU</th>
                <th><MemoryStick size={12} style={{ verticalAlign:'middle' }}/> Memory</th>
              </tr>
            </thead>
            <tbody>
              {SERVICES.map(s => {
                const cfg = STATUS_CFG[s.status]
                const pingColor = s.ping > 500 ? '#EF4444' : s.ping > 200 ? '#F59E0B' : '#10B981'
                const errColor  = s.err  > 1   ? '#EF4444' : s.err  > 0.3  ? '#F59E0B' : '#10B981'
                return (
                  <tr key={s.name}>
                    <td style={{ fontWeight:600, display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ width:8, height:8, borderRadius:'50%', background:cfg.dot, display:'inline-block', flexShrink:0 }}/>
                      {s.name}
                    </td>
                    <td><span className={`badge ${cfg.cls}`}>{cfg.label}</span></td>
                    <td><span style={{ color:pingColor, fontWeight:600, fontSize:'0.83rem' }}>{s.ping}ms</span></td>
                    <td><span style={{ color:errColor,  fontWeight:600, fontSize:'0.83rem' }}>{s.err}%</span></td>
                    <td><UsageBar value={s.cpu}/></td>
                    <td><UsageBar value={s.mem} warn={60} danger={85}/></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Logs panel */}
      <motion.div variants={fadeUp} style={{ marginTop:24 }}>
        <div className="dash-section-title"><Activity size={16} color="#F59E0B"/> Recent System Logs</div>
        <div className="stat-card">
          <div style={{ fontFamily:'monospace', fontSize:'0.8rem', lineHeight:2, color:'var(--text-muted)' }}>
            <div><span style={{ color:'var(--text-dim)' }}>09:14:32</span> <span style={{ color:'#10B981' }}>[INFO ]</span>  A1 Orchestrator: Claim CLM-2024-0005 dispatched to A3+A4 in parallel</div>
            <div><span style={{ color:'var(--text-dim)' }}>09:14:55</span> <span style={{ color:'#F59E0B' }}>[WARN ]</span>  A4 Damage Assessment: CV model response time 1.8s (threshold: 1s)</div>
            <div><span style={{ color:'var(--text-dim)' }}>09:15:02</span> <span style={{ color:'#10B981' }}>[INFO ]</span>  A5 Fraud Scoring: Claim CLM-2024-0003 scored 0.87 → SIU referral</div>
            <div><span style={{ color:'var(--text-dim)' }}>09:15:20</span> <span style={{ color:'#EF4444' }}>[ERROR]</span>  A4 Damage Assessment: CV endpoint timeout (retry 1/3)</div>
            <div><span style={{ color:'var(--text-dim)' }}>09:15:23</span> <span style={{ color:'#10B981' }}>[INFO ]</span>  A4 Damage Assessment: Retry succeeded. Latency: 820ms</div>
            <div><span style={{ color:'var(--text-dim)' }}>09:16:01</span> <span style={{ color:'#10B981' }}>[INFO ]</span>  A6 Settlement: Payment PAY-2024-002 initiated → bank_transfer ₹3,500</div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
