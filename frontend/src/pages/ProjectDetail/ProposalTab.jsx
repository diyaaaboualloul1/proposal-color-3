import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import apiClient from '../../api/client'

const STATUS_COLORS = {
  draft: '#94a3b8',
  generated: '#f59e0b',
  accepted: '#22c55e',
}

export default function ProposalTab({ projectId, project }) {
  const [proposals, setProposals] = useState([])
  const [activeProposal, setActiveProposal] = useState(null)
  const [srsVersions, setSrsVersions] = useState([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [editingSection, setEditingSection] = useState(null)
  const [editContent, setEditContent] = useState('')
  const [form, setForm] = useState({
    name: '',
    client_name: '',
    srs_version: '',
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

  // Load proposals for this project
  useEffect(() => {
    fetchProposals()
    fetchSrsVersions()
  }, [projectId])

  async function fetchProposals() {
    try {
      const res = await apiClient.get(`/proposals?project_id=${projectId}`)
      setProposals(res.data)
    } catch (e) {
      console.error('Fetch proposals error:', e)
    } finally {
      setLoading(false)
    }
  }

  async function fetchSrsVersions() {
    try {
      const res = await apiClient.get(`/projects/${projectId}/srs`)
      const list = res.data?.versions || []
      // Filter to only technical versions (not client summaries)
      const technical = list.filter(v => v.type === 'technical')
      setSrsVersions(technical)
    } catch (e) {
      console.error('Fetch SRS versions error:', e)
    }
  }

  async function handleAutoFill() {
    if (!form.srs_version) return
    try {
      const res = await apiClient.get(`/projects/${projectId}/srs/${form.srs_version}/proposal-context`)
      const data = res.data
      setForm(f => ({
        ...f,
        scope_summary: data.scope_summary || '',
        project_overview: data.project_overview || '',
      }))
    } catch (e) {
      console.error('Auto-fill error:', e)
    }
  }

  async function handleCreate() {
    try {
      const res = await apiClient.post('/proposals', {
        ...form,
        project_id: projectId,
        name: form.name || `${project?.name || 'Proposal'} - v${proposals.length + 1}`,
      })
      setActiveProposal(res.data)
      setProposals(p => [res.data, ...p])
    } catch (e) {
      console.error('Create proposal error:', e)
    }
  }

  async function handleGenerate() {
    if (!activeProposal) return
    setGenerating(true)
    try {
      // Save current form state first
      await apiClient.put(`/proposals/${activeProposal.id}`, form)
      const res = await apiClient.post(`/proposals/${activeProposal.id}/generate`)
      setActiveProposal(res.data)
      setProposals(p => p.map(x => x.id === res.data.id ? res.data : x))
    } catch (e) {
      console.error('Generate error:', e)
      alert('Generation failed: ' + (e.response?.data?.error || e.message))
    } finally {
      setGenerating(false)
    }
  }

  async function handleAccept() {
    if (!activeProposal) return
    try {
      const res = await apiClient.post(`/proposals/${activeProposal.id}/accept`)
      setActiveProposal(res.data)
      setProposals(p => p.map(x => x.id === res.data.id ? res.data : x))
    } catch (e) {
      console.error('Accept error:', e)
    }
  }

  async function handleUpdateContent() {
    if (!activeProposal) return
    try {
      const res = await apiClient.put(`/proposals/${activeProposal.id}`, {
        content: editContent,
      })
      setActiveProposal(res.data)
      setEditingSection(null)
    } catch (e) {
      console.error('Update content error:', e)
    }
  }

  function startEdit(section, content) {
    setEditingSection(section)
    setEditContent(content || '')
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
    setForm(f => ({
      ...f,
      timeline_data: f.timeline_data.filter((_, i) => i !== index)
    }))
  }

  function updateTimelineRow(index, field, value) {
    setForm(f => ({
      ...f,
      timeline_data: f.timeline_data.map((row, i) => i === index ? { ...row, [field]: value } : row)
    }))
  }

  if (loading) return <div style={{ color: '#94a3b8', padding: 40 }}>Loading...</div>

  // If a proposal is open, show the editor
  if (activeProposal) {
    return (
      <ProposalEditor
        proposal={activeProposal}
        form={form}
        setForm={setForm}
        editingSection={editingSection}
        editContent={editContent}
        setEditContent={setEditContent}
        generating={generating}
        onBack={() => { setActiveProposal(null); setEditingSection(null) }}
        onGenerate={handleGenerate}
        onAccept={handleAccept}
        onStartEdit={startEdit}
        onUpdateContent={handleUpdateContent}
        onCancelEdit={() => setEditingSection(null)}
        addTimelineRow={addTimelineRow}
        removeTimelineRow={removeTimelineRow}
        updateTimelineRow={updateTimelineRow}
        srsVersions={srsVersions}
        onAutoFill={handleAutoFill}
      />
    )
  }

  // Proposal list
  return (
    <div style={{ padding: '0 24px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ color: '#f1f5f9', margin: 0 }}>Proposals</h2>
        <button
          onClick={handleCreate}
          style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 14 }}
        >
          + New Proposal
        </button>
      </div>

      {/* New Proposal Form */}
      <div style={{ background: '#1e293b', borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <h3 style={{ color: '#f1f5f9', marginTop: 0 }}>Create New Proposal</h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <label style={{ color: '#94a3b8', fontSize: 12 }}>SRS Version (optional)
            <select
              value={form.srs_version}
              onChange={e => setForm(f => ({ ...f, srs_version: e.target.value }))}
              style={{ display: 'block', width: '100%', marginTop: 4, background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 6, padding: '6px 8px', fontSize: 13 }}
            >
              <option value="">— No SRS (standalone) —</option>
              {srsVersions.map(v => <option key={v.version} value={v.version}>v{v.version} — {v.label || 'Technical SRS'}</option>)}
            </select>
          </label>
          <label style={{ color: '#94a3b8', fontSize: 12 }}>Client Name
            <input value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))}
              placeholder="e.g. Mr. Saad Alajmy"
              style={{ display: 'block', width: '100%', marginTop: 4, background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 6, padding: '6px 8px', fontSize: 13 }} />
          </label>
          <label style={{ color: '#94a3b8', fontSize: 12 }}>Proposal Name
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Czar Fragrances — Main Proposal"
              style={{ display: 'block', width: '100%', marginTop: 4, background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 6, padding: '6px 8px', fontSize: 13 }} />
          </label>
          {form.srs_version && (
            <button
              onClick={handleAutoFill}
              style={{ background: '#065f46', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontSize: 13, alignSelf: 'flex-end' }}
            >
              ⭐ Auto-fill from SRS
            </button>
          )}
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

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <button
            onClick={handleCreate}
            style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', cursor: 'pointer', fontSize: 14, fontWeight: 'bold' }}
          >
            Create Proposal →
          </button>
        </div>
      </div>

      {/* Proposals List */}
      {proposals.length === 0 ? (
        <div style={{ color: '#64748b', textAlign: 'center', padding: 40 }}>
          No proposals yet. Create one above.
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: '#64748b', fontSize: 12, textAlign: 'left' }}>
              <th style={{ padding: '8px 12px' }}>NAME</th>
              <th style={{ padding: '8px 12px' }}>CLIENT</th>
              <th style={{ padding: '8px 12px' }}>SRS</th>
              <th style={{ padding: '8px 12px' }}>STATUS</th>
              <th style={{ padding: '8px 12px' }}>UPDATED</th>
              <th style={{ padding: '8px 12px' }}></th>
            </tr>
          </thead>
          <tbody>
            {proposals.map(p => (
              <tr key={p.id} style={{ borderBottom: '1px solid #1e293b' }}>
                <td style={{ padding: '12px', color: '#f1f5f9' }}>{p.name}</td>
                <td style={{ padding: '12px', color: '#94a3b8' }}>{p.client_name || '—'}</td>
                <td style={{ padding: '12px', color: '#94a3b8' }}>{p.srs_version ? `v${p.srs_version}` : '—'}</td>
                <td style={{ padding: '12px' }}>
                  <span style={{ color: STATUS_COLORS[p.status] || '#94a3b8', fontSize: 12, textTransform: 'capitalize' }}>● {p.status}</span>
                </td>
                <td style={{ padding: '12px', color: '#64748b', fontSize: 12 }}>
                  {new Date(p.updated_at).toLocaleDateString('en-GB')}
                </td>
                <td style={{ padding: '12px' }}>
                  <button
                    onClick={() => { setActiveProposal(p); setForm(f => ({ ...f, name: p.name, client_name: p.client_name || '', srs_version: p.srs_version || '' })) }}
                    style={{ background: '#1e40af', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: 12 }}
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

// ============================================================
// Proposal Editor Sub-component
// ============================================================
function ProposalEditor({
  proposal, form, setForm, editingSection, editContent, setEditContent,
  generating, onBack, onGenerate, onAccept,
  onStartEdit, onUpdateContent, onCancelEdit,
  addTimelineRow, removeTimelineRow, updateTimelineRow,
  srsVersions, onAutoFill
}) {
  const [pdfLoading, setPdfLoading] = useState(false)

  async function handleGeneratePdf() {
    setPdfLoading(true)
    try {
      await apiClient.post(`/proposals/${proposal.id}/generate-pdf`)
      alert('PDF generated!')
    } catch (e) {
      alert('PDF failed: ' + (e.response?.data?.error || e.message))
    } finally {
      setPdfLoading(false)
    }
  }

  function renderSection(label, content, sectionKey) {
    if (editingSection === sectionKey) {
      return (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <h4 style={{ color: '#94a3b8', margin: 0 }}>{label}</h4>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={onCancelEdit} style={{ color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>Cancel</button>
              <button onClick={onUpdateContent} style={{ color: '#22c55e', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 'bold' }}>Save ✓</button>
            </div>
          </div>
          <textarea
            value={editContent}
            onChange={e => setEditContent(e.target.value)}
            style={{
              width: '100%', minHeight: 200, background: '#0f172a', color: '#f1f5f9',
              border: '1px solid #3b82f6', borderRadius: 8, padding: 12, fontSize: 13,
              fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box'
            }}
          />
        </div>
      )
    }
    return (
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <h4 style={{ color: '#94a3b8', margin: 0 }}>{label}</h4>
          <button
            onClick={() => onStartEdit(sectionKey, content)}
            style={{ color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}
          >
            ✏️ Edit
          </button>
        </div>
        <pre style={{ color: '#e2e8f0', background: '#0f172a', padding: 16, borderRadius: 8, fontSize: 13, whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0, border: '1px solid #1e293b' }}>
          {content || <span style={{ color: '#64748b' }}>Not generated yet</span>}
        </pre>
      </div>
    )
  }

  return (
    <div style={{ padding: '0 24px 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <button onClick={onBack} style={{ color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, marginBottom: 4 }}>
            ← Back to Proposals
          </button>
          <h2 style={{ color: '#f1f5f9', margin: 0 }}>{proposal.name}</h2>
          <span style={{ color: '#64748b', fontSize: 12, textTransform: 'capitalize' }}>● {proposal.status}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {proposal.status === 'generated' && (
            <>
              <button onClick={handleGeneratePdf} disabled={pdfLoading} style={{ background: '#065f46', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: pdfLoading ? 'not-allowed' : 'pointer', opacity: pdfLoading ? 0.6 : 1 }}>
                {pdfLoading ? 'Generating PDF...' : '📄 PDF'}
              </button>
              <button onClick={onAccept} style={{ background: '#22c55e', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 14, fontWeight: 'bold' }}>
                ✓ Accept Proposal
              </button>
            </>
          )}
          {(proposal.status === 'draft' || proposal.status === 'generated') && (
            <button onClick={onGenerate} disabled={generating} style={{ background: proposal.status === 'generated' ? '#7c3aed' : '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: generating ? 'not-allowed' : 'pointer', opacity: generating ? 0.6 : 1 }}>
              {generating ? 'Generating...' : proposal.status === 'generated' ? '🔄 Regenerate' : '🚀 Generate'}
            </button>
          )}
        </div>
      </div>

      {/* Editable Form (visible in draft/generated) */}
      {proposal.status !== 'accepted' && (
        <div style={{ background: '#1e293b', borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <h3 style={{ color: '#f1f5f9', marginTop: 0, marginBottom: 16 }}>Proposal Details</h3>

          {/* Scope / Overview */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ color: '#94a3b8', fontSize: 12, display: 'block', marginBottom: 4 }}>
              Project Overview {form.srs_version && <span style={{ color: '#3b82f6' }}>(auto-filled from SRS)</span>}
              <textarea value={form.project_overview} onChange={e => setForm(f => ({ ...f, project_overview: e.target.value }))}
                rows={3} style={{ display: 'block', width: '100%', marginTop: 4, background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 6, padding: '8px', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
            </label>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ color: '#94a3b8', fontSize: 12, display: 'block', marginBottom: 4 }}>
              Scope Summary {form.srs_version && <span style={{ color: '#3b82f6' }}>(auto-filled from SRS)</span>}
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
                rows={3} style={{ display: 'block', width: '100%', marginTop: 4, background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 6, padding: '8px', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
            </label>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ color: '#94a3b8', fontSize: 12 }}>Notes (optional)
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={3} style={{ display: 'block', width: '100%', marginTop: 4, background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 6, padding: '8px', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
            </label>
          </div>
        </div>
      )}

      {/* Generated Content — Section-by-Section Edit */}
      {proposal.status !== 'draft' && proposal.content && (
        <div style={{ background: '#1e293b', borderRadius: 12, padding: 20 }}>
          <h3 style={{ color: '#f1f5f9', marginTop: 0, marginBottom: 16 }}>Generated Proposal</h3>
          {renderSection('Full Proposal', proposal.content, 'content')}
        </div>
      )}
    </div>
  )
}