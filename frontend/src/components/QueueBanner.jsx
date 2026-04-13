import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import apiClient from '../api/client'

export default function QueueBanner() {
  const [queueInfo, setQueueInfo] = useState(null)
  const [minimized, setMinimized] = useState(false)
  const navigate = useNavigate()

  const fetch = useCallback(async () => {
    try {
      const res = await apiClient.get('/queue/status')
      setQueueInfo(res.data)
    } catch {
      setQueueInfo(null)
    }
  }, [])

  useEffect(() => {
    fetch()
    const id = setInterval(fetch, 5000)
    return () => clearInterval(id)
  }, [fetch])

  // Only show when something is generating
  const isActive = queueInfo?.isProcessing || queueInfo?.queueLength > 0
  if (!isActive || !queueInfo) return null

  const currentJob = queueInfo.currentJob
  const queueLen = queueInfo.queueLength || 0
  const isEditing = currentJob?.type === 'editing'

  return (
    <AnimatePresence>
      <motion.div
        key="queue-banner"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ type: 'spring', stiffness: 280, damping: 26 }}
        className="fixed top-3 left-1/2 z-50"
        style={{ transform: 'translateX(-50%)', pointerEvents: 'auto' }}
      >
        <motion.div
          layout
          style={{
            background: 'rgba(10,14,26,0.92)',
            border: '1px solid rgba(244,123,32,0.35)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            borderRadius: '14px',
            boxShadow: '0 4px 32px rgba(244,123,32,0.12), 0 2px 8px rgba(0,0,0,0.4)',
            overflow: 'hidden',
            minWidth: minimized ? 0 : 320,
          }}
        >
          {/* Minimized pill */}
          <AnimatePresence mode="wait">
            {minimized ? (
              <motion.button
                key="pill"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                onClick={() => setMinimized(false)}
                className="flex items-center gap-2 px-3 py-2"
                style={{ color: '#F59340' }}
                title="Show queue"
              >
                <Spinner color={isEditing ? '#8b5cf6' : '#F47B20'} size={14} />
                <span className="text-xs font-semibold" style={{ color: '#F59340' }}>
                  {queueLen > 0 ? `${queueLen} in queue` : 'Generating…'}
                </span>
              </motion.button>
            ) : (
              <motion.div
                key="expanded"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-3 px-4 py-2.5"
              >
                {/* Spinner */}
                <Spinner color={isEditing ? '#8b5cf6' : '#F47B20'} size={16} />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold" style={{ color: '#f1f5f9' }}>
                      {isEditing ? '✏️ Editing' : '🔄 Generating'}
                    </span>
                    {currentJob?.projectName && (
                      <span
                        className="text-xs truncate max-w-[140px] cursor-pointer hover:underline"
                        style={{ color: '#94a3b8' }}
                        onClick={() => currentJob.projectId && navigate(`/projects/${currentJob.projectId}`)}
                        title={currentJob.projectName}
                      >
                        {currentJob.projectName}
                      </span>
                    )}
                  </div>
                  {queueLen > 0 && (
                    <p className="text-[10px] mt-0.5" style={{ color: '#475569' }}>
                      +{queueLen} more waiting
                    </p>
                  )}
                </div>

                {/* Animated dots */}
                <div className="flex gap-0.5 flex-shrink-0">
                  {[0, 1, 2].map(i => (
                    <motion.div
                      key={i}
                      style={{
                        width: 4, height: 4, borderRadius: '50%',
                        backgroundColor: isEditing ? '#8b5cf6' : '#F47B20',
                      }}
                      animate={{ opacity: [0.2, 1, 0.2], scale: [0.8, 1.2, 0.8] }}
                      transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.2 }}
                    />
                  ))}
                </div>

                {/* View queue button */}
                <button
                  onClick={() => navigate('/queue')}
                  className="text-[10px] px-2 py-1 rounded-lg flex-shrink-0 transition-all hover:opacity-80"
                  style={{
                    background: 'rgba(244,123,32,0.12)',
                    color: '#F59340',
                    border: '1px solid rgba(244,123,32,0.25)',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}
                >
                  View
                </button>

                {/* Minimize button */}
                <button
                  onClick={() => setMinimized(true)}
                  className="flex items-center justify-center w-5 h-5 rounded-md flex-shrink-0 transition-all hover:opacity-70"
                  style={{ background: 'rgba(255,255,255,0.05)', color: '#475569' }}
                  title="Minimize"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 5h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Bottom glow line */}
          <motion.div
            style={{
              height: 2,
              background: isEditing
                ? 'linear-gradient(90deg, transparent, #8b5cf6, transparent)'
                : 'linear-gradient(90deg, transparent, #F47B20, transparent)',
            }}
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.6, repeat: Infinity }}
          />
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

function Spinner({ color = '#F47B20', size = 16 }) {
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      animate={{ rotate: 360 }}
      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
      style={{ flexShrink: 0 }}
    >
      <circle cx="8" cy="8" r="6" stroke={color + '30'} strokeWidth="2" />
      <path d="M8 2a6 6 0 0 1 6 6" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </motion.svg>
  )
}
