import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import apiClient from '../api/client'

const FREQ_OPTIONS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'never', label: 'Never' },
]

function UsageBar({ value, max, color = '#F47B20' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: '#1e2533' }}>
      <motion.div
        className="h-full rounded-full"
        style={{ background: `linear-gradient(90deg, ${color}, ${color}88)` }}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      />
    </div>
  )
}

const cardVariants = {
  hidden: { opacity: 0, y: 15 },
  visible: (i) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08 } })
}

export default function Storage() {
  const [storageInfo, setStorageInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keepVersions, setKeepVersions] = useState(5)
  const [logDays, setLogDays] = useState(30)
  const [previewData, setPreviewData] = useState(null)
  const [previewing, setPreviewing] = useState(false)
  const [cleaning, setCleaning] = useState(false)
  const [cleanSuccess, setCleanSuccess] = useState('')
  const [frequency, setFrequency] = useState('weekly')
  const [savingSchedule, setSavingSchedule] = useState(false)
  const [scheduleSuccess, setScheduleSuccess] = useState('')

  const fetchStorage = useCallback(async () => {
    try {
      const res = await apiClient.get('/storage/usage')
      setStorageInfo(res.data)
    } catch {
      setError('Failed to load storage info.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStorage()
  }, [fetchStorage])

  const handlePreview = async () => {
    setPreviewing(true)
    setPreviewData(null)
    setError('')
    try {
      const res = await apiClient.post('/storage/cleanup/preview', {
        keep_versions: Number(keepVersions),
        log_days: Number(logDays)
      })
      setPreviewData(res.data)
    } catch (err) {
      setError(err.response?.data?.message || 'Preview failed.')
    } finally {
      setPreviewing(false)
    }
  }

  const handleCleanup = async () => {
    if (!previewData) return
    if (!confirm('Run cleanup? This will permanently delete the selected items.')) return
    setCleaning(true)
    setCleanSuccess('')
    setError('')
    try {
      await apiClient.post('/storage/cleanup/run', {
        keep_versions: Number(keepVersions),
        log_days: Number(logDays)
      })
      setCleanSuccess('Cleanup completed successfully.')
      setPreviewData(null)
      fetchStorage()
    } catch (err) {
      setError(err.response?.data?.message || 'Cleanup failed.')
    } finally {
      setCleaning(false)
    }
  }

  const handleSaveSchedule = async () => {
    setSavingSchedule(true)
    setScheduleSuccess('')
    try {
      await apiClient.put('/storage/cleanup/schedule', { frequency })
      setScheduleSuccess(`Schedule set to ${frequency}`)
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save schedule.')
    } finally {
      setSavingSchedule(false)
    }
  }

  const formatMB = (bytes) => {
    if (!bytes && bytes !== 0) return '—'
    const mb = bytes / (1024 * 1024)
    return mb < 1 ? `${(bytes / 1024).toFixed(1)} KB` : `${mb.toFixed(1)} MB`
  }

  const totalBytes = storageInfo?.total_bytes || storageInfo?.total_size || 0
  const maxBytes = totalBytes > 0 ? totalBytes * 2 : 1

  const inputStyle = {
    width: '100%',
    padding: '8px 12px',
    backgroundColor: '#0f1117',
    border: '1px solid #1e2533',
    borderRadius: '10px',
    color: '#f1f5f9',
    fontSize: '0.875rem',
    outline: 'none',
  }
  const onFocus = e => { e.target.style.borderColor = '#F47B20'; e.target.style.boxShadow = '0 0 0 3px rgba(244,123,32,0.1)' }
  const onBlur = e => { e.target.style.borderColor = '#1e2533'; e.target.style.boxShadow = 'none' }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <motion.div
        className="mb-6"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-2xl font-bold" style={{ color: '#f1f5f9' }}>Storage Management</h1>
        <p className="text-sm mt-0.5" style={{ color: '#475569' }}>Manage disk usage and cleanup</p>
      </motion.div>

      <AnimatePresence>
        {error && (
          <motion.div
            className="mb-4 p-3 rounded-xl"
            style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
          >
            <p className="text-sm" style={{ color: '#fca5a5' }}>{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Storage Overview */}
      <motion.div
        className="rounded-2xl overflow-hidden mb-4"
        style={{ backgroundColor: '#0f1117', border: '1px solid #1e2533' }}
        custom={0} variants={cardVariants} initial="hidden" animate="visible"
      >
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid #1e2533' }}>
          <div>
            <h2 className="text-sm font-semibold" style={{ color: '#f1f5f9' }}>Storage Overview</h2>
            <p className="text-xs mt-0.5" style={{ color: '#475569' }}>Disk usage across all projects</p>
          </div>
          <motion.button
            onClick={fetchStorage}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: '#475569' }}
            whileHover={{ backgroundColor: '#161b27', color: '#94a3b8' }}
            whileTap={{ scale: 0.9 }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </motion.button>
        </div>

        <div className="p-5">
          {loading ? (
            <div className="space-y-3">
              <div className="skeleton h-8 w-32 rounded" />
              <div className="skeleton h-2 rounded-full" />
            </div>
          ) : storageInfo ? (
            <>
              {/* Total */}
              <div className="flex items-end gap-3 mb-4">
                <div>
                  <p
                    className="text-3xl font-bold"
                    style={{
                      background: 'linear-gradient(135deg, #f1f5f9, #F59340)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text'
                    }}
                  >
                    {formatMB(totalBytes)}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: '#475569' }}>Total storage used</p>
                </div>
              </div>

              <UsageBar value={totalBytes} max={maxBytes} color="#F47B20" />

              {/* Per-project */}
              {storageInfo.projects && storageInfo.projects.length > 0 && (
                <div className="mt-5 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#475569' }}>Per project</p>
                  {storageInfo.projects.map((p, i) => {
                    const pBytes = p.size_bytes || p.size || 0
                    return (
                      <motion.div
                        key={p.id || p.name}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-medium" style={{ color: '#94a3b8' }}>{p.name}</span>
                          <span className="text-xs" style={{ color: '#475569' }}>{formatMB(pBytes)}</span>
                        </div>
                        <UsageBar
                          value={pBytes}
                          max={totalBytes}
                          color={['#F47B20', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b'][i % 5]}
                        />
                      </motion.div>
                    )
                  })}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-center py-6" style={{ color: '#475569' }}>No storage data available.</p>
          )}
        </div>
      </motion.div>

      {/* Cleanup Tool */}
      <motion.div
        className="rounded-2xl overflow-hidden mb-4"
        style={{ backgroundColor: '#0f1117', border: '1px solid #1e2533' }}
        custom={1} variants={cardVariants} initial="hidden" animate="visible"
      >
        <div className="px-5 py-4" style={{ borderBottom: '1px solid #1e2533' }}>
          <h2 className="text-sm font-semibold" style={{ color: '#f1f5f9' }}>Cleanup Tool</h2>
          <p className="text-xs mt-0.5" style={{ color: '#475569' }}>Remove old SRS versions and logs</p>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: '#94a3b8' }}>Keep Versions (per project)</label>
              <input
                type="number" min={1} max={50} value={keepVersions}
                onChange={e => setKeepVersions(e.target.value)}
                style={inputStyle} onFocus={onFocus} onBlur={onBlur}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: '#94a3b8' }}>Keep Logs (days)</label>
              <input
                type="number" min={1} max={365} value={logDays}
                onChange={e => setLogDays(e.target.value)}
                style={inputStyle} onFocus={onFocus} onBlur={onBlur}
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <motion.button
              onClick={handlePreview}
              disabled={previewing}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl disabled:opacity-60 transition-colors"
              style={{ color: '#94a3b8', border: '1px solid #1e2533' }}
              whileHover={{ backgroundColor: '#161b27', color: '#f1f5f9', borderColor: '#2d3748' }}
              whileTap={{ scale: 0.97 }}
            >
              {previewing && <span className="w-3.5 h-3.5 rounded-full border border-current/30 border-t-current animate-spin" />}
              {previewing ? 'Analyzing...' : 'Preview Impact'}
            </motion.button>
            <AnimatePresence>
              {previewData && (
                <motion.button
                  onClick={handleCleanup}
                  disabled={cleaning}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-xl disabled:opacity-60"
                  style={{ backgroundColor: '#ef4444' }}
                  whileHover={{ backgroundColor: '#dc2626' }}
                  whileTap={{ scale: 0.97 }}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                >
                  {cleaning && <span className="w-3.5 h-3.5 rounded-full border border-white/30 border-t-white animate-spin" />}
                  {cleaning ? 'Running...' : 'Confirm Cleanup'}
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          <AnimatePresence>
            {previewData && (
              <motion.div
                className="p-4 rounded-xl"
                style={{ backgroundColor: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#f59e0b' }}>Preview Results</p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'SRS Versions', value: previewData.versions_to_delete ?? '—' },
                    { label: 'Log Entries', value: previewData.logs_to_delete ?? '—' },
                    { label: 'Space Freed', value: formatMB(previewData.bytes_to_free) },
                  ].map(item => (
                    <div key={item.label} className="text-center">
                      <p className="text-xl font-bold mb-0.5" style={{ color: '#f1f5f9' }}>{item.value}</p>
                      <p className="text-xs" style={{ color: '#475569' }}>{item.label}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
            {cleanSuccess && (
              <motion.div
                className="p-3 rounded-xl flex items-center gap-2"
                style={{ backgroundColor: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="#22c55e" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <p className="text-sm" style={{ color: '#86efac' }}>{cleanSuccess}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Schedule */}
      <motion.div
        className="rounded-2xl overflow-hidden"
        style={{ backgroundColor: '#0f1117', border: '1px solid #1e2533' }}
        custom={2} variants={cardVariants} initial="hidden" animate="visible"
      >
        <div className="px-5 py-4" style={{ borderBottom: '1px solid #1e2533' }}>
          <h2 className="text-sm font-semibold" style={{ color: '#f1f5f9' }}>Cleanup Schedule</h2>
          <p className="text-xs mt-0.5" style={{ color: '#475569' }}>Auto-run cleanup on a schedule</p>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: '#94a3b8' }}>Frequency</label>
            <select
              value={frequency}
              onChange={e => setFrequency(e.target.value)}
              style={inputStyle}
              onFocus={onFocus}
              onBlur={onBlur}
            >
              {FREQ_OPTIONS.map(f => <option key={f.value} value={f.value} style={{ backgroundColor: '#0f1117' }}>{f.label}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <motion.button
              onClick={handleSaveSchedule}
              disabled={savingSchedule}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-xl disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg, #F47B20, #D4680A)' }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
            >
              {savingSchedule && <span className="w-3.5 h-3.5 rounded-full border border-white/30 border-t-white animate-spin" />}
              Save Schedule
            </motion.button>
            <AnimatePresence>
              {scheduleSuccess && (
                <motion.p className="text-xs" style={{ color: '#22c55e' }}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  ✓ {scheduleSuccess}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
