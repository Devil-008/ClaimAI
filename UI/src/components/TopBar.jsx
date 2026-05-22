import { useEffect } from 'react'
import { Bell, Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useNotificationsStore } from '../store/notificationsStore'
import './TopBar.css'

export default function TopBar({ user }) {
  const navigate = useNavigate()
  const { unreadCount, fetchNotifications } = useNotificationsStore()

  const ROLE_LABEL = {
    policyholder:    'Claimant Portal',
    adjuster:        'Adjuster Console',
    siu_investigator:'SIU Dashboard',
    supervisor:      'KPI Command Center',
    it_ops:          'IT/Ops Monitor',
  }

  useEffect(() => {
    fetchNotifications()
    // Poll for new notifications every 10 seconds
    const interval = setInterval(fetchNotifications, 10000)
    return () => clearInterval(interval)
  }, [fetchNotifications])

  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="topbar-title">{ROLE_LABEL[user?.role] || 'Dashboard'}</span>
      </div>
      <div className="topbar-right">
        <div className="topbar-search">
          <Search size={14} color="var(--text-dim)"/>
          <input placeholder="Search claims…" />
        </div>
        <button 
          className="topbar-icon-btn" 
          onClick={() => navigate('/dashboard/notifications')}
          style={{ cursor: 'pointer' }}
        >
          <Bell size={18}/>
          {unreadCount > 0 && (
            <span className="notif-badge">{unreadCount}</span>
          )}
        </button>
        <div className="topbar-greeting">
          Hi, <strong>{user?.full_name?.split(' ')[0]}</strong>
        </div>
      </div>
    </header>
  )
}
