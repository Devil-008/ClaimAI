/**
 * Shared loading / empty / error states used across all dashboard pages.
 */
import { Loader2, ServerCrash, Inbox } from 'lucide-react'

export function LoadingState({ label = 'Loading…' }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '60px 0', gap: 12, color: 'var(--text-dim)',
    }}>
      <Loader2 size={32} style={{ animation: 'spin 1s linear infinite' }}/>
      <span style={{ fontSize: '0.9rem' }}>{label}</span>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

export function ErrorState({ message, onRetry }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '60px 0', gap: 12, color: '#EF4444',
    }}>
      <ServerCrash size={32}/>
      <span style={{ fontSize: '0.9rem' }}>{message || 'Something went wrong'}</span>
      {onRetry && (
        <button className="btn-ghost" style={{ marginTop: 8 }} onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  )
}

export function EmptyState({ label = 'No data found' }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '60px 0', gap: 12, color: 'var(--text-dim)',
    }}>
      <Inbox size={32}/>
      <span style={{ fontSize: '0.9rem' }}>{label}</span>
    </div>
  )
}
