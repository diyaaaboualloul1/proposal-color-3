import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import apiClient from '../api/client'

function fmt(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function timeAgo(d) {
  if (!d) return ''
  const diff = Math.floor((Date.now() - new Date(d).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

// Animated ring spinner
function RingSpinner({ size = 20, color = '#F47B20', trackColor }) {
  return (
    <motion.svg
      width={size} height={size} viewBox="0 0 20 20" fill="none"
      animate={{ rotate: 360 }}
      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
      style={{ flexShrink: 0 }}
    >
      <circle cx="10" cy="10" r="7" stroke={trackColor || `${color}25`} strokeWidth="2.5" />
      <path d="M10 3a7 7 0 0 1 7 7" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
    </motion.svg>
  )
}

// Pulsing dot
function PulseDot({ color = '#F47B20' }) {
  return (
    <span className="relative flex h-2.5 w-2.5">
      <motion.span
        className="absolute inline-flex h-full w-full rounded-full opacity-75"
        style={{ backgroundColor: color }}
        animate={{ scale: [1, 2], opacity: [0.7, 0] }}
        transition={{ duration: 1.2, repeat: Infinity }}
      />
      <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ backgroundColor: color }} />
    </span>
  )
}

// Animated progress bar
function ProgressBar({ color = '#F47B20', indeterminate = true }) {
  return (
    <div className="h-0.5 w-full rounded-full overflow-hidden" style={{ background: `${color}20` }}>
      <motion.div
        className="h-full rounded-full"
        style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)`, width: '40%' }}
        animate={{ x: ['-100%', '300%'] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  )
}

const STATUS_CFG = {
  generating: { color: '#F47B20', bg: 'rgba(244,123,32,0.08)', border: 'rgba(244,123,32,0.2)', label: 'Generating' },
  ready:      { color: '#22c55e', bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.2)',  label: 'Ready' },
  failed:     { color: '#ef4444', bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.2)',  label: 'Failed' },
  idle:       { color: '#334155', bg: 'rgba(51,65,85,0.08)',   border: 'rgba(51,65,85,0.2)',   label: 'Idle' },
}

export default function Queue() {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [queueInfo, setQueueInfo] = useState({ queueLength: 0, isProcessing: false, currentJob: null, queue: [] })
  const [refreshKey, setRefreshKey] = useState(0)
  const [lastRefreshed, setLastRefreshed] = useState(Date.now())
  const [manualRefreshing, setManualRefreshing] = useState(false)
  const navigate = useNavigate()

  const fetchAll = useCallback(async () => {
    try {
      const [projRes, queueRes] = await Promise.allSettled([
        apiClient.get('/projects'),
        apiClient.get('/queue/status'),
      ])
      if (projRes.status === 'fulfilled') {
        const all = projRes.value.data.projects || projRes.value.data || []
        setProjects(all)
      }
      if (queueRes.status === 'fulfilled') {
        setQueueInfo(queueRes.value.data)
      }
      setLastRefreshed(Date.now())
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])
  useEffect(() => {
    const id = setInterval(fetchAll, 6000)
    return () => clearInterval(id)
  }, [fetchAll])

  const handleManualRefresh = async () => {
    setManualRefreshing(true)
    setRefreshKey(k => k + 1)
    await fetchAll()
    setTimeout(() => setManualRefreshing(false), 600)
  }

  const generating = projects.filter(p => p.generation_status === 'generating')
  const failed     = projects.filter(p => p.generation_status === 'failed')
  const ready      = projects.filter(p => p.generation_status === 'ready')
  const idle       = projects.filter(p => !p.generation_status || p.generation_status === 'idle')

  const isActive   = queueInfo.isProcessing || generating.length > 0

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <style>{`
        @keyframes shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
        .skeleton-shine {
          background: linear-gradient(90deg, #111827 25%, #1e2533 50%, #111827 75%);
          background-size: 200% 100%;
          animation: shimmer 1.4s infinite;
          border-radius: 12px;
        }
      `}</style>

      {/* Header */}
      <motion.div
        className="flex items-start justify-between mb-8"
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold" style={{ color: '#f1f5f9' }}>Generation Queue</h1>
            <AnimatePresence>
              {isActive && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.7 }}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold"
                  style={{ background: 'rgba(244,123,32,0.12)', border: '1px solid rgba(244,123,32,0.25)', color: '#F59340' }}
                >
                  <PulseDot color="#F47B20" />
                  Live
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <p className="text-sm" style={{ color: '#475569' }}>
            Monitor SRS generation across all projects
            {lastRefreshed && (
              <span className="ml-2 text-xs" style={{ color: '#334155' }}>
                · refreshed {timeAgo(lastRefreshed)}
              </span>
            )}
          </p>
        </div>

        <motion.button
          onClick={handleManualRefresh}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold"
          style={{ background: '#0d1117', border: '1px solid #1e2533', color: '#64748b' }}
          whileHover={{ borderColor: '#334155', color: '#94a3b8' }}
          whileTap={{ scale: 0.94 }}
        >
          <motion.svg
            className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"
            animate={manualRefreshing ? { rotate: 360 } : { rotate: 0 }}
            transition={manualRefreshing ? { duration: 0.6, ease: 'easeInOut' } : {}}
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </motion.svg>
          Refresh
        </motion.button>
      </motion.div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Generating', value: generating.length, color: '#F47B20', bg: 'rgba(244,123,32,0.06)', border: 'rgba(244,123,32,0.15)', icon: '⚡' },
          { label: 'Ready',      value: ready.length,      color: '#22c55e', bg: 'rgba(34,197,94,0.06)',   border: 'rgba(34,197,94,0.15)',   icon: '✓' },
          { label: 'Failed',     value: failed.length,     color: '#ef4444', bg: 'rgba(239,68,68,0.06)',   border: 'rgba(239,68,68,0.15)',   icon: '✗' },
          { label: 'Not Started',value: idle.length,       color: '#475569', bg: 'rgba(71,85,105,0.06)',   border: 'rgba(71,85,105,0.15)',   icon: '○' },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: i * 0.06, type: 'spring', stiffness: 260, damping: 20 }}
            className="rounded-2xl p-4"
            style={{ background: s.bg, border: `1px solid ${s.border}` }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-lg font-black" style={{ color: s.color }}>{s.value}</span>
              <span className="text-xs font-bold" style={{ color: s.color, opacity: 0.6 }}>{s.icon}</span>
            </div>
            <p className="text-xs font-medium" style={{ color: '#475569' }}>{s.label}</p>
            {s.label === 'Generating' && s.value > 0 && (
              <div className="mt-2">
                <ProgressBar color={s.color} />
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {/* Engine status card */}
      <motion.div
        className="mb-6 rounded-2xl overflow-hidden"
        style={{ background: '#0d1117', border: `1px solid ${isActive ? 'rgba(244,123,32,0.2)' : '#1e2533'}` }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        {/* Top bar */}
        <div className="flex items-center gap-4 px-5 py-4">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: isActive ? 'rgba(244,123,32,0.1)' : 'rgba(34,197,94,0.08)', border: `1px solid ${isActive ? 'rgba(244,123,32,0.2)' : 'rgba(34,197,94,0.2)'}` }}
          >
            {isActive
              ? <RingSpinner size={18} color="#F47B20" />
              : <svg className="w-4 h-4" fill="none" stroke="#22c55e" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            }
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold" style={{ color: '#f1f5f9' }}>
                Queue Engine
              </p>
              <span
                className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider"
                style={{
                  background: isActive ? 'rgba(244,123,32,0.12)' : 'rgba(34,197,94,0.1)',
                  color: isActive ? '#F59340' : '#22c55e',
                  border: `1px solid ${isActive ? 'rgba(244,123,32,0.25)' : 'rgba(34,197,94,0.25)'}`,
                }}
              >
                {isActive ? 'Active' : 'Idle'}
              </span>
            </div>
            <p className="text-xs mt-0.5" style={{ color: '#475569' }}>
              {isActive
                ? `Processing 1 job at a time · ${queueInfo.queueLength} item${queueInfo.queueLength !== 1 ? 's' : ''} waiting`
                : 'No jobs running — all projects up to date'}
            </p>
          </div>

          {/* Current job pill */}
          {queueInfo.currentJob && (
            <motion.div
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl flex-shrink-0 cursor-pointer"
              style={{ background: 'rgba(244,123,32,0.08)', border: '1px solid rgba(244,123,32,0.2)' }}
              onClick={() => queueInfo.currentJob.projectId && navigate(`/projects/${queueInfo.currentJob.projectId}`)}
              whileHover={{ backgroundColor: 'rgba(244,123,32,0.14)' }}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
            >
              <RingSpinner size={12} color={queueInfo.currentJob.type === 'editing' ? '#8b5cf6' : '#F47B20'} />
              <span className="text-xs font-semibold max-w-[140px] truncate" style={{ color: '#f1f5f9' }}>
                {queueInfo.currentJob.projectName}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold" style={{
                background: queueInfo.currentJob.type === 'editing' ? 'rgba(139,92,246,0.15)' : 'rgba(244,123,32,0.12)',
                color: queueInfo.currentJob.type === 'editing' ? '#a78bfa' : '#F59340',
              }}>
                {queueInfo.currentJob.type === 'editing' ? 'editing' : 'gen'}
              </span>
            </motion.div>
          )}
        </div>

        {/* Active progress strip */}
        {isActive && (
          <div className="px-5 pb-4">
            <ProgressBar color="#F47B20" />
          </div>
        )}
      </motion.div>

      {/* Projects list */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="skeleton-shine h-14" style={{ opacity: 1 - i * 0.15 }} />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <motion.div
          className="text-center py-20"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'rgba(244,123,32,0.06)', border: '1px solid rgba(244,123,32,0.12)' }}>
            <svg className="w-8 h-8" style={{ color: '#334155' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <p className="text-sm font-semibold" style={{ color: '#475569' }}>No projects yet</p>
          <p className="text-xs mt-1" style={{ color: '#334155' }}>Create a project to see it here</p>
        </motion.div>
      ) : (
        <div className="space-y-6">
          {/* Generating */}
          {generating.length > 0 && (
            <Section
              title="Currently Processing"
              color="#F47B20"
              count={generating.length}
              icon={<RingSpinner size={13} color="#F47B20" />}
            >
              {generating.map((p, i) => {
                const isCurrentJob = queueInfo.currentJob?.projectId === p.id
                const qItem = queueInfo.queue?.find(q => q.projectId === p.id)
                const jobType = isCurrentJob ? queueInfo.currentJob?.type : (qItem?.type || 'generating')
                return (
                  <ProjectCard key={p.id} project={p} idx={i} navigate={navigate}
                    queueInfo={queueInfo} jobType={jobType} isCurrentJob={isCurrentJob} />
                )
              })}
            </Section>
          )}

          {/* Failed */}
          {failed.length > 0 && (
            <Section title="Failed" color="#ef4444" count={failed.length} icon={<span style={{ color: '#ef4444', fontSize: 13, fontWeight: 800 }}>✗</span>}>
              {failed.map((p, i) => <ProjectCard key={p.id} project={p} idx={i} navigate={navigate} />)}
            </Section>
          )}

          {/* Ready */}
          {ready.length > 0 && (
            <Section title="Ready" color="#22c55e" count={ready.length} limit
              icon={<span style={{ color: '#22c55e', fontSize: 13, fontWeight: 800 }}>✓</span>}>
              {ready.map((p, i) => <ProjectCard key={p.id} project={p} idx={i} navigate={navigate} />)}
            </Section>
          )}

          {/* Idle */}
          {idle.length > 0 && (
            <Section title="Not Started" color="#334155" count={idle.length} limit
              icon={<span style={{ color: '#334155', fontSize: 13, fontWeight: 800 }}>○</span>}>
              {idle.map((p, i) => <ProjectCard key={p.id} project={p} idx={i} navigate={navigate} />)}
            </Section>
          )}
        </div>
      )}
    </div>
  )
}

const SECTION_PAGE = 5

function Section({ title, color, icon, children, count, limit = false }) {
  const [showAll, setShowAll] = useState(false)
  const childArray = Array.isArray(children) ? children : [children]
  const visible = limit && !showAll ? childArray.slice(0, SECTION_PAGE) : childArray
  const hidden = childArray.length - SECTION_PAGE

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 22 }}
    >
      {/* Section header */}
      <div className="flex items-center gap-2 mb-2.5 px-1">
        {icon}
        <span className="text-xs font-bold uppercase tracking-widest" style={{ color }}>{title}</span>
        {count !== undefined && (
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
            style={{ background: `${color}15`, color, border: `1px solid ${color}25` }}
          >
            {count}
          </span>
        )}
        <div className="flex-1 h-px" style={{ background: `${color}18` }} />
      </div>

      {/* Items */}
      <div className="space-y-2">
        <AnimatePresence initial={false}>
          {visible}
        </AnimatePresence>
      </div>

      {/* Show more / less */}
      {limit && hidden > 0 && (
        <motion.button
          onClick={() => setShowAll(s => !s)}
          className="mt-2 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold transition-all"
          style={{
            background: `${color}06`,
            border: `1px dashed ${color}25`,
            color: color,
          }}
          whileHover={{ backgroundColor: `${color}10`, borderColor: `${color}40` }}
          whileTap={{ scale: 0.98 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          {showAll ? (
            <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
              Show less
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              Show {hidden} more
            </>
          )}
        </motion.button>
      )}
    </motion.div>
  )
}

function ProjectCard({ project, idx, navigate, queueInfo, jobType, isCurrentJob }) {
  const cfg = STATUS_CFG[project.generation_status] || STATUS_CFG.idle
  const isEditing = jobType === 'editing'
  const activeColor = isEditing ? '#8b5cf6' : '#F47B20'
  const isGenerating = project.generation_status === 'generating'
  const isReady = project.generation_status === 'ready'
  const isFailed = project.generation_status === 'failed'

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: idx * 0.04, type: 'spring', stiffness: 280, damping: 24 }}
      onClick={() => navigate(`/projects/${project.id}`)}
      className="group relative rounded-2xl cursor-pointer overflow-hidden"
      style={{
        background: '#0d1117',
        border: `1px solid ${isGenerating ? `${activeColor}28` : '#1e2533'}`,
      }}
      whileHover={{
        borderColor: isGenerating ? `${activeColor}50` : '#2d3748',
        backgroundColor: '#111827',
      }}
      whileTap={{ scale: 0.995 }}
    >
      {/* Left accent bar */}
      {isGenerating && (
        <motion.div
          className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l-2xl"
          style={{ background: `linear-gradient(to bottom, transparent, ${activeColor}, transparent)` }}
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.8, repeat: Infinity }}
        />
      )}

      <div className="flex items-center gap-4 px-4 py-3.5">
        {/* Status icon */}
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
        >
          {isGenerating ? (
            <div className="flex gap-0.5 items-center">
              {[0,1,2].map(i => (
                <motion.div key={i}
                  style={{ width: 4, height: 4, borderRadius: '50%', backgroundColor: activeColor }}
                  animate={{ scale: [0.8, 1.3, 0.8], opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.18 }}
                />
              ))}
            </div>
          ) : isReady ? (
            <svg className="w-4 h-4" fill="none" stroke={cfg.color} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          ) : isFailed ? (
            <svg className="w-4 h-4" fill="none" stroke={cfg.color} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" stroke={cfg.color} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold truncate" style={{ color: '#f1f5f9' }}>{project.name}</p>
            {isReady && project.latest_version && (
              <motion.span
                className="text-[10px] px-1.5 py-0.5 rounded font-bold flex-shrink-0"
                style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 18 }}
              >
                v{project.latest_version}
              </motion.span>
            )}
            {isGenerating && isCurrentJob && (
              <motion.span
                className="text-[10px] px-1.5 py-0.5 rounded font-bold flex-shrink-0"
                style={{
                  background: isEditing ? 'rgba(139,92,246,0.15)' : 'rgba(244,123,32,0.12)',
                  color: isEditing ? '#a78bfa' : '#F59340',
                  border: `1px solid ${isEditing ? 'rgba(139,92,246,0.3)' : 'rgba(244,123,32,0.25)'}`,
                }}
                animate={{ opacity: [0.7, 1, 0.7] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                {isEditing ? '✏️ editing' : '▶ running'}
              </motion.span>
            )}
            {isGenerating && !isCurrentJob && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0"
                style={{ background: 'rgba(71,85,105,0.15)', color: '#64748b', border: '1px solid rgba(71,85,105,0.2)' }}>
                ⏳ waiting
              </span>
            )}
          </div>
          <p className="text-xs mt-0.5 truncate" style={{ color: '#334155' }}>
            {project.client_name}
            {project.updated_at && (
              <span className="ml-1.5" style={{ color: '#1e2533' }}>· {fmt(project.updated_at)}</span>
            )}
          </p>
          {/* Progress bar for active job */}
          {isGenerating && isCurrentJob && (
            <div className="mt-2">
              <ProgressBar color={isEditing ? '#8b5cf6' : '#F47B20'} />
            </div>
          )}
        </div>

        {/* Status badge */}
        <span
          className="text-[11px] px-2.5 py-1 rounded-full font-semibold flex-shrink-0"
          style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color }}
        >
          {cfg.label}
        </span>

        {/* Arrow */}
        <motion.svg
          className="w-4 h-4 flex-shrink-0"
          fill="none" stroke="#334155" viewBox="0 0 24 24"
          animate={{ x: 0 }}
          whileHover={{ x: 2 }}
          style={{ transition: 'color 0.2s' }}
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </motion.svg>
      </div>
    </motion.div>
  )
}
