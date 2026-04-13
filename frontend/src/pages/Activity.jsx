import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import apiClient from '../api/client'
import Modal from '../components/Modal'
import { useAuth } from '../contexts/AuthContext'

const ACTION_TYPES = ['all', 'login', 'create_project', 'update_project', 'submit_questionnaire', 'generate_srs', 'chat', 'download_pdf']
const PAGE_SIZE = 20

const ACTION_COLORS = {
  login: { bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.2)', color: '#22c55e' },
  create_project: { bg: 'rgba(244,123,32,0.1)', border: 'rgba(244,123,32,0.2)', color: '#F59340' },
  update_project: { bg: 'rgba(96,165,250,0.1)', border: 'rgba(96,165,250,0.2)', color: '#93c5fd' },
  submit_questionnaire: { bg: 'rgba(139,92,246,0.1)', border: 'rgba(139,92,246,0.2)', color: '#a78bfa' },
  generate_srs: { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.2)', color: '#fbbf24' },
  chat: { bg: 'rgba(6,182,212,0.1)', border: 'rgba(6,182,212,0.2)', color: '#22d3ee' },
  download_pdf: { bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.2)', color: '#10b981' },
}

const getActionCfg = (action) => ACTION_COLORS[action] || { bg: 'rgba(71,85,105,0.12)', border: 'rgba(71,85,105,0.2)', color: '#94a3b8' }

const rowVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: (i) => ({ opacity: 1, y: 0, transition: { delay: i * 0.03 } })
}

export default function Activity() {
  const { isSuperAdmin } = useAuth()
  const [activities, setActivities] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [filters, setFilters] = useState({ user_id: '', action: '', from: '', to: '' })
  const [showClearModal, setShowClearModal] = useState(false)
  const [clearLoading, setClearLoading] = useState(false)
  const [clearError, setClearError] = useState('')
  const [clearSuccess, setClearSuccess] = useState('')

  const fetchUsers = useCallback(async () => {
    if (!isSuperAdmin()) return
    try {
      const res = await apiClient.get('/users')
      setUsers(res.data.users || res.data || [])
    } catch {}
  }, [isSuperAdmin])

  const fetchActivity = useCallback(async () => {
    setLoading(true)
    try {
      const params = { page, limit: PAGE_SIZE }
      if (filters.user_id) params.user_id = filters.user_id
      if (filters.action && filters.action !== 'all') params.action = filters.action
      if (filters.from) params.from = filters.from
      if (filters.to) params.to = filters.to

      const res = await apiClient.get('/activity', { params })
      setActivities(res.data.activities || res.data.logs || res.data || [])
      setTotalPages(res.data.totalPages || res.data.total_pages || 1)
    } catch {
      setError('Failed to load activity log.')
    } finally {
      setLoading(false)
    }
  }, [page, filters])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  useEffect(() => {
    fetchActivity()
  }, [fetchActivity])

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
    setPage(1)
  }

  const formatDate = (d) => {
    if (!d) return '—'
    return new Date(d).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  }

  const hasFilters = filters.user_id || filters.action || filters.from || filters.to

  const handleClearLogs = async () => {
    setClearLoading(true)
    setClearError('')
    setClearSuccess('')
    try {
      const params = {}
      if (filters.user_id) params.user_id = filters.user_id
      if (filters.action && filters.action !== 'all') params.action = filters.action
      if (filters.from) params.from = filters.from
      if (filters.to) params.to = filters.to
      const res = await apiClient.delete('/activity/clear', { params })
      setClearSuccess(`${res.data.count} log(s) cleared successfully.`)
      fetchActivity()
    } catch (err) {
      setClearError(err.response?.data?.error || 'Failed to clear logs.')
    } finally {
      setClearLoading(false)
    }
  }

  const selectStyle = {
    padding: '7px 12px',
    backgroundColor: '#0f1117',
    border: '1px solid #1e2533',
    borderRadius: '10px',
    color: '#f1f5f9',
    fontSize: '0.8125rem',
    outline: 'none',
    cursor: 'pointer',
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <motion.div
        className="flex items-center justify-between mb-6"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#f1f5f9' }}>Activity Log</h1>
          <p className="text-sm mt-0.5" style={{ color: '#475569' }}>Track all system actions</p>
        </div>
        {isSuperAdmin() && (
          <motion.button
            onClick={() => { setClearError(''); setClearSuccess(''); setShowClearModal(true) }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}
            whileHover={{ backgroundColor: 'rgba(239,68,68,0.18)' }}
            whileTap={{ scale: 0.97 }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Clear Logs
          </motion.button>
        )}
      </motion.div>

      {/* Filters */}
      <motion.div
        className="flex flex-wrap items-center gap-2.5 mb-5 p-4 rounded-2xl"
        style={{ backgroundColor: '#0f1117', border: '1px solid #1e2533' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        {isSuperAdmin() && (
          <select
            value={filters.user_id}
            onChange={e => handleFilterChange('user_id', e.target.value)}
            style={selectStyle}
            onFocus={e => { e.target.style.borderColor = '#F47B20' }}
            onBlur={e => { e.target.style.borderColor = '#1e2533' }}
          >
            <option value="" style={{ backgroundColor: '#0f1117' }}>All Users</option>
            {users.map(u => <option key={u.id} value={u.id} style={{ backgroundColor: '#0f1117' }}>{u.name}</option>)}
          </select>
        )}

        <select
          value={filters.action}
          onChange={e => handleFilterChange('action', e.target.value)}
          style={selectStyle}
          onFocus={e => { e.target.style.borderColor = '#F47B20' }}
          onBlur={e => { e.target.style.borderColor = '#1e2533' }}
        >
          {ACTION_TYPES.map(a => (
            <option key={a} value={a} style={{ backgroundColor: '#0f1117' }}>
              {a === 'all' ? 'All Actions' : a.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </option>
          ))}
        </select>

        <input
          type="date"
          value={filters.from}
          onChange={e => handleFilterChange('from', e.target.value)}
          style={{ ...selectStyle, colorScheme: 'dark' }}
          onFocus={e => { e.target.style.borderColor = '#F47B20' }}
          onBlur={e => { e.target.style.borderColor = '#1e2533' }}
        />
        <input
          type="date"
          value={filters.to}
          onChange={e => handleFilterChange('to', e.target.value)}
          style={{ ...selectStyle, colorScheme: 'dark' }}
          onFocus={e => { e.target.style.borderColor = '#F47B20' }}
          onBlur={e => { e.target.style.borderColor = '#1e2533' }}
        />

        {hasFilters && (
          <motion.button
            onClick={() => { setFilters({ user_id: '', action: '', from: '', to: '' }); setPage(1) }}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
            style={{ color: '#94a3b8', border: '1px solid #1e2533' }}
            whileHover={{ color: '#f1f5f9', borderColor: '#2d3748' }}
            whileTap={{ scale: 0.95 }}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Clear filters
          </motion.button>
        )}
      </motion.div>

      <AnimatePresence>
        {error && (
          <motion.div
            className="mb-4 p-3 rounded-xl"
            style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <p className="text-sm" style={{ color: '#fca5a5' }}>{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => <div key={i} className="skeleton h-12 rounded-xl" />)}
        </div>
      ) : activities.length === 0 ? (
        <motion.div
          className="text-center py-20"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
            style={{ backgroundColor: 'rgba(244,123,32,0.06)', border: '1px solid rgba(244,123,32,0.12)' }}
          >
            <svg className="w-7 h-7" style={{ color: '#334155' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold mb-1" style={{ color: '#475569' }}>No activity found</h3>
          <p className="text-xs" style={{ color: '#334155' }}>No records match your current filters</p>
        </motion.div>
      ) : (
        <>
          <motion.div
            className="rounded-2xl overflow-hidden"
            style={{ border: '1px solid #1e2533' }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: '#0f1117', borderBottom: '1px solid #1e2533' }}>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: '#475569' }}>Date</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: '#475569' }}>User</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: '#475569' }}>Project</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: '#475569' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence>
                  {activities.map((a, idx) => {
                    const cfg = getActionCfg(a.action)
                    return (
                      <motion.tr
                        key={a.id || idx}
                        custom={idx}
                        variants={rowVariants}
                        initial="hidden"
                        animate="visible"
                        className="border-b transition-colors"
                        style={{ borderColor: '#1e2533' }}
                        whileHover={{ backgroundColor: 'rgba(255,255,255,0.015)' }}
                      >
                        <td className="px-5 py-3.5 text-xs whitespace-nowrap" style={{ color: '#475569' }}>
                          {formatDate(a.created_at || a.timestamp)}
                        </td>
                        <td className="px-5 py-3.5 text-xs" style={{ color: '#94a3b8' }}>{a.user_name || a.user || '—'}</td>
                        <td className="px-5 py-3.5 text-xs" style={{ color: '#94a3b8' }}>{a.project_name || a.project || '—'}</td>
                        <td className="px-5 py-3.5">
                          <span
                            className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium capitalize"
                            style={{ backgroundColor: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color }}
                          >
                            {(a.action || '—').replace(/_/g, ' ')}
                          </span>
                        </td>
                      </motion.tr>
                    )
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </motion.div>

          {/* Pagination */}
          {totalPages > 1 && (
            <motion.div
              className="flex items-center justify-between mt-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              <p className="text-xs" style={{ color: '#475569' }}>Page {page} of {totalPages}</p>
              <div className="flex items-center gap-2">
                <motion.button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg disabled:opacity-40 transition-colors"
                  style={{ color: '#94a3b8', border: '1px solid #1e2533' }}
                  whileHover={{ backgroundColor: '#161b27', color: '#f1f5f9' }}
                  whileTap={{ scale: 0.95 }}
                >
                  ← Prev
                </motion.button>
                <motion.button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg disabled:opacity-40 transition-colors"
                  style={{ color: '#94a3b8', border: '1px solid #1e2533' }}
                  whileHover={{ backgroundColor: '#161b27', color: '#f1f5f9' }}
                  whileTap={{ scale: 0.95 }}
                >
                  Next →
                </motion.button>
              </div>
            </motion.div>
          )}
        </>
      )}
      {/* Clear Logs Modal */}
      <Modal isOpen={showClearModal} onClose={() => setShowClearModal(false)} title="Clear Activity Logs">
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-xl" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <svg className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#ef4444' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm font-semibold mb-0.5" style={{ color: '#f1f5f9' }}>
                {hasFilters ? 'Clear filtered logs' : 'Clear all logs'}
              </p>
              <p className="text-xs" style={{ color: '#94a3b8' }}>
                {hasFilters
                  ? 'Only logs matching your current filters will be deleted. This cannot be undone.'
                  : 'All activity logs will be permanently deleted. This cannot be undone.'}
              </p>
            </div>
          </div>

          {hasFilters && (
            <div className="px-3 py-2.5 rounded-xl text-xs space-y-1" style={{ background: '#111827', border: '1px solid #1e2533' }}>
              <p className="font-semibold mb-1.5" style={{ color: '#64748b' }}>Active filters:</p>
              {filters.user_id && <p style={{ color: '#94a3b8' }}>👤 User: {users.find(u => String(u.id) === String(filters.user_id))?.name || filters.user_id}</p>}
              {filters.action && filters.action !== 'all' && <p style={{ color: '#94a3b8' }}>⚡ Action: {filters.action.replace(/_/g, ' ')}</p>}
              {filters.from && <p style={{ color: '#94a3b8' }}>📅 From: {filters.from}</p>}
              {filters.to && <p style={{ color: '#94a3b8' }}>📅 To: {filters.to}</p>}
            </div>
          )}

          <AnimatePresence>
            {clearError && (
              <motion.p className="text-sm px-3 py-2 rounded-xl" style={{ color: '#fca5a5', backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>{clearError}</motion.p>
            )}
            {clearSuccess && (
              <motion.p className="text-sm px-3 py-2 rounded-xl flex items-center gap-2" style={{ color: '#86efac', backgroundColor: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                {clearSuccess}
              </motion.p>
            )}
          </AnimatePresence>

          <div className="flex gap-2 pt-1">
            <motion.button
              onClick={handleClearLogs}
              disabled={clearLoading || !!clearSuccess}
              className="flex items-center gap-2 flex-1 justify-center py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60"
              style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444' }}
              whileHover={{ backgroundColor: 'rgba(239,68,68,0.25)' }}
              whileTap={{ scale: 0.97 }}
            >
              {clearLoading && <span className="w-3.5 h-3.5 rounded-full border border-red-400/30 border-t-red-400 animate-spin" />}
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              {clearLoading ? 'Clearing...' : hasFilters ? 'Clear Filtered Logs' : 'Clear All Logs'}
            </motion.button>
            <motion.button
              onClick={() => setShowClearModal(false)}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #1e2533', color: '#94a3b8' }}
              whileHover={{ backgroundColor: 'rgba(255,255,255,0.07)' }}
              whileTap={{ scale: 0.97 }}
            >
              {clearSuccess ? 'Close' : 'Cancel'}
            </motion.button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
