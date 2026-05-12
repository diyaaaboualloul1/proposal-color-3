import { useState, useEffect, useCallback, useRef } from 'react'
import { BLOCK_TYPES } from './BlockPalette'
import TiptapEditor from './TiptapEditor'
import MiniTiptapEditor from './MiniTiptapEditor'

const COLOR_PRESETS = [
  { label: 'Red',    value: '#ef4444' },
  { label: 'Green',  value: '#22c55e' },
  { label: 'Orange', value: '#f97316' },
  { label: 'Grey',   value: '#94a3b8' },
  { label: 'Yellow', value: '#eab308' },
]

function RichTextInput({ value, onChange, style = {}, placeholder = '...' }) {
  const ref = useRef(null)
  const [showToolbar, setShowToolbar] = useState(false)
  const [toolbarPos, setToolbarPos] = useState({ top: 0, left: 0 })
  const toolbarRef = useRef(null)
  const isMouseDownOnToolbar = useRef(false)

  const initialHtml = (typeof value === 'string' && value.includes('<span')) ? value : (value || '')

  const skipNextReset = useRef(false)

  useEffect(() => {
    if (!ref.current) return
    if (skipNextReset.current) {
      skipNextReset.current = false
      return
    }
    const incoming = value || ''
    if (incoming !== ref.current.innerHTML) {
      ref.current.innerHTML = incoming
    }
  }, [value])

  useEffect(() => {
    function onMouseUp() {
      if (isMouseDownOnToolbar.current) return
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) { setShowToolbar(false); return }
      const range = sel.getRangeAt(0)
      if (!ref.current?.contains(range.commonAncestorContainer)) { setShowToolbar(false); return }
      const rect = range.getBoundingClientRect()
      const parentRect = ref.current.getBoundingClientRect()
      setToolbarPos({ top: rect.top - parentRect.top - 36, left: Math.max(0, rect.left - parentRect.left) })
      setShowToolbar(true)
    }
    document.addEventListener('mouseup', onMouseUp)
    return () => document.removeEventListener('mouseup', onMouseUp)
  }, [])

  const selRef = useRef(null)

  function applyColor(color) {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    if (range.collapsed) return
    const span = document.createElement('span')
    span.style.color = color
    span.appendChild(range.extractContents())
    range.insertNode(span)
    range.setStartAfter(span)
    range.setEndAfter(span)
    sel.removeAllRanges()
    sel.addRange(range)
    setShowToolbar(false)
    skipNextReset.current = true
    setTimeout(() => {
      if (ref.current) onChange(ref.current.innerHTML)
      skipNextReset.current = false
    }, 0)
  }

  function clearColor() {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    if (range.collapsed) return
    const node = range.commonAncestorContainer
    const colorSpan = node.nodeType === Node.TEXT_NODE ? node.parentElement : node
    if (colorSpan && colorSpan.style?.color) {
      const text = document.createTextNode(colorSpan.textContent)
      colorSpan.parentNode.replaceChild(text, colorSpan)
    }
    setShowToolbar(false)
    skipNextReset.current = true
    setTimeout(() => {
      if (ref.current) onChange(ref.current.innerHTML)
      skipNextReset.current = false
    }, 0)
  }

  function handleBlur(e) {
    if (toolbarRef.current && toolbarRef.current.contains(e.relatedTarget)) return
    if (ref.current) onChange(ref.current.innerHTML)
    setShowToolbar(false)
  }

  const baseStyle = { flex: 1, background: '#0f172a', color: style.color || '#f1f5f9', border: '1px solid #334155', borderRadius: 4, padding: '4px 8px', fontSize: 13, minHeight: 28, cursor: 'text', lineHeight: '1.4', wordBreak: 'break-word', outline: 'none', ...style }

  return (
    <div style={{ position: 'relative', display: 'flex', flex: 1 }}>
      <div ref={ref} contentEditable suppressContentEditableWarning dangerouslySetInnerHTML={{ __html: initialHtml }} style={baseStyle} onBlur={handleBlur} />
      {showToolbar && (
        <div
          ref={toolbarRef}
          onMouseDown={() => { isMouseDownOnToolbar.current = true }}
          onMouseUp={() => { isMouseDownOnToolbar.current = false }}
          style={{ position: 'absolute', top: toolbarPos.top, left: toolbarPos.left, zIndex: 100, display: 'flex', gap: 3, background: '#1e293b', border: '1px solid #334155', borderRadius: 6, padding: '4px 6px', boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}
        >
          {COLOR_PRESETS.map(c => (
            <button
              key={c.value}
              onMouseDown={e => { e.preventDefault() }}
              onClick={() => applyColor(c.value)}
              style={{ width: 26, height: 22, borderRadius: 4, background: c.value, color: '#fff', border: '2px solid transparent', fontSize: 11, fontWeight: 'bold', cursor: 'pointer', padding: 0 }}
              title={c.label}
            >A</button>
          ))}
          <button
            onMouseDown={e => { e.preventDefault() }}
            onClick={() => clearColor()}
            style={{ height: 22, borderRadius: 4, background: '#334155', color: '#94a3b8', border: 'none', fontSize: 10, cursor: 'pointer', padding: '0 4px' }}
            title="Clear color"
          >╳</button>
        </div>
      )}
    </div>
  )
}

const DEFAULT_CONTENT = {
  cover: { title: '', subtitle: 'Proposal', client: '', date: '', preparedBy: 'Fifty Studios Holding Company' },
  text: { html: '' },
  heading: { text: '', level: 2 },
  table: { headers: ['Item', 'Description'], rows: [['', '']] },
  image: { url: '', alt: '', caption: '' },
  divider: { style: 'solid', color: '#E8500A', thickness: 1 },
  list: { items: [{ label: '', checked: false }], ordered: false },
  scope: { items: [], source: 'srs', projectId: null },
  timeline: { phases: [], projectId: null },
  pricing: { items: [{ label: '', price: 0 }], currency: 'KWD' },
  overview: { text: '', projectId: null },
  techstack: { items: [], projectId: null },
  callout: { text: '', bgColor: '#E8500A', textColor: '#ffffff' },
  columns: { columns: 2, blocks: [[], []], content: ['', ''] },
  pagebreak: {},
  footer: { text: '© Fifty Studios Holding Company', pageNumbers: true },
}

let blockCounter = 0
function newId() { return `block_${Date.now()}_${++blockCounter}` }

// Sanitize any value: strip DOM elements, React fiber refs, functions
function sanitize(val, seen = new WeakSet()) {
  if (val === null || val === undefined) return val
  if (typeof val === 'function' || typeof val === 'symbol') return undefined
  if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') return val
  if (val instanceof Date) return val.toISOString()
  if (val instanceof Error) return val.message
  if (typeof val === 'bigint') return String(val)
  if (typeof val === 'object' && !Array.isArray(val)) {
    if (seen.has(val)) return undefined
    if (val.__reactFiber$ || val.__reactInternalFiber$ || val instanceof HTMLElement || val instanceof Node) return undefined
    seen.add(val)
    const result = {}
    for (const [k, v] of Object.entries(val)) {
      if (k.startsWith('__react')) continue
      const s = sanitize(v, seen)
      if (s !== undefined) result[k] = s
    }
    return result
  }
  if (Array.isArray(val)) {
    if (seen.has(val)) return undefined
    seen.add(val)
    return val.map(item => sanitize(item, seen)).filter(x => x !== undefined)
  }
  return val
}

export default function ProposalBuilder({ proposalId, initialData, apiBase, onOpenSrsPanel, onRequestSrsFill, onBlockFillRequest, onLocalBlocksUpdate, onFillComplete }) {
  console.log('[ProposalBuilder] RENDER — initialData.id:', initialData?.id, 'initialData.blocks:', initialData?.blocks?.length)
  const [blocks, setBlocks] = useState(() => {
    const initial = initialData?.blocks || []
    console.log('[ProposalBuilder] Initial blocks state:', initial.length)
    return initial.map(b => ({ ...b, content: sanitize(b.content) }))
  })
  const [selectedBlock, setSelectedBlock] = useState(null)
  const [saved, setSaved] = useState(true)
  const imageInputRef = useRef(null)
  const autoSaveRef = useRef(null)
  const initialDataRef = useRef(initialData)

  // Sync when initialData changes — reset blocks when proposal changes (new id) or when switching to
  // a different proposal (same id but fewer blocks means it's a fresh proposal we need to pick up).
  // We avoid syncing when blocks increase (local edits like Add All Blocks don't need to reset).
  useEffect(() => {
    const prevId = initialDataRef.current?.id
    const nextId = initialData?.id
    const prevLen = initialDataRef.current?.blocks?.length ?? 0
    const nextLen = initialData?.blocks?.length ?? 0
    const blocksChanged = prevLen !== nextLen
    const idChanged = prevId !== nextId
    // Always keep ref in sync — store latest initialData
    initialDataRef.current = initialData
    // Only sync when: id changed OR (blocks shrank — switched to different proposal)
    if (idChanged || (blocksChanged && nextLen < prevLen)) {
      console.log('[ProposalBuilder] Sync effect — prevId:', prevId, 'nextId:', nextId, 'prevLen:', prevLen, 'nextLen:', nextLen, '| firing:', idChanged || (blocksChanged && nextLen < prevLen))
      if (initialData?.blocks) {
        const fresh = JSON.parse(JSON.stringify(initialData.blocks))
        console.log('[ProposalBuilder] Sync: reset blocks to', fresh.length)
        setBlocks(fresh)
      }
    }
  }, [initialData])

  // When parent fills an SRS block with fetched data, apply it directly to local blocks state
  const applyFillComplete = useCallback((updatedBlocks) => {
    console.log('[ProposalBuilder] applyFillComplete blocks:', updatedBlocks.length, 'items:', updatedBlocks.find(b=>b.content?.items)?.content?.items?.length)
    setBlocks(updatedBlocks)
  }, [])

  // Auto-save when blocks change
  useEffect(() => {
    setSaved(false)
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current)
    autoSaveRef.current = setTimeout(async () => {
      try {
        const token = localStorage.getItem('srs_token')
        const cleanBlocks = blocks.map(b => ({ id: b.id, type: b.type, content: sanitize(b.content) }))
        await fetch(`${apiBase}/${proposalId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({
            name: initialData?.name || 'Untitled',
            blocks: cleanBlocks,
            project_id: initialData?.project_id || null,
            srs_version: initialData?.srs_version || null
          })
        })
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      } catch (e) {
        console.error('Auto-save failed:', e)
      }
    }, 8000)
    return () => { if (autoSaveRef.current) clearTimeout(autoSaveRef.current) }
  }, [blocks, proposalId, apiBase])

  const addBlock = useCallback((type) => {
    const block = { id: newId(), type, content: JSON.parse(JSON.stringify(DEFAULT_CONTENT[type] || {})) }
    setBlocks(prev => {
      const next = [...prev, block]
      // For SRS block types, notify parent so it can fill with SRS data.
      // Pass applyFillComplete so the page can call it with the computed filled blocks.
      if (['scope', 'techstack', 'overview', 'timeline'].includes(type)) {
        onBlockFillRequest?.(type, block.id, next, applyFillComplete)
      }
      return next
    })
    setSelectedBlock(block.id)
  }, [onBlockFillRequest, applyFillComplete])

  const updateBlock = useCallback((id, content) => {
    console.log('[updateBlock] id=', id, 'content items=', content?.items?.length, 'projectId=', content?.projectId)
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, content } : b))
  }, [])

  const removeBlock = useCallback((id) => {
    setBlocks(prev => prev.filter(b => b.id !== id))
    setSelectedBlock(prev => prev === id ? null : prev)
  }, [])

  const moveBlock = useCallback((id, dir) => {
    setBlocks(prev => {
      const idx = prev.findIndex(b => b.id === id)
      if (idx < 0 || (dir < 0 && idx === 0) || (dir > 0 && idx === prev.length - 1)) return prev
      const next = [...prev]
      const [moved] = next.splice(idx, 1)
      next.splice(idx + dir, 0, moved)
      return next
    })
  }, [])

  function duplicateBlock(id) {
    const src = blocks.find(b => b.id === id)
    if (!src) return
    const copy = { ...src, id: newId(), content: JSON.parse(JSON.stringify(src.content)) }
    const idx = blocks.findIndex(b => b.id === id)
    setBlocks(prev => [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)])
  }

  function handleImageUpload(blockId, file) {
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = (e) => {
      updateBlock(blockId, { ...blocks.find(b => b.id === blockId)?.content, url: e.target.result, alt: file.name })
    }
    reader.readAsDataURL(file)
  }

  function getBlockIcon(type) {
    const icons = { cover: '🎨', text: '📝', heading: '🔤', table: '📊', image: '🖼', divider: '➖', list: '📋', scope: '📦', timeline: '⏱', pricing: '💰', overview: '📄', techstack: '🛠', callout: '💬', columns: '📐', pagebreak: '📄', footer: '✍️' }
    return icons[type] || '📋'
  }

  function renderBlock(block) {
    const isSelected = selectedBlock === block.id
    const sel = isSelected ? '2px solid #7c3aed' : '1px solid #334155'
    const wrapStyle = { padding: 16, background: '#1e293b', borderRadius: 8, border: sel }
    const labelStyle = { color: '#94a3b8', fontSize: 11, marginBottom: 8, display: 'block' }

    switch (block.type) {
      case 'cover': {
        const c = block.content
        const today = c.date || new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
        return (
          <div style={{ borderRadius: 8, overflow: 'hidden', border: isSelected ? '2px solid #E8500A' : '1px solid #334155' }}>
            {/* TOP 70% — Orange background + logo */}
            <div style={{ background: '#E8500A', padding: '40px 40px 32px', textAlign: 'center', position: 'relative' }}>
              <img src="/50studios-logo.png" alt="Fifty Studios" style={{ maxWidth: 240, height: 'auto', marginBottom: 20, display: 'block', margin: '0 auto 20px' }} />
              <input value={c.title || ''} onChange={e => updateBlock(block.id, { ...c, title: e.target.value })} placeholder="Proposal Title" style={{ display: 'block', width: '100%', fontSize: 20, fontWeight: 'bold', background: 'transparent', border: 'none', color: '#fff', textAlign: 'center', outline: 'none', marginBottom: 10 }} />
              <input value={c.subtitle || ''} onChange={e => updateBlock(block.id, { ...c, subtitle: e.target.value })} placeholder="Proposal" style={{ display: 'block', width: '100%', fontSize: 12, background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.75)', textAlign: 'center', outline: 'none' }} />
            </div>
            {/* Orange divider */}
            <div style={{ height: 3, background: '#E8500A' }} />
            {/* BOTTOM 30% — White info area */}
            <div style={{ background: '#ffffff', padding: '20px 40px 24px' }}>
              {/* 3-col info row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 14 }}>
                {['Address', 'Contacts', 'Online'].map(lbl => (
                  <div key={lbl}>
                    <div style={{ fontSize: 9, fontWeight: 'bold', color: '#E8500A', letterSpacing: 1, marginBottom: 4 }}>{lbl.toUpperCase()}</div>
                    {lbl === 'Address' && <div style={{ fontSize: 9, color: '#1A1A2E', lineHeight: 14 }}>Ahmed Al-Jaber St. Prime Tower<br/>Capital, Sharq</div>}
                    {lbl === 'Contacts' && <div style={{ fontSize: 9, color: '#1A1A2E', lineHeight: 14 }}>Phone: +965 9879 9919<br/>Email: info@5ostudios.com</div>}
                    {lbl === 'Online' && <div style={{ fontSize: 9, color: '#1A1A2E', lineHeight: 14 }}>Website: www.5ostudios.com</div>}
                  </div>
                ))}
              </div>
              {/* Divider */}
              <div style={{ borderTop: '1px solid #E5E7EB', marginBottom: 14 }} />
              {/* Client row */}
              <div style={{ marginBottom: 14 }}>
                <input value={c.client || ''} onChange={e => updateBlock(block.id, { ...c, client: e.target.value })} placeholder="Client Name" style={{ fontSize: 14, fontWeight: 'bold', background: 'transparent', border: 'none', color: '#1A1A2E', width: '100%', outline: 'none' }} />
              </div>
              {/* Date + Prepared by row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, border: '1px solid #E5E7EB', borderRadius: 4, overflow: 'hidden', marginBottom: 10 }}>
                <div style={{ padding: '8px 12px', background: '#F3F4F6', borderRight: '1px solid #E5E7EB' }}>
                  <span style={{ fontSize: 9, fontWeight: 'bold', color: '#E8500A', marginRight: 8 }}>DATE</span>
                  <span style={{ fontSize: 9, color: '#1A1A2E' }}>{today}</span>
                </div>
                <div style={{ padding: '8px 12px', background: '#F3F4F6' }}>
                  <span style={{ fontSize: 9, fontWeight: 'bold', color: '#E8500A', marginRight: 8 }}>PREPARED BY</span>
                  <span style={{ fontSize: 9, color: '#1A1A2E' }}>Fifty Studios Holding Company</span>
                </div>
              </div>
              {/* Confidential */}
              <div style={{ fontSize: 8, color: '#6B7280', fontStyle: 'italic' }}>Private & Confidential — All rights reserved © Fifty Studios Holding Company</div>
            </div>
          </div>
        )
      }
      case 'text':
        return (
          <div style={wrapStyle}>
            <label style={labelStyle}>📝 Text Block</label>
            <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: '#94a3b8', fontSize: 10 }}>↑ Margin</span>
                <input type='number' value={parseInt(block.content.marginTop) || 0} onChange={e => updateBlock(block.id, { ...block.content, marginTop: e.target.value + 'px' })} placeholder='0' style={{ width: 44, background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 4, padding: '2px 6px', fontSize: 11 }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: '#94a3b8', fontSize: 10 }}>↓ Margin</span>
                <input type='number' value={parseInt(block.content.marginBottom) || 0} onChange={e => updateBlock(block.id, { ...block.content, marginBottom: e.target.value + 'px' })} placeholder='0' style={{ width: 44, background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 4, padding: '2px 6px', fontSize: 11 }} />
              </div>
            </div>

            <TiptapEditor content={block.content.html} onChange={html => updateBlock(block.id, { ...block.content, html })} placeholder="Type something..." />
          </div>
        )
      case 'heading':
        return (
          <div style={wrapStyle}>
            <label style={labelStyle}>🔤 Heading</label>
            <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: '#94a3b8', fontSize: 10 }}>↑ Margin</span>
                <input type='number' value={parseInt(block.content.marginTop) || 0} onChange={e => updateBlock(block.id, { ...block.content, marginTop: e.target.value + 'px' })} placeholder='0' style={{ width: 44, background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 4, padding: '2px 6px', fontSize: 11 }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: '#94a3b8', fontSize: 10 }}>↓ Margin</span>
                <input type='number' value={parseInt(block.content.marginBottom) || 0} onChange={e => updateBlock(block.id, { ...block.content, marginBottom: e.target.value + 'px' })} placeholder='0' style={{ width: 44, background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 4, padding: '2px 6px', fontSize: 11 }} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              {[1, 2, 3].map(lvl => (
                <button key={lvl} onClick={() => updateBlock(block.id, { ...block.content, level: lvl })} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 'bold', background: block.content.level === lvl ? '#7c3aed' : '#334155', color: '#fff' }}>H{lvl}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              {[{label:'Red',value:'#ef4444'},{label:'Green',value:'#22c55e'},{label:'Orange',value:'#f97316'},{label:'Grey',value:'#94a3b8'},{label:'Yellow',value:'#eab308'}].map(c => (
                <button key={c.value} onClick={() => updateBlock(block.id, { ...block.content, textColor: c.value })} style={{ width: 28, height: 24, borderRadius: 4, background: c.value, color: '#fff', border: block.content.textColor === c.value ? '2px solid white' : '2px solid transparent', fontSize: 10, fontWeight: 'bold', cursor: 'pointer' }}>A</button>
              ))}
              <button onClick={() => updateBlock(block.id, { ...block.content, textColor: undefined })} style={{ padding: '0 6px', height: 24, borderRadius: 4, background: '#334155', color: '#94a3b8', fontSize: 10, border: 'none', cursor: 'pointer' }}>╳</button>
            </div>
            <input value={block.content.text || ''} onChange={e => updateBlock(block.id, { ...block.content, text: e.target.value })} placeholder="Heading text..." style={{ display: 'block', width: '100%', background: 'transparent', border: 'none', color: '#7c3aed', fontSize: block.content.level === 1 ? 24 : block.content.level === 2 ? 20 : 16, fontWeight: 'bold' }} />
          </div>
        )
      case 'table':
        return (
          <div style={wrapStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ color: '#7c3aed', fontSize: 14 }}>📊</span>
              <input
                value={block.content.sectionTitle || ''}
                onChange={e => updateBlock(block.id, { ...block.content, sectionTitle: e.target.value })}
                placeholder="Table title..."
                style={{ background: 'transparent', border: 'none', color: '#7c3aed', fontSize: 13, fontWeight: 'bold', width: '100%' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: '#94a3b8', fontSize: 10 }}>↑ Margin</span>
                <input type='number' value={parseInt(block.content.marginTop) || 0} onChange={e => updateBlock(block.id, { ...block.content, marginTop: e.target.value + 'px' })} placeholder='0' style={{ width: 44, background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 4, padding: '2px 6px', fontSize: 11 }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: '#94a3b8', fontSize: 10 }}>↓ Margin</span>
                <input type='number' value={parseInt(block.content.marginBottom) || 0} onChange={e => updateBlock(block.id, { ...block.content, marginBottom: e.target.value + 'px' })} placeholder='0' style={{ width: 44, background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 4, padding: '2px 6px', fontSize: 11 }} />
              </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>{(block.content.headers || []).map((h, i) => <td key={i} style={{ padding: '4px 6px', background: '#0f172a', border: '1px solid #334155', color: '#94a3b8' }}>
                    <MiniTiptapEditor value={typeof h === 'string' ? h : (h || '')} onChange={html => { const hs = [...block.content.headers]; hs[i] = html; updateBlock(block.id, { ...block.content, headers: hs }); }} style={{ color: '#94a3b8' }} placeholder="Header" />
                  </td>)}</tr>
              </thead>
              <tbody>
                {(block.content.rows || []).map((row, ri) => (
                  <tr key={ri}>{(row || []).map((cell, ci) => <td key={ci} style={{ padding: '4px 6px', border: '1px solid #334155', color: '#f1f5f9' }}>
                    <MiniTiptapEditor
                      value={typeof cell === 'string' ? cell : (cell || '')}
                      onChange={html => { const rs = block.content.rows.map(r => [...r]); rs[ri][ci] = html; updateBlock(block.id, { ...block.content, rows: rs }); }}
                      style={{ color: '#f1f5f9' }}
                      placeholder="Cell"
                    />
                  </td>)}</tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={() => updateBlock(block.id, { ...block.content, rows: [...(block.content.rows || []), ['', '']] })} style={{ background: '#334155', color: '#f1f5f9', border: 'none', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: 12 }}>+ Row</button>
              <button onClick={() => { const hs = [...(block.content.headers || []), 'New']; const rs = (block.content.rows || []).map(r => [...r, '']); updateBlock(block.id, { ...block.content, headers: hs, rows: rs }); }} style={{ background: '#334155', color: '#f1f5f9', border: 'none', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: 12 }}>+ Column</button>
            </div>
          </div>
        )
      case 'image':
        return (
          <div style={wrapStyle}>
            <label style={labelStyle}>🖼 Image</label>
            {block.content.url ? (
              <div style={{ textAlign: 'center' }}>
                <img src={block.content.url} alt={block.content.alt || ''} style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 8, marginBottom: 8 }} />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <input value={block.content.alt || ''} onChange={e => updateBlock(block.id, { ...block.content, alt: e.target.value })} placeholder="Image description (alt text)" style={{ background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 6, padding: '4px 8px', fontSize: 12, width: 200 }} />
                  <button onClick={() => updateBlock(block.id, { ...block.content, url: '', alt: '', caption: '' })} style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}>Remove</button>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '30px 0', border: '2px dashed #334155', borderRadius: 8 }}>
                <input ref={imageInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { if (e.target.files[0]) handleImageUpload(block.id, e.target.files[0]) }} />
                <button onClick={() => imageInputRef.current?.click()} style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: 'pointer', fontSize: 13, fontWeight: 'bold' }}>📷 Upload Image</button>
                <div style={{ color: '#64748b', fontSize: 11, marginTop: 8 }}>PNG, JPG, GIF, WebP — max 5MB</div>
              </div>
            )}
            {block.content.caption !== undefined && (
              <input value={block.content.caption || ''} onChange={e => updateBlock(block.id, { ...block.content, caption: e.target.value })} placeholder="Caption (optional)" style={{ display: 'block', width: '100%', background: '#0f172a', color: '#94a3b8', border: '1px solid #334155', borderRadius: 6, padding: '6px 8px', fontSize: 12, marginTop: 8 }} />
            )}
          </div>
        )
      case 'pricing':
        return (
          <div style={wrapStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ color: '#7c3aed', fontSize: 16 }}>💰</span>
              <input
                value={block.content.sectionTitle || 'Financial'}
                onChange={e => updateBlock(block.id, { ...block.content, sectionTitle: e.target.value })}
                style={{ background: 'transparent', border: 'none', color: '#f1f5f9', fontSize: 15, fontWeight: 'bold', width: '100%' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              {['KWD', 'SAR', 'USD', 'EUR'].map(c => (
                <button key={c} onClick={() => updateBlock(block.id, { ...block.content, currency: c })} style={{ padding: '2px 8px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 11, background: block.content.currency === c ? '#7c3aed' : '#334155', color: '#fff' }}>{c}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: '#94a3b8', fontSize: 10 }}>↑ Margin</span>
                <input type='number' value={parseInt(block.content.marginTop) || 0} onChange={e => updateBlock(block.id, { ...block.content, marginTop: e.target.value + 'px' })} placeholder='0' style={{ width: 44, background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 4, padding: '2px 6px', fontSize: 11 }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: '#94a3b8', fontSize: 10 }}>↓ Margin</span>
                <input type='number' value={parseInt(block.content.marginBottom) || 0} onChange={e => updateBlock(block.id, { ...block.content, marginBottom: e.target.value + 'px' })} placeholder='0' style={{ width: 44, background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 4, padding: '2px 6px', fontSize: 11 }} />
              </div>
            </div>

            {(block.content.items || []).map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                <input value={item.label} onChange={e => { const items = [...block.content.items]; items[i] = { ...items[i], label: e.target.value }; updateBlock(block.id, { ...block.content, items }); }} placeholder="Item" style={{ flex: 2, background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 6, padding: '6px 8px', fontSize: 13 }} />
                <input type="number" value={item.price} onChange={e => { const items = [...block.content.items]; items[i] = { ...items[i], price: parseFloat(e.target.value) || 0 }; updateBlock(block.id, { ...block.content, items }); }} placeholder="0" style={{ flex: 1, background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 6, padding: '6px 8px', fontSize: 13 }} />
                <button onClick={() => updateBlock(block.id, { ...block.content, items: block.content.items.filter((_, idx) => idx !== i) })} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
              </div>
            ))}
            <button onClick={() => updateBlock(block.id, { ...block.content, items: [...(block.content.items || []), { label: '', price: 0 }] })} style={{ color: '#7c3aed', background: 'none', border: '1px dashed #7c3aed', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: 12 }}>+ Add Row</button>
          </div>
        )
      case 'timeline':
        return (
          <div style={wrapStyle}>
            <label style={labelStyle}>⏱ Timeline</label>
            {(block.content.phases || []).map((phase, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                <span style={{ color: '#7c3aed', fontSize: 11, minWidth: 20 }}>#{i + 1}</span>
                <input value={phase.name} onChange={e => { const ps = [...block.content.phases]; ps[i] = { ...ps[i], name: e.target.value }; updateBlock(block.id, { ...block.content, phases: ps }); }} placeholder="Phase name" style={{ flex: 2, background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 6, padding: '6px 8px', fontSize: 12 }} />
                <input value={phase.duration} onChange={e => { const ps = [...block.content.phases]; ps[i] = { ...ps[i], duration: e.target.value }; updateBlock(block.id, { ...block.content, phases: ps }); }} placeholder="Duration" style={{ flex: 1, background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 6, padding: '6px 8px', fontSize: 12 }} />
                <button onClick={() => updateBlock(block.id, { ...block.content, phases: block.content.phases.filter((_, idx) => idx !== i) })} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
              </div>
            ))}
            <button onClick={() => updateBlock(block.id, { ...block.content, phases: [...(block.content.phases || []), { name: '', duration: '' }] })} style={{ color: '#7c3aed', background: 'none', border: '1px dashed #7c3aed', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: 12 }}>+ Add Phase</button>
          </div>
        )
      case 'scope':
        return (
          <div style={wrapStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ color: '#7c3aed', fontSize: 14 }}>📦</span>
              <input
                value={block.content.sectionTitle || 'Features'}
                onChange={e => updateBlock(block.id, { ...block.content, sectionTitle: e.target.value })}
                style={{ background: 'transparent', border: 'none', color: '#f1f5f9', fontSize: 13, fontWeight: 'bold', width: '100%' }}
              />
            </div>
            {(block.content.items || []).map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' }}>
                <span style={{ color: '#7c3aed', fontSize: 12 }}>•</span>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  {['#ef4444','#22c55e','#f97316','#94a3b8','#eab308'].map(clr => (
                    <button key={clr} onClick={() => { const items = [...(block.content.items || [])]; items[i] = { ...items[i], label: typeof items[i] === 'object' ? items[i].label : items[i], itemColor: clr }; updateBlock(block.id, { ...block.content, items }); }} style={{ width: 12, height: 12, borderRadius: '50%', background: clr, border: (item.itemColor || item.color) === clr ? '2px solid white' : '2px solid transparent', cursor: 'pointer', padding: 0 }} />
                  ))}
                  <button onClick={() => { const items = [...(block.content.items || [])]; items[i] = { ...items[i], itemColor: undefined }; updateBlock(block.id, { ...block.content, items }); }} style={{ width: 12, height: 12, borderRadius: '50%', background: '#334155', border: !(item.itemColor || item.color) ? '2px solid white' : '2px solid transparent', cursor: 'pointer', padding: 0, fontSize: 8, color: '#94a3b8' }}>╳</button>
                </div>
                <input value={item.label || item} onChange={e => { const items = [...(block.content.items || [])]; items[i] = { ...items[i], label: e.target.value, itemColor: item.itemColor || item.color }; updateBlock(block.id, { ...block.content, items }); }} style={{ flex: 1, background: '#0f172a', color: item.itemColor || item.color || '#f1f5f9', border: '1px solid #334155', borderRadius: 4, padding: '4px 8px', fontSize: 12 }} />
                <button onClick={() => updateBlock(block.id, { ...block.content, items: block.content.items.filter((_, idx) => idx !== i) })} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
              </div>
            ))}
            <button onClick={() => updateBlock(block.id, { ...block.content, items: [...(block.content.items || []), { label: '' }] })} style={{ color: '#7c3aed', background: 'none', border: '1px dashed #7c3aed', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: 12 }}>+ Add Scope Item</button>
            <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: '#94a3b8', fontSize: 10 }}>↑ Margin</span>
                <input type='number' value={parseInt(block.content.marginTop) || 0} onChange={e => updateBlock(block.id, { ...block.content, marginTop: e.target.value + 'px' })} placeholder='0' style={{ width: 44, background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 4, padding: '2px 6px', fontSize: 11 }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: '#94a3b8', fontSize: 10 }}>↓ Margin</span>
                <input type='number' value={parseInt(block.content.marginBottom) || 0} onChange={e => updateBlock(block.id, { ...block.content, marginBottom: e.target.value + 'px' })} placeholder='0' style={{ width: 44, background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 4, padding: '2px 6px', fontSize: 11 }} />
              </div>
            </div>
          </div>
        )
      case 'overview':
        return (
          <div style={{ ...wrapStyle, marginTop: 20 }}>
            <label style={labelStyle}>📄 Overview</label>
            <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: '#94a3b8', fontSize: 10 }}>↑ Margin</span>
                <input type='number' value={parseInt(block.content.marginTop) || 0} onChange={e => updateBlock(block.id, { ...block.content, marginTop: e.target.value + 'px' })} placeholder='0' style={{ width: 44, background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 4, padding: '2px 6px', fontSize: 11 }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: '#94a3b8', fontSize: 10 }}>↓ Margin</span>
                <input type='number' value={parseInt(block.content.marginBottom) || 0} onChange={e => updateBlock(block.id, { ...block.content, marginBottom: e.target.value + 'px' })} placeholder='0' style={{ width: 44, background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 4, padding: '2px 6px', fontSize: 11 }} />
              </div>
            </div>

            <TiptapEditor content={block.content.html || block.content.text || ''} onChange={html => updateBlock(block.id, { ...block.content, html, text: html })} placeholder="Type something..." />
          </div>
        )
      case 'techstack':
        return (
          <div style={wrapStyle}>
            <label style={labelStyle}>🛠 Tech Stack</label>
            <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: '#94a3b8', fontSize: 10 }}>↑ Margin</span>
                <input type='number' value={parseInt(block.content.marginTop) || 0} onChange={e => updateBlock(block.id, { ...block.content, marginTop: e.target.value + 'px' })} placeholder='0' style={{ width: 44, background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 4, padding: '2px 6px', fontSize: 11 }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: '#94a3b8', fontSize: 10 }}>↓ Margin</span>
                <input type='number' value={parseInt(block.content.marginBottom) || 0} onChange={e => updateBlock(block.id, { ...block.content, marginBottom: e.target.value + 'px' })} placeholder='0' style={{ width: 44, background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 4, padding: '2px 6px', fontSize: 11 }} />
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {(block.content.items || []).map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#0f172a', border: '1px solid #334155', borderRadius: 16, padding: '4px 10px', fontSize: 12, color: '#f1f5f9' }}>
                  <span>{typeof item === 'object' ? item.label || item.name || item : item}</span>
                  <button onClick={() => updateBlock(block.id, { ...block.content, items: block.content.items.filter((_, idx) => idx !== i) })} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, padding: 0, lineHeight: 1 }}>✕</button>
                </div>
              ))}
            </div>
            <input placeholder="Add technology (e.g. React, Node.js)..." onKeyDown={e => {
              if (e.key === 'Enter' && e.target.value.trim()) {
                const val = e.target.value.trim()
                updateBlock(block.id, { ...block.content, items: [...(block.content.items || []), val] })
                e.target.value = ''
              }
            }} style={{ width: '100%', background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 6, padding: '6px 8px', fontSize: 12 }} />
          </div>
        )
      case 'callout':
        return (
          <div style={{ ...wrapStyle, background: block.content.bgColor || '#7c3aed', borderRadius: 8, border: sel }}>
            <label style={{ ...labelStyle, color: 'rgba(255,255,255,0.7)' }}>💬 Callout</label>
            <textarea value={block.content.text || ''} onChange={e => updateBlock(block.id, { ...block.content, text: e.target.value })} rows={3} placeholder="Callout text..." style={{ display: 'block', width: '100%', background: 'transparent', border: 'none', color: block.content.textColor || '#fff', fontSize: 14, resize: 'vertical', fontWeight: 500, fontFamily: 'inherit' }} />
          </div>
        )
      case 'footer':
        return (
          <div style={{ ...wrapStyle, textAlign: 'center' }}>
            <label style={labelStyle}>✍️ Footer</label>
            <input value={block.content.text || ''} onChange={e => updateBlock(block.id, { ...block.content, text: e.target.value })} placeholder="Footer text" style={{ display: 'block', width: '100%', textAlign: 'center', background: 'transparent', border: 'none', color: '#64748b', fontSize: 12, marginBottom: 8 }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', fontSize: 11, color: '#475569' }}>
              <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <input type="checkbox" checked={block.content.pageNumbers} onChange={e => updateBlock(block.id, { ...block.content, pageNumbers: e.target.checked })} />
                Page numbers
              </label>
            </div>
          </div>
        )
      case 'pagebreak':
        return (
          <div style={{ ...wrapStyle, textAlign: 'center', border: '2px dashed #7c3aed', padding: 24 }}>
            <div style={{ color: '#7c3aed', fontSize: 14 }}>📄 Page Break</div>
            <div style={{ color: '#64748b', fontSize: 11, marginTop: 4 }}>Controls PDF pagination</div>
          </div>
        )
      case 'divider':
        return (
          <div style={wrapStyle}>
            <label style={labelStyle}>➖ Divider</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <input type="color" value={block.content.color || '#334155'} onChange={e => updateBlock(block.id, { ...block.content, color: e.target.value })} style={{ width: 32, height: 32, border: 'none', background: 'none', cursor: 'pointer' }} />
              <span style={{ color: '#94a3b8', fontSize: 12 }}>Color</span>
              <input type="number" value={block.content.thickness || 1} min={1} max={5} onChange={e => updateBlock(block.id, { ...block.content, thickness: parseInt(e.target.value) || 1 })} style={{ width: 50, background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 4, padding: '2px 6px', fontSize: 12 }} />
              <span style={{ color: '#94a3b8', fontSize: 12 }}>px</span>
            </div>
            <div style={{ borderTop: `${block.content.thickness || 1}px ${block.content.style || 'solid'} ${block.content.color || '#334155'}`, marginTop: 4 }} />
          </div>
        )
      case 'list':
        return (
          <div style={wrapStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ color: '#7c3aed', fontSize: 14 }}>📋</span>
              <input
                value={block.content.sectionTitle || ''}
                onChange={e => updateBlock(block.id, { ...block.content, sectionTitle: e.target.value })}
                placeholder="List title..."
                style={{ background: 'transparent', border: 'none', color: '#7c3aed', fontSize: 13, fontWeight: 'bold', width: '100%' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <button onClick={() => updateBlock(block.id, { ...block.content, ordered: false })} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, background: !block.content.ordered ? '#7c3aed' : '#334155', color: '#fff' }}>Bullet</button>
              <button onClick={() => updateBlock(block.id, { ...block.content, ordered: true })} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, background: block.content.ordered ? '#7c3aed' : '#334155', color: '#fff' }}>Numbered</button>
            </div>
            {(block.content.items || []).map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' }}>
                <span style={{ color: '#7c3aed', fontSize: 14, minWidth: 20 }}>{block.content.ordered ? `${i + 1}.` : '•'}</span>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', flex: 1 }}>
                  {['#ef4444','#22c55e','#f97316','#94a3b8','#eab308'].map(clr => (
                    <button key={clr} onClick={() => { const items = block.content.items.map((it, idx) => idx === i ? { ...it, label: typeof it === 'object' ? it.label : it, checked: typeof it === 'object' ? (it.checked ?? false) : false, itemColor: clr } : it); updateBlock(block.id, { ...block.content, items }); }} style={{ width: 12, height: 12, borderRadius: '50%', background: clr, border: (item.itemColor || item.color) === clr ? '2px solid white' : '2px solid transparent', cursor: 'pointer', padding: 0 }} />
                  ))}
                  <button onClick={() => { const items = block.content.items.map((it, idx) => idx === i ? { ...it, itemColor: undefined } : it); updateBlock(block.id, { ...block.content, items }); }} style={{ width: 12, height: 12, borderRadius: '50%', background: '#334155', border: !(item.itemColor || item.color) ? '2px solid white' : '2px solid transparent', cursor: 'pointer', padding: 0, fontSize: 8, color: '#94a3b8' }}>╳</button>
                </div>
                <MiniTiptapEditor
                  value={item.label || ''}
                  onChange={html => { const items = block.content.items.map((it, idx) => idx === i ? { label: html, checked: typeof it === 'object' ? (it.checked ?? false) : false, itemColor: item.itemColor || item.color } : it); updateBlock(block.id, { ...block.content, items }); }}
                  style={{ color: item.itemColor || item.color || '#f1f5f9' }}
                  placeholder="List item"
                />
                <button onClick={() => updateBlock(block.id, { ...block.content, items: block.content.items.filter((_, idx) => idx !== i) })} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
              </div>
            ))}
            <button onClick={() => updateBlock(block.id, { ...block.content, items: [...(block.content.items || []), { label: '', checked: false }] })} style={{ color: '#7c3aed', background: 'none', border: '1px dashed #7c3aed', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: 12 }}>+ Add Item</button>
            <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: '#94a3b8', fontSize: 10 }}>↑ Margin</span>
                <input type='number' value={parseInt(block.content.marginTop) || 0} onChange={e => updateBlock(block.id, { ...block.content, marginTop: e.target.value + 'px' })} placeholder='0' style={{ width: 44, background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 4, padding: '2px 6px', fontSize: 11 }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: '#94a3b8', fontSize: 10 }}>↓ Margin</span>
                <input type='number' value={parseInt(block.content.marginBottom) || 0} onChange={e => updateBlock(block.id, { ...block.content, marginBottom: e.target.value + 'px' })} placeholder='0' style={{ width: 44, background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 4, padding: '2px 6px', fontSize: 11 }} />
              </div>
            </div>
          </div>
        )
      case 'columns':
        return (
          <div style={wrapStyle}>
            <label style={labelStyle}>📐 Columns</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {[2, 3].map(n => (
                <button key={n} onClick={() => updateBlock(block.id, { ...block.content, columns: n, blocks: Array.from({ length: n }, (_, i) => block.content.blocks?.[i] || []), content: Array.from({ length: n }, (_, i) => block.content.content?.[i] || '') })} style={{ padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, background: block.content.columns === n ? '#7c3aed' : '#334155', color: '#fff' }}>{n} Columns</button>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${block.content.columns || 2}, 1fr)`, gap: 8 }}>
              {(block.content.content || []).map((col, i) => (
                <textarea key={i} value={col} onChange={e => { const content = [...(block.content.content || [])]; content[i] = e.target.value; updateBlock(block.id, { ...block.content, content }); }} placeholder={`Column ${i + 1} content...`} rows={4} style={{ background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 6, padding: '8px', fontSize: 12, resize: 'vertical', fontFamily: 'inherit' }} />
              ))}
            </div>
          </div>
        )
      default:
        return (
          <div style={{ ...wrapStyle, textAlign: 'center' }}>
            <span style={{ fontSize: 24 }}>{getBlockIcon(block.type)}</span>
            <div style={{ color: '#94a3b8', fontSize: 13, marginTop: 4, textTransform: 'capitalize' }}>{block.type}</div>
            <div style={{ color: '#475569', fontSize: 11, marginTop: 4 }}>No editor for this block type</div>
          </div>
        )
    }
  }

  return (
    <div style={{ display: 'flex', gap: 16, minHeight: '80vh' }}>
      {/* Left: Block Palette */}
      <div style={{ width: 200, flexShrink: 0 }}>
        <div style={{ background: '#1e293b', borderRadius: 12, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ color: '#94a3b8', fontSize: 11, letterSpacing: 1 }}>CONTENT</div>
            <div style={{ fontSize: 11, color: saved ? '#22c55e' : '#f59e0b' }}>{saved ? '✓ Saved' : '● Saving...'}</div>
          </div>
          {['cover', 'text', 'heading', 'table', 'image', 'divider', 'list'].map(t => (
            <button key={t} onClick={() => addBlock(t)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px', background: '#0f172a', border: '1px solid #334155', borderRadius: 8, cursor: 'pointer', marginBottom: 6, color: '#f1f5f9', textAlign: 'left' }}>
              <span style={{ fontSize: 16 }}>{getBlockIcon(t)}</span>
              <span style={{ fontSize: 12, textTransform: 'capitalize' }}>{t}</span>
            </button>
          ))}
          <div style={{ color: '#94a3b8', fontSize: 11, margin: '16px 0 12px', letterSpacing: 1 }}>DATA</div>
          {['pricing'].map(t => (
            <button key={t} onClick={() => addBlock(t)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px', background: '#0f172a', border: '1px solid #334155', borderRadius: 8, cursor: 'pointer', marginBottom: 6, color: '#f1f5f9', textAlign: 'left' }}>
              <span style={{ fontSize: 16 }}>{getBlockIcon(t)}</span>
              <span style={{ fontSize: 12, textTransform: 'capitalize' }}>{t}</span>
            </button>
          ))}
          <div style={{ color: '#94a3b8', fontSize: 11, margin: '16px 0 12px', letterSpacing: 1 }}>SRS DATA</div>
          {['scope', 'techstack', 'overview', 'timeline'].map(t => (
            <button key={t} onClick={() => addBlock(t)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px', background: '#0f172a', border: '1px solid #334155', borderRadius: 8, cursor: 'pointer', marginBottom: 6, color: '#f1f5f9', textAlign: 'left' }}>
              <span style={{ fontSize: 16 }}>{getBlockIcon(t)}</span>
              <span style={{ fontSize: 12, textTransform: 'capitalize' }}>{t}</span>
            </button>
          ))}
          <div style={{ color: '#94a3b8', fontSize: 11, margin: '16px 0 12px', letterSpacing: 1 }}>LAYOUT</div>
          {['callout', 'columns', 'pagebreak', 'footer'].map(t => (
            <button key={t} onClick={() => addBlock(t)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px', background: '#0f172a', border: '1px solid #334155', borderRadius: 8, cursor: 'pointer', marginBottom: 6, color: '#f1f5f9', textAlign: 'left' }}>
              <span style={{ fontSize: 16 }}>{getBlockIcon(t)}</span>
              <span style={{ fontSize: 12, textTransform: 'capitalize' }}>{t}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Center: Canvas */}
      <div style={{ flex: 1 }}>
        {blocks.length === 0 ? (
          <div style={{ color: '#64748b', textAlign: 'center', padding: 60, border: '2px dashed #334155', borderRadius: 12 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
            No blocks yet — click blocks on the left to start building your proposal
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {blocks.map((block, idx) => (
              <div key={block.id} style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4, zIndex: 10 }}>
                  <button onClick={() => moveBlock(block.id, -1)} disabled={idx === 0} title="Move up" style={{ background: '#334155', border: 'none', borderRadius: 4, padding: '4px 8px', cursor: idx === 0 ? 'not-allowed' : 'pointer', color: idx === 0 ? '#475569' : '#f1f5f9', fontSize: 14 }}>↑</button>
                  <button onClick={() => moveBlock(block.id, 1)} disabled={idx === blocks.length - 1} title="Move down" style={{ background: '#334155', border: 'none', borderRadius: 4, padding: '4px 8px', cursor: idx === blocks.length - 1 ? 'not-allowed' : 'pointer', color: idx === blocks.length - 1 ? '#475569' : '#f1f5f9', fontSize: 14 }}>↓</button>
                  <button onClick={() => duplicateBlock(block.id)} title="Duplicate" style={{ background: '#334155', border: 'none', borderRadius: 4, padding: '4px 8px', cursor: 'pointer', color: '#f1f5f9', fontSize: 14 }}>⎈</button>
                  <button onClick={() => setSelectedBlock(selectedBlock === block.id ? null : block.id)} title="Edit" style={{ background: selectedBlock === block.id ? '#7c3aed' : '#334155', border: 'none', borderRadius: 4, padding: '4px 8px', cursor: 'pointer', color: '#f1f5f9', fontSize: 14 }}>✎</button>
                  <button onClick={() => removeBlock(block.id)} title="Delete" style={{ background: '#ef4444', border: 'none', borderRadius: 4, padding: '4px 8px', cursor: 'pointer', color: '#fff', fontSize: 14 }}>✕</button>
                </div>
                {renderBlock(block)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
