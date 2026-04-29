import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import apiClient from '../api/client'

const STATUS_COLORS = {
  draft: '#94a3b8',
  generated: '#f59e0b',
  accepted: '#22c55e',
}

export default function StandaloneProposalPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [proposal, setProposal] = useState(null)
  const [form, setForm] = useState({
    name: '',
    client_name: '',
    timeline_type: 'phase',
    timeline_data: [],
    original_price: 0,
    discounted_price: 0,
    maintenance_second_year: 600,
    exclusions: '',
    notes: '',
    ai_timeline_edit: false,
    scope_summary: '',
    project_overview: '',
  })
  const [editingSection, setEditingSection] = useState(null)
  const [editContent, setEditContent] = useState('')
  const [generating, setGenerating] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadProposal()
  }, [id])

  async function loadProposal() {
    try {
      const res = await apiClient.get(`/proposals/${id}`)
      setProposal(res.data)
      const p = res.data
      setForm(f => ({
        ...f,
        name: p.name || f.name,
        client_name: p.client_name || '',
        timeline_type: p.timeline_type || 'phase',
        timeline_data: (typeof p.timeline_data === 'string' ? JSON.parse(p.timeline_data) : p.timeline_data) || [],
        original_price: p.original_price || 0,
        discounted_price: p.discounted_price || 0,
        maintenance_second_year: p.maintenance_second_year || 600,
        exclusions: p.exclusions || '',
        notes: p.notes || '',
        ai_timeline_edit: p.ai_timeline_edit || false,
        ...(p.content ? JSON.parse(p.content) : {})
      }))
    } catch (e) {
      console.error('Load error:', e)
    } finally {
      setLoading(false)
    }
  }

  async function handleGenerate() {
    setGenerating(true)
    try {
      await apiClient.put(`/proposals/${id}`, form)
      const res = await apiClient.post(`/proposals/${id}/generate`)
      setProposal(res.data)
    } catch (e) {
      alert('Generation failed: ' + (e.response?.data?.error || e.message))
    } finally {
      setGenerating(false)
    }
  }

  async function handleAccept() {
    try {
      const res = await apiClient.post(`/proposals/${id}/accept`)
      setProposal(res.data)
    } catch (e) {
      console.error('Accept error:', e)
    }
  }

  async function handleUpdateContent() {
    try {
      const res = await apiClient.put(`/proposals/${id}`, { content: editContent })
      setProposal(res.data)
      setEditingSection(null)
    } catch (e) {
      console.error('Update error:', e)
    }
  }

  async function handleSaveForm() {
    try {
      await apiClient.put(`/proposals/${id}`, form)
    } catch (e) {
      console.error('Save error:', e)
    }
  }

  function addTimelineRow() {
    setForm(f => ({
      ...f,
      timeline_data: [...f.timeline_data, { name: `${f.timeline_type === 'phase' ? 'Phase' : 'Week'} ${f.timeline_data.length + 1}`, duration: '1 week' }]
    }))
  }

  function removeTimelineRow(index) {
    setForm(f => ({ ...f, timeline_data: f.timeline_data.filter((_, i) => i !== index) }))
  }

  function updateTimelineRow(index, field, value) {
    setForm(f => ({
      ...f,
      timeline_data: f.timeline_data.map((row, i) => i === index ? { ...row, [field]: value } : row)
    }))
  }

  if (loading) return <div style={{ color: '#94a3b8', padding: 40 }}>Loading...</div>
  if (!proposal) return <div style={{ color: '#ef4444', padding: 40 }}>Proposal not found.</div>

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#f1f5f9', padding: '0 24px 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingTop: 20 }}>
        <div>
          <button onClick={() => navigate('/proposals')} style={{ color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, marginBottom: 4 }}>
            ← Back to Proposals
          </button>
          <h2 style={{ color: '#f1f5f9', margin: 0 }}>{proposal.name}</h2>
          <span style={{ color: '#64748b', fontSize: 12, textTransform: 'capitalize' }}>● {proposal.status} | Standalone Proposal</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {proposal.status === 'generated' && (
            <button onClick={handleAccept} style={{ background: '#22c55e', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 14, fontWeight: 'bold' }}>
              ✓ Accept Proposal
            </button>
          )}
          {(proposal.status === 'draft' || proposal.status === 'generated') && (
            <button onClick={handleGenerate} disabled={generating} style={{ background: proposal.status === 'generated' ? '#7c3aed' : '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: generating ? 'not-allowed' : 'pointer', opacity: generating ? 0.6 : 1 }}>
              {generating ? 'Generating...' : proposal.status === 'generated' ? '🔄 Regenerate' : '🚀 Generate'}
            </button>
          )}
        </div>
      </div>

      {/* Form */}
      {proposal.status !== 'accepted' && (
        <div style={{ background: '#1e293b', borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ color: '#f1f5f9', margin: 0 }}>Proposal Details</h3>
            <button onClick={handleSaveForm} style={{ background: '#065f46', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13 }}>
              💾 Save Inputs
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <label style={{ color: '#94a3b8', fontSize: 12 }}>Proposal Name
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                style={{ display: 'block', width: '100%', marginTop: 4, background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 6, padding: '8px', fontSize: 13 }} />
            </label>
            <label style={{ color: '#94a3b8', fontSize: 12 }}>Client Name
              <input value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))}
                style={{ display: 'block', width: '100%', marginTop: 4, background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 6, padding: '8px', fontSize: 13 }} />
            </label>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ color: '#94a3b8', fontSize: 12 }}>Project Overview
              <textarea value={form.project_overview} onChange={e => setForm(f => ({ ...f, project_overview: e.target.value }))}
                rows={3} style={{ display: 'block', width: '100%', marginTop: 4, background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 6, padding: '8px', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
            </label>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ color: '#94a3b8', fontSize: 12 }}>Scope Summary
              <textarea value={form.scope_summary} onChange={e => setForm(f => ({ ...f, scope_summary: e.target.value }))}
                rows={5} style={{ display: 'block', width: '100%', marginTop: 4, background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 6, padding: '8px', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
            </label>
          </div>

          {/* Timeline */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label style={{ color: '#94a3b8', fontSize: 12 }}>Timeline</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <label style={{ color: '#94a3b8', fontSize: 12, display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input type="checkbox" checked={form.ai_timeline_edit} onChange={e => setForm(f => ({ ...f, ai_timeline_edit: e.target.checked }))} />
                  Let AI edit timeline
                </label>
                <span style={{ color: '#64748b', fontSize: 11 }}>|</span>
                <select value={form.timeline_type} onChange={e => setForm(f => ({ ...f, timeline_type: e.target.value, timeline_data: [] }))}
                  style={{ background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 6, padding: '4px 8px', fontSize: 12 }}>
                  <option value="phase">Phase-by-Phase</option>
                  <option value="week">Week-by-Week</option>
                </select>
              </div>
            </div>
            {form.timeline_data.map((row, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                <input value={row.name} onChange={e => updateTimelineRow(i, 'name', e.target.value)}
                  style={{ flex: 2, background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 6, padding: '6px 8px', fontSize: 12 }} />
                <input value={row.duration} onChange={e => updateTimelineRow(i, 'duration', e.target.value)}
                  style={{ flex: 1, background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 6, padding: '6px 8px', fontSize: 12 }} />
                <button onClick={() => removeTimelineRow(i)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>✕</button>
              </div>
            ))}
            <button onClick={addTimelineRow} style={{ color: '#3b82f6', background: 'none', border: '1px dashed #3b82f6', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: 12, marginTop: 4 }}>
              + Add {form.timeline_type === 'phase' ? 'Phase' : 'Week'}
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <label style={{ color: '#94a3b8', fontSize: 12 }}>Original Price (KWD)
              <input type="number" value={form.original_price} onChange={e => setForm(f => ({ ...f, original_price: parseFloat(e.target.value) || 0 }))}
                style={{ display: 'block', width: '100%', marginTop: 4, background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 6, padding: '6px 8px', fontSize: 13 }} />
            </label>
            <label style={{ color: '#94a3b8', fontSize: 12 }}>Discounted Price (KWD)
              <input type="number" value={form.discounted_price} onChange={e => setForm(f => ({ ...f, discounted_price: parseFloat(e.target.value) || 0 }))}
                style={{ display: 'block', width: '100%', marginTop: 4, background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 6, padding: '6px 8px', fontSize: 13 }} />
            </label>
            <label style={{ color: '#94a3b8', fontSize: 12 }}>Maintenance 2nd Year (KWD)
              <input type="number" value={form.maintenance_second_year} onChange={e => setForm(f => ({ ...f, maintenance_second_year: parseFloat(e.target.value) || 0 }))}
                style={{ display: 'block', width: '100%', marginTop: 4, background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 6, padding: '6px 8px', fontSize: 13 }} />
            </label>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ color: '#94a3b8', fontSize: 12 }}>Exclusions
              <textarea value={form.exclusions} onChange={e => setForm(f => ({ ...f, exclusions: e.target.value }))}
                rows={2} style={{ display: 'block', width: '100%', marginTop: 4, background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 6, padding: '8px', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
            </label>
          </div>
          <div>
            <label style={{ color: '#94a3b8', fontSize: 12 }}>Notes
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={2} style={{ display: 'block', width: '100%', marginTop: 4, background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 6, padding: '8px', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
            </label>
          </div>
        </div>
      )}

      {/* Generated Content */}
      {proposal.status !== 'draft' && proposal.content && (
        <div style={{ background: '#1e293b', borderRadius: 12, padding: 20 }}>
          <h3 style={{ color: '#f1f5f9', marginTop: 0, marginBottom: 16 }}>Generated Proposal</h3>
          {editingSection === 'content' ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <h4 style={{ color: '#94a3b8', margin: 0 }}>Full Proposal</h4>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setEditingSection(null)} style={{ color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>Cancel</button>
                  <button onClick={handleUpdateContent} style={{ color: '#22c55e', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 'bold' }}>Save ✓</button>
                </div>
              </div>
              <textarea value={editContent} onChange={e => setEditContent(e.target.value)}
                style={{ width: '100%', minHeight: 300, background: '#0f172a', color: '#f1f5f9', border: '1px solid #3b82f6', borderRadius: 8, padding: 12, fontSize: 13, fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box' }} />
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <h4 style={{ color: '#94a3b8', margin: 0 }}>Full Proposal</h4>
                <button onClick={() => { setEditingSection('content'); setEditContent(proposal.content || '') }}
                  style={{ color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>
                  ✏️ Edit
                </button>
              </div>
              <pre style={{ color: '#e2e8f0', background: '#0f172a', padding: 16, borderRadius: 8, fontSize: 13, whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0, border: '1px solid #1e293b', maxHeight: 500, overflowY: 'auto' }}>
                {proposal.content}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}