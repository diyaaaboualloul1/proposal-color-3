import { useState, useEffect } from 'react'
import apiClient from '../../api/client'
import logger from '../../utils/proposalActivityLogger'
const API_BASE = import.meta.env.VITE_API_URL || ''

function parseSrsForBinding(srsText) {
  const result = { scope: [], techStack: [], overview: '', timeline: [] }
  if (!srsText) return result
  const lines = srsText.split('\n')
  let inPurpose = false, purposeLines = []
  lines.forEach(line => {
    if (line.match(/^\s*[-*]\s+[A-Z]/) && !line.match(/Out of Scope/i)) {
      const clean = line.replace(/^\s*[-*]\s+/, '').replace(/\*\*/g, '').trim()
      if (clean && clean.length > 5 && clean.length < 200 && /^[A-Z]/.test(clean)) {
        result.scope.push(clean)
      }
    }
    if (line.match(/Tech|Stack|Framework|Database|Frontend|Backend|Python|JavaScript|Node|React|Vue|Laravel|PHP/i)) {
      const clean = line.replace(/^\s*[-*#\|\s]+/, '').replace(/\*\*/g, '').trim()
      const bad = ['WCAG', 'HTTPS', 'SEO', 'WCMS', 'API', 'REST', 'GraphQL', 'SQL', 'NoSQL', 'CMS', 'CRM']
      if (clean && clean.length > 2 && clean.length < 80 && !bad.some(b => clean.startsWith(b))) {
        result.techStack.push(clean)
      }
    }
    if (line.match(/1\.1\s*Purpose|^Purpose$/i) || inPurpose) {
      if (line.match(/^\s*[-*]/)) { inPurpose = false; return }
      const clean = line.replace(/^#+\s*/, '').trim()
      if (clean && clean.length > 20 && clean.length < 600 && !line.startsWith('|') && !line.match(/^\s*[-*]/)) {
        if (!inPurpose) { inPurpose = true; purposeLines = [] }
        purposeLines.push(clean)
      }
    }
  })
  result.scope = [...new Set(result.scope)].slice(0, 30)
  result.techStack = [...new Set(result.techStack)].slice(0, 20)
  result.overview = purposeLines.join(' ').slice(0, 400)
  return result
}

export default function SrsDataPanel({ onInsert, onClose, defaultProjectId, defaultVersionId }) {
  const [projects, setProjects] = useState([])
  const [selectedProject, setSelectedProject] = useState(defaultProjectId ? String(defaultProjectId) : null)
  const [versions, setVersions] = useState([])
  const [srsData, setSrsData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [selectedVersionId, setSelectedVersionId] = useState(null)

  // Auto-select project + auto-load versions when defaultProjectId is provided
  useEffect(() => {
    if (defaultProjectId) {
      setSelectedProject(String(defaultProjectId))
      fetchSrsVersions(defaultProjectId)
    }
  }, [defaultProjectId])

  // When versions are loaded and defaultVersionId is provided — auto-select that version
  useEffect(() => {
    if (versions.length > 0 && defaultVersionId && !selectedVersionId) {
      const match = versions.find(v => v.id === defaultVersionId)
      if (match) {
        setSelectedVersionId(defaultVersionId)
        loadSrsVersion(defaultVersionId)
      }
    }
  }, [versions, defaultVersionId, selectedVersionId])

  async function fetchSrsVersions(projectId) {
    if (!projectId) return
    try {
      setLoading(true)
      // Correct endpoint: /api/projects/:id/srs (returns {versions: [...]})
      const res = await apiClient.get(`/projects/${projectId}/srs`)
      const versions = Array.isArray(res.data) ? res.data : res.data?.versions || []
      setVersions(versions)
    } catch (e) {
      console.error('[fetchSrsVersions] failed:', e)
      setVersions([])
    } finally { setLoading(false) }
  }

  async function loadSrsVersion(versionId) {
    try {
      setLoading(true)
      const vr = versions.find(v => v.id === versionId)
      if (!vr?.file_path) { console.warn('[loadSrsVersion] No file_path for version', versionId, vr); setSrsData(null); return }
      const content = await fetch(`${API_BASE}/api/srs-content?path=${encodeURIComponent(vr.file_path)}`).then(r => r.json())
      const text = content?.content || content || ''
      const parsed = parseSrsForBinding(text)
      setSrsData(parsed)
      setSelectedVersionId(versionId)
      logger.srsDataLoaded(`${vr?.type} v${vr?.version}`, parsed.scope.length, parsed.techStack.length, parsed.overview)
    } catch (e) {
      logger.srsDataFailed(e.message)
    } finally { setLoading(false) }
  }

  useEffect(() => {
    apiClient.get('/projects').then(r => setProjects(Array.isArray(r.data) ? r.data : r.data?.projects || [])).catch(() => {})
  }, [])

  // Insert scope block — include SRS version metadata so re-insert always uses same version
  function insertScopeBlock() {
    if (!srsData?.scope?.length) return
    const vr = versions.find(v => v.id === selectedVersionId)
    onInsert({
      type: 'scope',
      content: {
        items: srsData.scope.map(t => ({ label: t, checked: false })),
        ordered: false,
        source: 'srs',
        projectId: parseInt(selectedProject) || null,
        srsVersionId: selectedVersionId,
        srsVersionLabel: vr ? `${vr.type} v${vr.version}` : null
      }
    })
  }

  function insertTechStackBlock() {
    if (!srsData?.techStack?.length) return
    const vr = versions.find(v => v.id === selectedVersionId)
    onInsert({
      type: 'list',
      content: {
        items: srsData.techStack.map(t => ({ label: t, checked: false })),
        ordered: false,
        source: 'srs',
        projectId: parseInt(selectedProject) || null,
        srsVersionId: selectedVersionId,
        srsVersionLabel: vr ? `${vr.type} v${vr.version}` : null
      }
    })
  }

  function insertOverviewBlock() {
    if (!srsData?.overview) return
    const vr = versions.find(v => v.id === selectedVersionId)
    onInsert({ type: 'text', content: { html: `<p>${srsData.overview}</p>`, source: 'srs', projectId: parseInt(selectedProject) || null, srsVersionId: selectedVersionId, srsVersionLabel: vr ? `${vr.type} v${vr.version}` : null } })
  }

  // If defaultProjectId is set, skip the project selection and go straight to version selection
  if (defaultProjectId && !selectedProject) {
    return (
      <div style={{ width: 280, background: '#0f172a', border: '1px solid #334155', borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ color: '#f1f5f9', fontSize: 13, fontWeight: 'bold' }}>📄 SRS Data</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 18 }}>✕</button>
        </div>
        {loading && <div style={{ color: '#64748b', fontSize: 12, textAlign: 'center', padding: 16 }}>Loading...</div>}
        {!loading && versions.length === 0 && (
          <div style={{ color: '#64748b', fontSize: 12, textAlign: 'center', padding: 16 }}>No SRS versions found</div>
        )}
        {!loading && versions.map(v => (
          <button key={v.id} onClick={() => loadSrsVersion(v.id)} style={{ display: 'block', width: '100%', padding: '10px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: 8, cursor: 'pointer', marginBottom: 8, textAlign: 'left' }}>
            <span style={{ color: '#f1f5f9', fontSize: 13 }}>{v.version}</span>
            <span style={{ color: '#64748b', fontSize: 11, marginLeft: 8 }}>{v.type} · {new Date(v.created_at).toLocaleDateString()}</span>
          </button>
        ))}
        {!loading && versions.length > 0 && (
          <button onClick={() => { const latest = versions[versions.length - 1]; if (latest) loadSrsVersion(latest.id) }} style={{ width: '100%', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, padding: '10px', cursor: 'pointer', fontSize: 13, fontWeight: 'bold', marginTop: 4 }}>
            ⚡ Use Latest Version
          </button>
        )}
      </div>
    )
  }

  return (
    <div style={{ width: 280, background: '#0f172a', border: '1px solid #334155', borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ color: '#f1f5f9', fontSize: 13, fontWeight: 'bold' }}>📄 SRS Data</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 18 }}>✕</button>
      </div>

      {!selectedProject ? (
        <>
          <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 8 }}>Select a project to load SRS data</div>
          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            {projects.map(p => (
              <button key={p.id} onClick={() => { setSelectedProject(p.id); fetchSrsVersions(p.id) }} style={{ display: 'block', width: '100%', padding: '10px 12px', background: '#1e293b', border: '1px solid #334155', borderRadius: 8, cursor: 'pointer', marginBottom: 6, textAlign: 'left' }}>
                <span style={{ color: '#f1f5f9', fontSize: 13 }}>{p.name}</span>
              </button>
            ))}
          </div>
        </>
      ) : !srsData ? (
        <>
          <div style={{ color: '#64748b', fontSize: 12, marginBottom: 8 }}>{versions.length} version(s) for this project</div>
          {versions.map((v, i) => (
            <button key={i} onClick={() => loadSrsVersion(v.id)} style={{ display: 'block', width: '100%', padding: '10px 12px', background: '#1e293b', border: '1px solid #334155', borderRadius: 8, cursor: 'pointer', marginBottom: 6, textAlign: 'left' }}>
              <span style={{ color: '#f1f5f9', fontSize: 12 }}>{v.type} v{v.version}</span>
              <span style={{ color: '#64748b', fontSize: 11, marginLeft: 6 }}>{new Date(v.created_at).toLocaleDateString()}</span>
            </button>
          ))}
          <button onClick={() => setSelectedProject(null)} style={{ color: '#94a3b8', background: 'none', border: '1px solid #334155', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 12, marginTop: 8 }}>← Back to Projects</button>
        </>
      ) : (
        <>
          <div style={{ marginBottom: 12 }}>
            <div style={{ color: '#7c3aed', fontSize: 11, fontWeight: 'bold', marginBottom: 6 }}>SCOPE ({srsData.scope.length} items)</div>
            {srsData.scope.slice(0, 5).map((item, i) => (
              <div key={i} style={{ color: '#94a3b8', fontSize: 11, marginBottom: 2, paddingLeft: 8 }}>• {item.slice(0, 60)}{item.length > 60 ? '...' : ''}</div>
            ))}
            {srsData.scope.length > 5 && <div style={{ color: '#64748b', fontSize: 10 }}>+ {srsData.scope.length - 5} more</div>}
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ color: '#2563eb', fontSize: 11, fontWeight: 'bold', marginBottom: 6 }}>TECH STACK ({srsData.techStack.length} items)</div>
            {srsData.techStack.slice(0, 5).map((item, i) => (
              <div key={i} style={{ color: '#94a3b8', fontSize: 11, marginBottom: 2, paddingLeft: 8 }}>• {item.slice(0, 60)}{item.length > 60 ? '...' : ''}</div>
            ))}
            {srsData.techStack.length > 5 && <div style={{ color: '#64748b', fontSize: 10 }}>+ {srsData.techStack.length - 5} more</div>}
          </div>
          {srsData.overview && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ color: '#059669', fontSize: 11, fontWeight: 'bold', marginBottom: 4 }}>OVERVIEW</div>
              <div style={{ color: '#94a3b8', fontSize: 11 }}>{srsData.overview.slice(0, 120)}...</div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            <button onClick={insertScopeBlock} style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}>
              📦 Add Scope
            </button>
            <button onClick={insertTechStackBlock} style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}>
              ⚙️ Add Tech
            </button>
            {srsData.overview && (
              <button onClick={insertOverviewBlock} style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}>
                📝 Add Overview
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button onClick={() => { setSelectedProject(null); setSrsData(null); }} style={{ flex: 1, color: '#94a3b8', background: 'none', border: '1px solid #334155', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontSize: 12 }}>← Back</button>
            <button
              onClick={() => {
                console.log('[AddAllBlocks] srsData:', JSON.stringify(srsData)?.slice(0,300))
                const vr = versions.find(v => v.id === selectedVersionId)
                const versionMeta = { srsVersionId: selectedVersionId, srsVersionLabel: vr ? `${vr.type} v${vr.version}` : null }
                if (srsData.scope.length > 0) { console.log('[AddAllBlocks] Calling onInsert for scope'); onInsert({ type: 'scope', content: { items: srsData.scope.map(t => ({ label: t, checked: false })), ordered: false, source: 'srs', projectId: parseInt(selectedProject) || null, ...versionMeta } }) }
                if (srsData.techStack.length > 0) { console.log('[AddAllBlocks] Calling onInsert for techStack'); onInsert({ type: 'list', content: { items: srsData.techStack.map(t => ({ label: t, checked: false })), ordered: false, source: 'srs', projectId: parseInt(selectedProject) || null, ...versionMeta } }) }
                if (srsData.overview) { console.log('[AddAllBlocks] Calling onInsert for overview'); onInsert({ type: 'text', content: { html: `<p>${srsData.overview}</p>`, source: 'srs', projectId: parseInt(selectedProject) || null, ...versionMeta } }) }
                const blockCount = (srsData.scope.length > 0 ? 1 : 0) + (srsData.techStack.length > 0 ? 1 : 0) + (srsData.overview ? 1 : 0)
                logger.allBlocksInserted(blockCount, srsData.scope.length, srsData.techStack.length)
                onClose()
              }}
              style={{ flex: 2, background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 'bold' }}
            >
              ✅ Add All Blocks
            </button>
          </div>
        </>
      )}
    </div>
  )
}