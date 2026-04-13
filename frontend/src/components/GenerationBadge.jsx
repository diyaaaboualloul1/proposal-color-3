const GEN_CONFIG = {
  idle: {
    bg: 'rgba(71, 85, 105, 0.15)',
    border: 'rgba(71, 85, 105, 0.25)',
    color: '#94a3b8',
    label: 'Not Generated',
    pulse: false
  },
  generating: {
    bg: 'rgba(234, 179, 8, 0.1)',
    border: 'rgba(234, 179, 8, 0.25)',
    color: '#f59e0b',
    label: 'Generating...',
    pulse: true
  },
  ready: {
    bg: 'rgba(34, 197, 94, 0.1)',
    border: 'rgba(34, 197, 94, 0.25)',
    color: '#22c55e',
    label: 'SRS Ready',
    pulse: false
  },
  failed: {
    bg: 'rgba(239, 68, 68, 0.1)',
    border: 'rgba(239, 68, 68, 0.25)',
    color: '#ef4444',
    label: 'Failed',
    pulse: false
  },
}

export default function GenerationBadge({ status }) {
  const cfg = GEN_CONFIG[status] || GEN_CONFIG.idle

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.pulse ? 'pulse-badge' : ''}`}
      style={{ backgroundColor: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color }}
    >
      {status === 'generating' ? (
        <span className="flex gap-0.5 items-center">
          <span className="typing-dot w-1 h-1 rounded-full" style={{ backgroundColor: cfg.color, display: 'inline-block' }} />
          <span className="typing-dot w-1 h-1 rounded-full" style={{ backgroundColor: cfg.color, display: 'inline-block' }} />
          <span className="typing-dot w-1 h-1 rounded-full" style={{ backgroundColor: cfg.color, display: 'inline-block' }} />
        </span>
      ) : (
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: cfg.color }} />
      )}
      {cfg.label}
    </span>
  )
}
