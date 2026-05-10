import { useState, useEffect, useRef } from 'react'
import logger from '../../utils/proposalActivityLogger'

const LEVEL_COLORS = {
  INFO: '#3b82f6',
  SUCCESS: '#22c55e',
  WARN: '#f59e0b',
  ERROR: '#ef4444'
}

const CATEGORY_COLORS = {
  WIZARD: '#a78bfa',
  TEMPLATE: '#38bdf8',
  PROJECT: '#34d399',
  SRS: '#fb923c',
  BLOCKS: '#f472b6',
  SYNC: '#94a3b8',
  SAVE: '#22c55e',
  EXPORT: '#fbbf24',
  API: '#ef4444'
}

export default function ActivityLogPanel({ isOpen, onClose }) {
  const [entries, setEntries] = useState([])
  const [filter, setFilter] = useState('ALL')
  const bottomRef = useRef(null)
  const [autoScroll, setAutoScroll] = useState(true)

  useEffect(() => {
    // Poll logger entries every 500ms
    const interval = setInterval(() => {
      setEntries(logger.getEntries())
    }, 500)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [entries, autoScroll])

  if (!isOpen) return null

  const filtered = filter === 'ALL' ? entries : entries.filter(e => e.category === filter)

  const downloadLog = () => {
    const text = logger.getFormattedLog()
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `proposal-builder-log-${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const categories = ['ALL', 'WIZARD', 'TEMPLATE', 'PROJECT', 'SRS', 'BLOCKS', 'SYNC', 'SAVE', 'EXPORT', 'API']

  return (
    <div style={{
      position: 'fixed',
      bottom: 24,
      right: 24,
      width: 480,
      maxWidth: '90vw',
      height: 360,
      background: '#0f172a',
      border: '1px solid #334155',
      borderRadius: 12,
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      fontFamily: 'monospace',
      fontSize: 11
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 14px',
        borderBottom: '1px solid #334155',
        background: '#1e293b',
        borderRadius: '12px 12px 0 0'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14 }}>📋</span>
          <span style={{ color: '#f1f5f9', fontWeight: 'bold', fontSize: 12 }}>Activity Log</span>
          <span style={{ color: '#64748b', fontSize: 10 }}>({entries.length} entries)</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={downloadLog} style={{
            background: '#334155', color: '#94a3b8', border: 'none', borderRadius: 6,
            padding: '4px 10px', cursor: 'pointer', fontSize: 10, fontFamily: 'monospace'
          }}>⬇ Download</button>
          <button onClick={onClose} style={{
            background: 'none', color: '#64748b', border: 'none', cursor: 'pointer', fontSize: 16
          }}>✕</button>
        </div>
      </div>

      {/* Filter bar */}
      <div style={{
        display: 'flex',
        gap: 4,
        padding: '6px 10px',
        borderBottom: '1px solid #1e293b',
        overflowX: 'auto',
        flexShrink: 0
      }}>
        {categories.map(cat => (
          <button key={cat} onClick={() => setFilter(cat)} style={{
            background: filter === cat ? '#7c3aed' : '#1e293b',
            color: filter === cat ? '#fff' : '#64748b',
            border: filter === cat ? 'none' : '1px solid #334155',
            borderRadius: 4,
            padding: '2px 8px',
            cursor: 'pointer',
            fontSize: 9,
            fontFamily: 'monospace',
            whiteSpace: 'nowrap'
          }}>{cat}</button>
        ))}
      </div>

      {/* Log entries */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '8px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: 2
      }}>
        {filtered.length === 0 && (
          <div style={{ color: '#475569', textAlign: 'center', padding: 20, fontSize: 11 }}>
            No log entries yet. Interact with the proposal builder to see activity here.
          </div>
        )}
        {filtered.map((entry, i) => (
          <div key={i} style={{
            display: 'flex',
            gap: 6,
            alignItems: 'flex-start',
            padding: '3px 0',
            borderBottom: '1px solid #1e293b'
          }}>
            <span style={{ color: '#475569', fontSize: 9, minWidth: 60 }}>{entry._t?.split(' ')[1]}</span>
            <span style={{
              color: CATEGORY_COLORS[entry.category] || '#94a3b8',
              fontSize: 9,
              minWidth: 60,
              fontWeight: 'bold'
            }}>[{entry.category}]</span>
            <span style={{ color: LEVEL_COLORS[entry.level] || '#94a3b8', fontSize: 9, minWidth: 40 }}>{entry.level}</span>
            <span style={{ color: '#e2e8f0', fontSize: 10, flex: 1 }}>{entry.message}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Auto-scroll toggle */}
      <div style={{
        padding: '6px 10px',
        borderTop: '1px solid #334155',
        display: 'flex',
        alignItems: 'center',
        gap: 8
      }}>
        <input
          type="checkbox"
          checked={autoScroll}
          onChange={e => setAutoScroll(e.target.checked)}
          style={{ accentColor: '#7c3aed' }}
        />
        <span style={{ color: '#64748b', fontSize: 10 }}>Auto-scroll</span>
        <div style={{ flex: 1 }} />
        <button onClick={() => { entries.length = 0; setEntries([]) }} style={{
          background: 'none', color: '#ef4444', border: 'none', cursor: 'pointer', fontSize: 10
        }}>Clear</button>
      </div>
    </div>
  )
}