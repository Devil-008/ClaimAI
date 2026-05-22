import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Shield, Eye, EyeOff, ArrowLeft, ArrowRight,
         Users, FileText, AlertTriangle, BarChart3, Activity } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '../store/authStore'
import api from '../services/api'
import './LoginPage.css'

/* ─── Persona definitions ─── */
const PERSONAS = [
  {
    key: 'policyholder',
    label: 'Policyholder',
    icon: Users,
    color: '#06B6D4',
    gradient: 'linear-gradient(135deg,#0891B2,#06B6D4)',
    tagline: 'Submit & track your claims',
    demo: { email: 'mail.1.dummy.091@gmail.com', password: 'password123' },
  },
  {
    key: 'adjuster',
    label: 'Claims Adjuster',
    icon: FileText,
    color: '#4F46E5',
    gradient: 'linear-gradient(135deg,#3730A3,#4F46E5)',
    tagline: 'Review escalated complex claims',
    demo: { email: 'rsar7714@gmail.com', password: 'password123' },
  },
  {
    key: 'siu_investigator',
    label: 'SIU Investigator',
    icon: AlertTriangle,
    color: '#8B5CF6',
    gradient: 'linear-gradient(135deg,#7C3AED,#8B5CF6)',
    tagline: 'Investigate fraud-flagged cases',
    demo: { email: 'hm859219@gmail.com', password: 'password123' },
  },
  // {
  //   key: 'supervisor',
  //   label: 'Supervisor',
  //   icon: BarChart3,
  //   color: '#10B981',
  //   gradient: 'linear-gradient(135deg,#059669,#10B981)',
  //   tagline: 'Monitor KPIs & agent performance',
  //   demo: { email: 'deepak@demo.com', password: 'password123' },
  // },
  // {
  //   key: 'it_ops',
  //   label: 'IT / Ops',
  //   icon: Activity,
  //   color: '#F59E0B',
  //   gradient: 'linear-gradient(135deg,#D97706,#F59E0B)',
  //   tagline: 'System health & observability',
  //   demo: { email: 'anil@demo.com', password: 'password123' },
  // },
]

export default function LoginPage() {
  const navigate = useNavigate()
  const setAuth  = useAuthStore(s => s.setAuth)

  const [step, setStep]       = useState('persona')   // 'persona' | 'form'
  const [selected, setSelected] = useState(null)
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]   = useState(false)
  const [loading, setLoading] = useState(false)

  /* Choose persona → pre-fill demo creds */
  function handleSelectPersona(p) {
    setSelected(p)
    setEmail(p.demo.email)
    setPassword(p.demo.password)
    setStep('form')
  }

  /* Submit login */
  async function handleLogin(e) {
    e.preventDefault()
    if (!email || !password) { toast.error('Please enter email and password'); return }
    setLoading(true)
    try {
      const res = await api.post('/auth/login', { email, password })
      setAuth(res.data.access_token, res.data.user)
      toast.success(`Welcome, ${res.data.user.full_name}!`)
      navigate('/dashboard')
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      {/* background orbs */}
      <div className="login-orb login-orb-1" />
      <div className="login-orb login-orb-2" />

      {/* Back to landing */}
      <Link to="/" className="login-back">
        <ArrowLeft size={16}/> Back to Home
      </Link>

      {/* Logo */}
      <div className="login-logo">
        <div className="logo-icon"><Shield size={18}/></div>
        <span className="logo-text">Claim<span className="gradient-text">AI</span></span>
      </div>

      <AnimatePresence mode="wait">
        {step === 'persona' ? (
          /* ── STEP 1: Choose persona ── */
          <motion.div
            key="persona"
            className="login-container"
            initial={{ opacity:0, y:20 }}
            animate={{ opacity:1, y:0 }}
            exit={{ opacity:0, y:-20 }}
            transition={{ duration:0.35 }}
          >
            <div className="login-header">
              <h1 className="login-title">Who are you?</h1>
              <p className="login-subtitle">Select your role to access your tailored dashboard</p>
            </div>

            <div className="persona-select-grid">
              {PERSONAS.map(p => (
                <motion.button
                  key={p.key}
                  className="persona-select-card glass"
                  whileHover={{ scale:1.03, y:-4 }}
                  whileTap={{ scale:0.98 }}
                  onClick={() => handleSelectPersona(p)}
                >
                  <div className="ps-icon" style={{ background: p.gradient }}>
                    <p.icon size={20} color="#fff"/>
                  </div>
                  <div className="ps-info">
                    <div className="ps-label">{p.label}</div>
                    <div className="ps-tagline">{p.tagline}</div>
                  </div>
                  <ArrowRight size={16} color="var(--text-dim)"/>
                </motion.button>
              ))}
            </div>
          </motion.div>
        ) : (
          /* ── STEP 2: Login form ── */
          <motion.div
            key="form"
            className="login-container form-mode"
            initial={{ opacity:0, y:20 }}
            animate={{ opacity:1, y:0 }}
            exit={{ opacity:0, y:-20 }}
            transition={{ duration:0.35 }}
          >
            {/* Selected persona indicator */}
            {selected && (
              <div className="selected-persona-badge" style={{ '--p-color': selected.color }}>
                <div className="spb-icon" style={{ background: selected.gradient }}>
                  <selected.icon size={16} color="#fff"/>
                </div>
                <div>
                  <div className="spb-label">{selected.label}</div>
                  <div className="spb-tagline">{selected.tagline}</div>
                </div>
              </div>
            )}

            <div className="login-header">
              <h1 className="login-title">Sign In</h1>
              <p className="login-subtitle">Demo credentials are pre-filled below</p>
            </div>

            <form onSubmit={handleLogin} className="login-form">
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Password</label>
                <div className="pw-wrap">
                  <input
                    type={showPw ? 'text' : 'password'}
                    className="form-input"
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    className="pw-toggle"
                    onClick={() => setShowPw(!showPw)}
                    tabIndex={-1}
                  >
                    {showPw ? <EyeOff size={16}/> : <Eye size={16}/>}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="btn-primary w-full login-submit"
                disabled={loading}
              >
                {loading ? (
                  <span className="login-spinner"/>
                ) : (
                  <>Sign In <ArrowRight size={16}/></>
                )}
              </button>
            </form>

            {/* Demo hint */}
            <div className="demo-hint">
              <span>🔐 Demo mode</span>
              <code>{selected?.demo?.email}</code>
            </div>

            <button
              className="back-to-personas"
              onClick={() => setStep('persona')}
            >
              <ArrowLeft size={14}/> Change Role
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
