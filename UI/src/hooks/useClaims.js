/**
 * useClaims — fetches the authenticated user's claims from the API.
 * Returns { claims, stats, loading, error, refetch }
 */
import { useState, useEffect, useCallback } from 'react'
import api from '../services/api'

const STATUS_CONFIG = {
  fnol_received:        { label: 'FNOL Received',      cls: 'badge-info'    },
  coverage_verification:{ label: 'Verifying Coverage', cls: 'badge-info'    },
  damage_assessment:    { label: 'Assessing Damage',   cls: 'badge-warning' },
  fraud_scoring:        { label: 'Fraud Scoring',      cls: 'badge-warning' },
  settlement_pending:   { label: 'Settlement Pending', cls: 'badge-info'    },
  settled:              { label: 'Settled',            cls: 'badge-success' },
  escalated_adjuster:   { label: 'With Adjuster',      cls: 'badge-danger'  },
  escalated_siu:        { label: 'Pending for SIU Observation', cls: 'badge-danger'  },
  rejected:             { label: 'Rejected',           cls: 'badge-danger'  },
  closed:               { label: 'Closed',             cls: 'badge-success' },
}

export function useClaims() {
  const [claims,  setClaims]  = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get('/claims/')
      setClaims(res.data)
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to load claims')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetch() }, [fetch])

  // Compute summary stats from live data
  const stats = {
    total:      claims.length,
    settled:    claims.filter(c => c.status === 'settled' || c.status === 'closed').length,
    inProgress: claims.filter(c => !['settled','closed','rejected'].includes(c.status)).length,
    needsAttn:  claims.filter(c => ['escalated_adjuster','escalated_siu','rejected'].includes(c.status)).length,
  }

  return { claims, stats, loading, error, refetch: fetch, STATUS_CONFIG }
}
