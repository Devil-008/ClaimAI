import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Shield, Zap, Brain, Users, BarChart3, Lock,
  ArrowRight, CheckCircle2, ChevronRight, Activity,
  FileText, Search, DollarSign, AlertTriangle, MessageSquare, Workflow
} from 'lucide-react'
import './LandingPage.css'

/* ── Persona cards ── */
const PERSONAS = [
  {
    icon: Users,
    role: 'Policyholder',
    color: '#06B6D4',
    gradient: 'linear-gradient(135deg,#0891B2 0%,#06B6D4 100%)',
    desc: 'Submit claims, upload documents, and track real-time settlement status from anywhere.',
    tag: 'Claimant Portal',
  },
  {
    icon: FileText,
    role: 'Claims Adjuster',
    color: '#4F46E5',
    gradient: 'linear-gradient(135deg,#3730A3 0%,#4F46E5 100%)',
    desc: 'Review AI-escalated complex claims with full reasoning traces and one-click decisions.',
    tag: 'Adjuster Console',
  },
  {
    icon: AlertTriangle,
    role: 'SIU Investigator',
    color: '#8B5CF6',
    gradient: 'linear-gradient(135deg,#7C3AED 0%,#8B5CF6 100%)',
    desc: 'Investigate fraud-flagged cases with risk scores, red-flag breakdowns, and watchlist data.',
    tag: 'SIU Dashboard',
  },
  {
    icon: BarChart3,
    role: 'Supervisor',
    color: '#10B981',
    gradient: 'linear-gradient(135deg,#059669 0%,#10B981 100%)',
    desc: 'Monitor STP rates, TAT metrics, CSAT scores, and agent-level KPIs in real time.',
    tag: 'KPI Command Center',
  },
  {
    icon: Activity,
    role: 'IT / Ops',
    color: '#F59E0B',
    gradient: 'linear-gradient(135deg,#D97706 0%,#F59E0B 100%)',
    desc: 'Watch agent health, API latencies, error rates, and system observability dashboards.',
    tag: 'Ops Monitor',
  },
]

/* ── Agent pipeline steps ── */
const AGENTS = [
  { id:'A1', icon: Workflow,      label:'Orchestrator',        desc:'State machine that coordinates the entire claim pipeline.' },
  { id:'A2', icon: FileText,      label:'FNOL Intake',         desc:'OCR/NER extraction from forms, emails, voice, and images.' },
  { id:'A3', icon: Shield,        label:'Coverage Verify',     desc:'Validates policy in-force status, limits, and exclusions.' },
  { id:'A4', icon: Search,        label:'Damage Assessment',   desc:'CV model + RAG estimates repair costs from photos/docs.' },
  { id:'A5', icon: AlertTriangle, label:'Fraud & Risk Score',  desc:'Predictive model flags red flags and SIU watchlist hits.' },
  { id:'A6', icon: DollarSign,    label:'Settlement',          desc:'Calculates payout, initiates payment, generates letter.' },
  { id:'A7', icon: Users,         label:'Adjuster Handoff',    desc:'Packages complex claims with reasoning trace for human.' },
  { id:'A8', icon: MessageSquare, label:'Claimant Chatbot',    desc:'Real-time Q&A and status updates via conversational AI.' },
]

/* ── Stats ── */
const STATS = [
  { value: '≥60%', label: 'Straight-Through Processing' },
  { value: '<2hrs', label: 'Auto-Settlement TAT' },
  { value: '≥99%', label: 'Coverage Decision Accuracy' },
  { value: '≥85%', label: 'Fraud Recall @ Top 10%' },
]

/* ── Features ── */
const FEATURES = [
  { icon: Brain,   title: 'Multi-Agent AI Core',   desc: '8 specialized agents orchestrated by LangGraph state machine.' },
  { icon: Shield,  title: 'Five-Rail Guardrails',   desc: 'Input · Dialog · Retrieval · Execution · Output rails enforced.' },
  { icon: Zap,     title: '<5s Agent Loop P95',     desc: 'Deterministic feedback loops with circuit-breaker protection.' },
  { icon: Lock,    title: 'GDPR · SOC 2 Ready',     desc: 'End-to-end encryption, PII redaction, immutable audit logs.' },
]

const fadeUp = { hidden: { opacity:0, y:30 }, visible: { opacity:1, y:0 } }
const stagger = { visible: { transition: { staggerChildren: 0.1 } } }

export default function LandingPage() {
  const navigate = useNavigate()

  return (
    <div className="landing">
      {/* ── NAVBAR ── */}
      <nav className="landing-nav glass">
        <div className="landing-nav-inner">
          <div className="logo">
            <div className="logo-icon"><Shield size={18}/></div>
            <span className="logo-text">Claim<span className="gradient-text">AI</span></span>
          </div>
          <div className="nav-links">
            <a href="#agents">Agents</a>
            <a href="#personas">Personas</a>
            <a href="#features">Features</a>
          </div>
          <div className="nav-actions">
            <button className="btn-ghost" onClick={() => navigate('/login')}>Sign In</button>
            <button className="btn-primary" onClick={() => navigate('/login')}>
              Get Started <ArrowRight size={16}/>
            </button>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="hero">
        {/* background orbs */}
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />

        <motion.div
          className="hero-content"
          initial="hidden" animate="visible" variants={stagger}
        >
          <motion.div variants={fadeUp} className="hero-badge">
            <span className="badge badge-info">✦ AI-Powered Insurance Platform</span>
          </motion.div>

          <motion.h1 variants={fadeUp} className="hero-title">
            From FNOL to Settlement
            <br />
            <span className="gradient-text">in Under 2 Hours</span>
          </motion.h1>

          <motion.p variants={fadeUp} className="hero-desc">
            An 8-agent AI system that automates the complete insurance claims lifecycle —
            intake, verification, assessment, fraud scoring, and settlement — with
            intelligent human escalation for complex cases.
          </motion.p>

          <motion.div variants={fadeUp} className="hero-ctas">
            <button className="btn-primary hero-cta-main" onClick={() => navigate('/login')}>
              Access Your Dashboard <ArrowRight size={18}/>
            </button>
            <a href="#agents" className="btn-ghost">
              See How It Works <ChevronRight size={16}/>
            </a>
          </motion.div>

          {/* Stats row */}
          <motion.div variants={fadeUp} className="hero-stats">
            {STATS.map(s => (
              <div key={s.label} className="hero-stat">
                <div className="hero-stat-value gradient-text">{s.value}</div>
                <div className="hero-stat-label">{s.label}</div>
              </div>
            ))}
          </motion.div>
        </motion.div>

        {/* Animated pipeline visual */}
        <motion.div
          className="hero-visual animate-float"
          initial={{ opacity:0, scale:0.9 }}
          animate={{ opacity:1, scale:1 }}
          transition={{ duration:0.8, delay:0.3 }}
        >
          <div className="pipeline-card glass">
            <div className="pipeline-header">
              <span className="pip-dot green"/><span className="pip-dot yellow"/><span className="pip-dot red"/>
              <span className="pipeline-title">Claim Pipeline — Live</span>
            </div>
            {['FNOL Received','Coverage ✓','Damage: $8,500','Fraud Score: 0.03','Settlement Initiated'].map((step, i) => (
              <div key={step} className="pipeline-step" style={{ animationDelay: `${i * 0.4}s` }}>
                <CheckCircle2 size={14} color="#10B981"/>
                <span>{step}</span>
                <span className="pipeline-step-time">{['09:00','09:02','09:04','09:06','09:08'][i]}</span>
              </div>
            ))}
            <div className="pipeline-result">
              <DollarSign size={16} color="#10B981"/>
              <strong>₹3,500 Settled — Auto</strong>
              <span className="badge badge-success">Done</span>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ── AGENT PIPELINE ── */}
      <section className="section" id="agents">
        <motion.div
          className="section-header"
          initial="hidden" whileInView="visible" viewport={{ once:true }} variants={stagger}
        >
          <motion.p variants={fadeUp} className="section-label">The Engine</motion.p>
          <motion.h2 variants={fadeUp} className="section-title">
            8 Specialized AI Agents
          </motion.h2>
          <motion.p variants={fadeUp} className="section-desc">
            Each agent has a distinct role, bounded autonomy, and isolated context — orchestrated by LangGraph.
          </motion.p>
        </motion.div>

        <motion.div
          className="agents-grid"
          initial="hidden" whileInView="visible" viewport={{ once:true }} variants={stagger}
        >
          {AGENTS.map((ag, i) => (
            <motion.div key={ag.id} variants={fadeUp} className="agent-card glass">
              <div className="agent-id">{ag.id}</div>
              <div className="agent-icon-wrap">
                <ag.icon size={22} color="var(--primary-light)"/>
              </div>
              <div className="agent-label">{ag.label}</div>
              <p className="agent-desc">{ag.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ── PERSONAS ── */}
      <section className="section" id="personas">
        <motion.div
          className="section-header"
          initial="hidden" whileInView="visible" viewport={{ once:true }} variants={stagger}
        >
          <motion.p variants={fadeUp} className="section-label">Who It Serves</motion.p>
          <motion.h2 variants={fadeUp} className="section-title">
            Role-Based Access for Every Stakeholder
          </motion.h2>
          <motion.p variants={fadeUp} className="section-desc">
            Each persona gets a tailored dashboard with exactly the tools and data they need.
          </motion.p>
        </motion.div>

        <motion.div
          className="personas-grid"
          initial="hidden" whileInView="visible" viewport={{ once:true }} variants={stagger}
        >
          {PERSONAS.map(p => (
            <motion.div
              key={p.role}
              variants={fadeUp}
              className="persona-card glass"
              whileHover={{ y:-6, transition:{ duration:0.2 } }}
              onClick={() => navigate('/login')}
            >
              <div className="persona-icon" style={{ background: p.gradient }}>
                <p.icon size={22} color="#fff"/>
              </div>
              <div className="persona-tag">{p.tag}</div>
              <h3 className="persona-role">{p.role}</h3>
              <p className="persona-desc">{p.desc}</p>
              <div className="persona-link">
                Access Dashboard <ArrowRight size={14}/>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ── FEATURES ── */}
      <section className="section features-section" id="features">
        <motion.div
          className="features-inner"
          initial="hidden" whileInView="visible" viewport={{ once:true }} variants={stagger}
        >
          <div className="features-left">
            <motion.p variants={fadeUp} className="section-label">Enterprise-Grade</motion.p>
            <motion.h2 variants={fadeUp} className="section-title left">
              Built for Production,<br/>Not Just Demos
            </motion.h2>
            <motion.p variants={fadeUp} className="section-desc left">
              Every design decision is grounded in real insurance ops: guardrails, memory isolation,
              audit immutability, and regulator-ready explainability.
            </motion.p>
            <motion.div variants={fadeUp}>
              <button className="btn-primary mt-4" onClick={() => navigate('/login')}>
                Start Processing Claims <ArrowRight size={16}/>
              </button>
            </motion.div>
          </div>

          <div className="features-right">
            {FEATURES.map(f => (
              <motion.div key={f.title} variants={fadeUp} className="feature-item glass">
                <div className="feature-icon">
                  <f.icon size={20} color="var(--primary-light)"/>
                </div>
                <div>
                  <div className="feature-title">{f.title}</div>
                  <div className="feature-desc">{f.desc}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ── CTA FOOTER ── */}
      <section className="cta-section">
        <div className="orb orb-cta-1"/>
        <div className="orb orb-cta-2"/>
        <motion.div
          className="cta-inner"
          initial="hidden" whileInView="visible" viewport={{ once:true }} variants={stagger}
        >
          <motion.h2 variants={fadeUp} className="cta-title">
            Ready to transform your claims operation?
          </motion.h2>
          <motion.p variants={fadeUp} className="cta-desc">
            Select your role and log in to experience the full multi-agent claims automation platform.
          </motion.p>
          <motion.div variants={fadeUp} className="cta-buttons">
            {PERSONAS.map(p => (
              <button
                key={p.role}
                className="cta-persona-btn"
                style={{ '--p-color': p.color }}
                onClick={() => navigate('/login')}
              >
                <p.icon size={16}/>
                {p.role}
              </button>
            ))}
          </motion.div>
        </motion.div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="landing-footer">
        <div className="logo">
          <div className="logo-icon"><Shield size={16}/></div>
          <span className="logo-text">Claim<span className="gradient-text">AI</span></span>
        </div>
        <p className="footer-note">© 2024 ClaimAI — Agent 7 Claims Automation Platform</p>
      </footer>
    </div>
  )
}
