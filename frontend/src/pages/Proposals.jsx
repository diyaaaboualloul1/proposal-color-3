import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient from '../api/client'

const STATUS_COLORS = {
  draft: '#94a3b8',
  generated: '#f59e0b',
  accepted: '#22c55e',
}

export default function ProposalsPage() {
  const [proposals, setProposals] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({
    name: '',
    client_name: '',
    timeline_type: 'phase',
    timeline_data: [
      { name: 'Phase 1: Design & Development', duration: '3 weeks' },
      { name: 'Phase 2: Testing, Launch & Delivery', duration: '2 weeks' },
    ],
    original_price: 0,
    discounted_price: 0,
    maintenance_second_year: 600,
    exclusions: '',
    notes: '',
    ai_timeline_edit: false,
    scope_summary: '',
    project_overview: '',
  })

  useEffect(() => {
    fetchProposals()
  }, [])

  async function fetchProposals() {
    try {
      const res = await apiClient.get('/proposals?standalone=true')
      setProposals(res.data)
    } catch (e) {
      console.error('Fetch proposals error:', e)
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate() {
    try {
      const res = await apiClient.post('/proposals', {
        ...form,
        name: form.name || `Proposal — ${form.client_name || 'New'}`
      })
      navigate(`/proposals/${res.data.id}`)
    } catch (e) {
      console.error('Create proposal error:', e)
      alert('Failed to create proposal: ' + (e.response?.data?.error || e.message))
    }
  }

  function navigate(path) {
    window.location.href = path
  }

  async function handleImportJson(e) {
    const file = e.target.files[0]
    if (!file) return
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      setForm(f => ({
        ...f,
        name: data.name || f.name,
        client_name: data.client_name || f.client_name,
        scope_summary: data.scope_summary || f.scope_summary,
        project_overview: data.project_overview || f.project_overview,
        original_price: data.original_price || f.original_price,
        discounted_price: data.discounted_price || f.discounted_price,
        maintenance_second_year: data.maintenance_second_year || f.maintenance_second_year,
        exclusions: data.exclusions || f.exclusions,
        notes: data.notes || f.notes,
        timeline_type: data.timeline_type || f.timeline_type,
        timeline_data: data.timeline_data || f.timeline_data,
      }))
      setShowNew(true)
    } catch (err) {
      alert('Invalid JSON file: ' + err.message)
    }
  }

  function addTimelineRow() {
    setForm(f => ({
      ...f,
      timeline_data: [
        ...f.timeline_data,
        { name: `${f.timeline_type === 'phase' ? 'Phase' : 'Week'} ${f.timeline_data.length + 1}`, duration: '1 week' }
      ]
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

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#f1f5f9', padding: '24px 32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ color: '#f1f5f9', margin: 0, fontSize: 20 }}>Standalone Proposals</h1>
          <p style={{ color: '#64748b', margin: '4px 0 0', fontSize: 13 }}>Proposals not linked to any project</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <label style={{ background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 13 }}>
            📥 Import JSON
            <input type="file" accept=".json" onChange={handleImportJson} style={{ display: 'none' }} />
          </label>
          <button
            onClick={() => setShowNew(true)}
            style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 13 }}
          >
            + New Proposal
          </button>
        </div>
      </div>

      {/* New Proposal Form */}
      {showNew && (
        <div style={{ background: '#1e293b', borderRadius: 12, padding: 24, marginBottom: 24, border: '1px solid #334155' }}>
          <h3 style={{ color: '#f1f5f9', marginTop: 0, marginBottom: 16 }}>New Standalone Proposal</h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <label style={{ color: '#94a3b8', fontSize: 12 }}>Proposal Name
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Czar Fragrances — Proposal v1"
                style={{ display: 'block', width: '100%', marginTop: 4, background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 6, padding: '8px', fontSize: 13 }} />
            </label>
            <label style={{ color: '#94a3b8', fontSize: 12 }}>Client Name
              <input value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))}
                placeholder="e.g. Mr. Saad Alajmy"
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
                <label style={{ color: '#94a3b8', fontSize: 12 }}>Type:</label>
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
                  placeholder={form.timeline_type === 'phase' ? `Phase ${i + 1}` : `Week ${i + 1}`}
                  style={{ flex: 2, background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 6, padding: '6px 8px', fontSize: 12 }} />
                <input value={row.duration} onChange={e => updateTimelineRow(i, 'duration', e.target.value)}
                  placeholder="e.g. 2 weeks"
                  style={{ flex: 1, background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 6, padding: '6px 8px', fontSize: 12 }} />
                <button onClick={() => removeTimelineRow(i)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>✕</button>
              </div>
            ))}
            <button onClick={addTimelineRow} style={{ color: '#3b82f6', background: 'none', border: '1px dashed #3b82f6', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: 12, marginTop: 4 }}>
              + Add {form.timeline_type === 'phase' ? 'Phase' : 'Week'}
            </button>
          </div>

          {/* Financial */}
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
            <label style={{ color: '#94a3b8', fontSize: 12 }}>Exclusions (optional)
              <textarea value={form.exclusions} onChange={e => setForm(f => ({ ...f, exclusions: e.target.value }))}
                rows={2} style={{ display: 'block', width: '100%', marginTop: 4, background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 6, padding: '8px', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
            </label>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ color: '#94a3b8', fontSize: 12 }}>Notes (optional)
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={2} style={{ display: 'block', width: '100%', marginTop: 4, background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 6, padding: '8px', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={() => setShowNew(false)} style={{ color: '#94a3b8', background: 'none', border: '1px solid #334155', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}>
              Cancel
            </button>
            <button onClick={handleCreate} style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', cursor: 'pointer', fontWeight: 'bold' }}>
              Create & Open →
            </button>
          </div>
        </div>
      )}

      {/* Proposals Table */}
      {proposals.length === 0 && !showNew ? (
        <div style={{ color: '#64748b', textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
          No standalone proposals yet.
          <br /><br />
          <button onClick={() => setShowNew(true)} style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', cursor: 'pointer' }}>
            Create your first proposal
          </button>
        </div>
      ) : proposals.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#1e293b', borderRadius: 12, overflow: 'hidden' }}>
          <thead>
            <tr style={{ color: '#64748b', fontSize: 11, textAlign: 'left' }}>
              <th style={{ padding: '12px 16px' }}>NAME</th>
              <th style={{ padding: '12px 16px' }}>CLIENT</th>
              <th style={{ padding: '12px 16px' }}>STATUS</th>
              <th style={{ padding: '12px 16px' }}>PRICE</th>
              <th style={{ padding: '12px 16px' }}>UPDATED</th>
              <th style={{ padding: '12px 16px' }}></th>
            </tr>
          </thead>
          <tbody>
            {proposals.map(p => (
              <tr key={p.id} style={{ borderBottom: '1px solid #0f172a' }}>
                <td style={{ padding: '14px 16px', color: '#f1f5f9', fontSize: 14 }}>{p.name}</td>
                <td style={{ padding: '14px 16px', color: '#94a3b8', fontSize: 13 }}>{p.client_name || '—'}</td>
                <td style={{ padding: '14px 16px' }}>
                  <span style={{ color: STATUS_COLORS[p.status] || '#94a3b8', fontSize: 12, textTransform: 'capitalize' }}>● {p.status}</span>
                </td>
                <td style={{ padding: '14px 16px', color: '#94a3b8', fontSize: 13 }}>
                  {p.discounted_price ? `${p.discounted_price} KWD` : '—'}
                </td>
                <td style={{ padding: '14px 16px', color: '#64748b', fontSize: 12 }}>
                  {new Date(p.updated_at).toLocaleDateString('en-GB')}
                </td>
                <td style={{ padding: '14px 16px' }}>
                  <button
                    onClick={() => navigate(`/proposals/${p.id}`)}
                    style={{ background: '#1e40af', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 14px', cursor: 'pointer', fontSize: 12 }}
                  >
                    Open
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}