import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { CheckCheck, Bell, Clock, ChevronRight } from 'lucide-react'
import { useNotificationsStore } from '../../store/notificationsStore'
import { LoadingState } from '../../components/StateViews'

const fadeUp = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }
const stagger = { visible: { transition: { staggerChildren: 0.05 } } }

export default function Notifications() {
  const navigate = useNavigate()
  const { 
    notifications, 
    unreadCount, 
    loading, 
    fetchNotifications, 
    markAsRead, 
    markAllRead 
  } = useNotificationsStore()

  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  // Helper to format date nicely
  function formatTime(dateStr) {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now - date

    if (diffMs < 60000) return 'Just now'
    
    const diffMins = Math.floor(diffMs / 60000)
    if (diffMins < 60) return `${diffMins}m ago`
    
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`

    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <motion.div initial="hidden" animate="visible" variants={stagger}>
      {/* Page Heading */}
      <motion.div variants={fadeUp} className="page-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1>Notifications</h1>
          <p>Stay updated on claim submissions and automated risk alerts</p>
        </div>
        {unreadCount > 0 && (
          <button 
            onClick={markAllRead}
            className="btn-ghost"
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 8, 
              padding: '8px 16px', 
              fontSize: '0.85rem',
              color: 'var(--primary-light)',
              border: '1px solid rgba(79,70,229,0.3)',
              borderRadius: '8px',
              background: 'rgba(79,70,229,0.05)'
            }}
          >
            <CheckCheck size={16} /> Mark all as read
          </button>
        )}
      </motion.div>

      {/* Main Body */}
      {loading && notifications.length === 0 ? (
        <LoadingState label="Loading notifications…" />
      ) : notifications.length === 0 ? (
        <motion.div 
          variants={fadeUp} 
          style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            justifyContent: 'center', 
            padding: '60px 20px',
            background: 'rgba(255,255,255,0.02)',
            border: '1px dashed var(--border)',
            borderRadius: '12px',
            textAlign: 'center',
            marginTop: 20
          }}
        >
          <div style={{ 
            width: 48, 
            height: 48, 
            borderRadius: '50%', 
            background: 'rgba(255,255,255,0.05)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            marginBottom: 16,
            color: 'var(--text-dim)'
          }}>
            <Bell size={20} />
          </div>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>All caught up!</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', maxWidth: 300 }}>You don't have any notifications at the moment.</p>
        </motion.div>
      ) : (
        <motion.div variants={fadeUp} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
          {notifications.map((n) => (
            <div 
              key={n.id} 
              style={{
                position: 'relative',
                background: n.is_read ? 'rgba(255,255,255,0.02)' : 'rgba(79,70,229,0.04)',
                border: n.is_read ? '1px solid var(--border)' : '1px solid rgba(79,70,229,0.2)',
                boxShadow: n.is_read ? 'none' : '0 4px 12px rgba(79,70,229,0.05)',
                borderRadius: '12px',
                padding: '16px 20px',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 16
              }}
            >
              {/* Unread Indicator Dot */}
              {!n.is_read && (
                <div style={{
                  position: 'absolute',
                  top: 22,
                  left: 8,
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: 'var(--primary-light)'
                }} />
              )}

              {/* Text Info */}
              <div style={{ flex: 1, paddingLeft: n.is_read ? 0 : 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                  <h4 style={{ 
                    fontSize: '0.92rem', 
                    fontWeight: n.is_read ? 600 : 700, 
                    color: n.is_read ? 'var(--text-muted)' : 'var(--text)' 
                  }}>
                    {n.title}
                  </h4>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 4, 
                    fontSize: '0.72rem', 
                    color: 'var(--text-dim)' 
                  }}>
                    <Clock size={11} />
                    <span>{formatTime(n.created_at)}</span>
                  </div>
                </div>
                <p style={{ 
                  fontSize: '0.85rem', 
                  color: n.is_read ? 'var(--text-dim)' : 'var(--text-muted)', 
                  lineHeight: 1.6,
                  whiteSpace: 'pre-line' 
                }}>
                  {n.message}
                </p>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                {!n.is_read && (
                  <button 
                    onClick={() => markAsRead(n.id)}
                    className="btn-ghost"
                    style={{ 
                      fontSize: '0.78rem', 
                      padding: '4px 10px', 
                      borderRadius: '6px',
                      color: 'var(--text-muted)',
                      border: '1px solid var(--border)'
                    }}
                  >
                    Mark read
                  </button>
                )}
                {n.claim_id && (
                  <button 
                    onClick={() => {
                      if (!n.is_read) markAsRead(n.id)
                      navigate(`/dashboard/claims/${n.claim_id}`)
                    }}
                    className="btn-ghost"
                    style={{ 
                      fontSize: '0.78rem', 
                      padding: '4px 10px', 
                      borderRadius: '6px',
                      color: 'var(--primary-light)',
                      border: '1px solid rgba(79,70,229,0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      background: 'rgba(79,70,229,0.03)'
                    }}
                  >
                    View Claim <ChevronRight size={12} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </motion.div>
      )}
    </motion.div>
  )
}
