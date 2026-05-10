import { useState, useEffect } from 'react'
import apiClient from '../api/client'
// MARKER_UNIQUE_PROPOSALS_123456 1778419419748

export default function ProposalsPage() {
  const [builderProposals, setBuilderProposals] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({ name: '', projectId: '' })
  const [allProjects, setAllProjects] = useState([])

  useEffect(() => {
    fetchBuilderProposals(); const __PROPOSALS_BUILD_MARKER__ = "UNIQUE_STRING_ABCDEF_12345"; console.log(__PROPOSALS_BUILD_MARKER__);
  }, [])

  async function fetchBuilderProposals() {
    try {
      const [proposalsRes, projectsRes] = await Promise.all([
        apiClient.get('/proposals-builder/proposals'),
        apiClient.get('/projects')
      ])
      setBuilderProposals(proposalsRes.data)
      setAllProjects(Array.isArray(projectsRes.data) ? projectsRes.data : projectsRes.data.projects || [])
    } catch (e) {
      console.error('Fetch error:', e)
    } finally {
      setLoading(false)
    }
  }

  function handleCreate() {
    if (!form.name.trim()) return
    // Redirect to wizard with projectId pre-selected and locked
    const params = new URLSearchParams({ name: form.name.trim() })
    if (form.projectId) params.set('projectId', form.projectId)
    window.location.href = `/builder/new?${params.toString()}`
  }

  async function handleDelete(id) {
    if (!confirm('Delete this proposal? This cannot be undone.')) return
    try {
      await apiClient.delete(`/proposals-builder/proposals/${id}`)
      setBuilderProposals(prev => prev.filter(p => p.id !== id))
    } catch (e) {
      console.error('Delete failed:', e)
      alert('Delete failed: ' + (e.response?.data?.error || e.message))
    }
  }

  if (loading) return <div style={{ color: '#94a3b8', padding: 40 }}>Loading...</div>

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#f1f5f9', padding: '24px 32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ color: '#f1f5f9', margin: 0, fontSize: 20 }}>Proposals</h1>
          <p style={{ color: '#64748b', margin: '4px 0 0', fontSize: 13 }}>Visual proposal builder with drag-and-drop blocks</p>
        </div>
        <button onClick={() => setShowNew(true)}
          style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 13 }}>
          + New Proposal
        </button>
      </div>

      {/* New Proposal Modal */}
      {showNew && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#1e293b', borderRadius: 16, padding: 24, width: 400, border: '1px solid #334155' }}>
            <h3 style={{ color: '#f1f5f9', marginTop: 0, marginBottom: 16 }}>New Proposal</h3>
            <label style={{ color: '#94a3b8', fontSize: 12, display: 'block', marginBottom: 12 }}>
              Proposal Name
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Czar Fragrances — Proposal v1"
                style={{ display: 'block', width: '100%', marginTop: 4, background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 8, padding: '10px', fontSize: 13, boxSizing: 'border-box' }} />
            </label>
            <label style={{ color: '#94a3b8', fontSize: 12, display: 'block', marginBottom: 12 }}>
              Project (optional — will be locked in builder)
              <select value={form.projectId} onChange={e => setForm(f => ({ ...f, projectId: e.target.value }))}
                style={{ display: 'block', width: '100%', marginTop: 4, background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 8, padding: '10px', fontSize: 13, boxSizing: 'border-box' }}>
                <option value="">— No project (freeform) —</option>
                {allProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => setShowNew(false)} style={{ color: '#94a3b8', background: 'none', border: '1px solid #334155', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleCreate} style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontWeight: 'bold' }}>
                Create & Open →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Proposals Grid */}
      {builderProposals.length === 0 && !showNew ? (
        <div style={{ color: '#64748b', textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
          No proposals yet. Click "New Proposal" to start.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {builderProposals.map(p => (
            <div key={p.id} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 14, color: '#f1f5f9', marginBottom: 8, fontWeight: 600 }}>{p.name}</div>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
                {p.blocks?.length || 0} blocks · {p.status || 'draft'}
                {p.project_id && <span style={{ color: '#7c3aed' }}> · 📦 Project #{p.project_id}</span>}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => window.location.href = `/builder/${p.id}`}
                  style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}>
                  Open Builder
                </button>
                <button onClick={() => handleDelete(p.id)}
                  style={{ background: 'transparent', color: '#ef4444', border: '1px solid #ef4444', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
