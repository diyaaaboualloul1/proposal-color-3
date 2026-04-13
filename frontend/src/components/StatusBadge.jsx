const STATUS_CONFIG = {
  active: {
    bg: 'rgba(34, 197, 94, 0.12)',
    border: 'rgba(34, 197, 94, 0.25)',
    color: '#22c55e',
    dot: '#22c55e',
    label: 'Active'
  },
  completed: {
    bg: 'rgba(59, 130, 246, 0.12)',
    border: 'rgba(59, 130, 246, 0.25)',
    color: '#F59340',
    dot: '#F47B20',
    label: 'Completed'
  },
  archived: {
    bg: 'rgba(71, 85, 105, 0.15)',
    border: 'rgba(71, 85, 105, 0.3)',
    color: '#94a3b8',
    dot: '#475569',
    label: 'Archived'
  },
}

export default function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.archived

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
      style={{ backgroundColor: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: cfg.dot }}
      />
      {cfg.label}
    </span>
  )
}
