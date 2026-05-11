import { useState, useEffect, useCallback, useRef } from 'react'
// MARKER_UNIQUE_987654321 1778419398893
import { useParams, useSearchParams } from 'react-router-dom'
import ProposalBuilder from '../components/ProposalBuilder/ProposalBuilder'
import SrsDataPanel from '../components/ProposalBuilder/SrsDataPanel'
import apiClient from '../api/client'
import logger from '../utils/proposalActivityLogger'
import ActivityLogPanel from '../components/ProposalBuilder/ActivityLogPanel'

// Recursive sanitizer: strips DOM elements, React fiber refs, functions
function sanitize(val, seen = new WeakSet()) {
  if (val === null || val === undefined) return val
  if (typeof val === 'function' || typeof val === 'symbol') return undefined
  if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') return val
  if (val instanceof Date) return val.toISOString()
  if (val instanceof Error) return val.message
  if (typeof val === 'bigint') return String(val)
  if (typeof val === 'object' && !Array.isArray(val)) {
    if (seen.has(val)) return undefined
    const keys = Object.keys(val)
    if (keys.some(k => k.startsWith('__react')) || val instanceof HTMLElement || val instanceof Node) return undefined
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

function stripBlock(block) {
  return { id: block.id, type: block.type, content: sanitize(block.content) }
}

function stripBlockDeep(block) {
  const content = sanitize(block.content)
  // Ensure items array has plain objects
  if (content && Array.isArray(content.items)) {
    content.items = content.items.map(item => {
      if (typeof item === 'object' && item !== null) {
        return { label: item.label || item.name || '', checked: item.checked || false }
      }
      return { label: String(item), checked: false }
    })
  }
  if (content && Array.isArray(content.phases)) {
    content.phases = content.phases.map(p => ({ name: p.name || '', duration: p.duration || '' }))
  }
  return { id: block.id, type: block.type, content }
}

function safeClone(val) {
  try { return structuredClone(val) } catch { return JSON.parse(JSON.stringify(sanitize(val))) }
}

// Fetch SRS data for a project and return scope, techStack, overview, timeline
async function fetchSrsForProject(projectId) {
  if (!projectId) return null
  try {
    const r = await apiClient.get(`/projects/${projectId}/srs`)
    const versions = r.data.versions || []
    if (!versions.length) return null
    const latest = versions[versions.length - 1]
    const content = await fetch(`/api/srs-content?path=${encodeURIComponent(latest.file_path)}`).then(r => r.json())
    return content
  } catch { return null }
}

// Fetch SRS content for a specific version (by version index) and return parsed data
// versions param allows calling from module-level functions without closure issues
async function fetchSrsContentForVersion(projectId, versionIndex, versionsArr) {
  const versions = versionsArr || []
  if (!projectId || !versions.length) return null
  try {
    const v = versions[versionIndex]
    if (!v?.file_path) { console.warn('[fetchSrsContentForVersion] No file_path for version', versionIndex, v); return null }
    const json = await fetch(`/api/srs-content?path=${encodeURIComponent(v.file_path)}`).then(r => r.json())
    // API returns {content: "..."} — extract text from .content
    const text = json?.content || json || ''
    console.log('[fetchSrsContentForVersion] Parsing SRS, text length:', text.length, 'version:', v.type, v.version)
    const parsed = parseSrsText(text)
    console.log('[fetchSrsContentForVersion] Result:', parsed.scope.length, 'scope items,', parsed.techStack.length, 'tech items')
    return parsed
  } catch (e) { console.error('[fetchSrsContentForVersion] Error:', e); return null }
}

// Parse SRS text into structured data
function parseSrsText(text) {
  const result = { scope: [], techStack: [], overview: '', timeline: [] }
  if (!text) return result
  const lines = text.split('\n')
  let inPurpose = false, purposeLines = []
  let inTechSection = false, techLines = []
  // Tech stack keywords to look for in FR/requirement lines
  const techKeywords = ['React', 'Node', 'Python', 'Mongo', 'Express', 'AWS', 'Docker', 'TypeScript', 'PostgreSQL', 'JavaScript', 'Vite', 'SQLite', 'Framer', 'Vercel', 'WordPress', 'Laravel', 'PHP', 'Vue', 'Angular', 'Next', 'Stripe', 'Nodemailer']
  let inScopeSection = false // track if we're inside ## Scope or ## X.X Scope section
  lines.forEach(line => {
    // Enter Scope section: heading like "## Scope" or "## 1.2 Scope"
    if (line.match(/^#{1,3}\s+\d*\.?\d*\s*Scope\b/i)) {
      inScopeSection = true
      return
    }
    // Exit Scope section when hitting any other ## heading (Definitions, Overall Description, Specific, etc.)
    if (line.match(/^#{1,3}\s+[A-Z]/) && !line.match(/Scope/i) && inScopeSection) {
      inScopeSection = false
    }
    // Scope items: lines starting with - or * followed by uppercase, while in scope section
    // Reject if contains "Out of Scope" or "out of scope"
    if (inScopeSection && line.match(/^\s*[-*]\s+[A-Z]/) && !line.match(/Out of Scope/i)) {
      const clean = line.replace(/^\s*[-*]\s+/, '').replace(/\*\*/g, '').trim()
      if (clean && clean.length > 5 && clean.length < 200 && /^[A-Z]/.test(clean)) {
        result.scope.push(clean)
      }
    }
    // Also accept standalone scope items: "In Scope:" marker activates collection
    if (line.match(/In Scope\s*:/i) && !line.match(/Out of Scope/i)) {
      inScopeSection = true
    }
    if (line.match(/Out of Scope/i)) {
      inScopeSection = false
    }
    // Stop collecting if we hit "**Out of Scope:**" bold header
    if (line.match(/^\s*\*\*Out of Scope/i)) {
      inScopeSection = false
    }
    // Tech Stack: look for tech mentions inside requirement/FR lines
    if (techKeywords.some(kw => line.includes(kw)) && !line.match(/^\s*#/)) {
      const clean = line.replace(/^\s*[-*]\s+/, '').replace(/\*\*/g, '').replace(/\|/g, '').trim()
      // Skip lines that are too short or are just FR numbers
      if (clean.length > 5 && clean.length < 150 && !clean.match(/^FR-\d+/) && !clean.match(/^\d+\./)) {
        // Extract the tech mention context
        techKeywords.forEach(kw => {
          if (clean.includes(kw) && !techLines.includes(kw)) {
            techLines.push(kw)
          }
        })
      }
    }
    // Also capture explicit tech stack section
    if (line.match(/Tech.{0,20}Stack|Technology Stack|Stack.*Technolog/i)) {
      inTechSection = true
    }
    if (inTechSection && line.match(/^\s*[-*]\s+/)) {
      const clean = line.replace(/^\s*[-*]\s+/, '').replace(/\*\*/g, '').replace(/\|/g, '').trim()
      if (clean && clean.length > 2 && clean.length < 80) {
        techLines.push(clean)
      }
    }
    if (line.match(/^#{1,3}\s+[^ Purpose]/) && inTechSection) inTechSection = false
    // Overview / Purpose: capture content after 1.1 Purpose header
    if (line.match(/1\.1\s*Purpose|^Purpose$/i)) {
      inPurpose = true
      purposeLines = []
    }
    if (inPurpose) {
      // Skip list markers and section headers that end purpose section
      if (line.match(/^\s*[-*]/)) { inPurpose = false; return }
      if (line.match(/^#{1,3}\s+1\.\d/) && !line.match(/1\.1/)) { inPurpose = false; return }
      // Capture non-list, non-table content
      const clean = line.replace(/^#+\s*/, '').replace(/\*\*/g, '').replace(/\|/g, '').trim()
      if (clean && clean.length > 10 && clean.length < 700 && !line.startsWith('|') && !line.match(/^\s*[-*]/)) {
        purposeLines.push(clean)
      }
    }
  })
  result.scope = [...new Set(result.scope)].slice(0, 30)
  // Tech stack: deduplicate tech keywords found
  result.techStack = [...new Set(techLines)].slice(0, 20)
  // Overview: join all purpose lines, but prefer longer descriptive lines
  if (purposeLines.length > 0) {
    // Take the longest lines first (usually the actual description)
    purposeLines.sort((a, b) => b.length - a.length)
    result.overview = purposeLines.slice(0, 3).join(' ').substring(0, 500)
  }
  return result
}

export default function ProposalBuilderPage() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const [proposal, setProposal] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [versions, setVersions] = useState([])
  const [versionCount, setVersionCount] = useState(0)
  const [showVersions, setShowVersions] = useState(false)
  const [showSrsPanel, setShowSrsPanel] = useState(false)
  const [showActivityLog, setShowActivityLog] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [projects, setProjects] = useState([])
  const [selectedProjectId, setSelectedProjectId] = useState(null)
  const [srsVersions, setSrsVersions] = useState([])
  const [selectedSrsIndex, setSelectedSrsIndex] = useState(0)
  const [wizardStep, setWizardStep] = useState(1)
  const [linkToProject, setLinkToProject] = useState(false)
  const [projectLocked, setProjectLocked] = useState(false)
  const [proposalName, setProposalName] = useState('')
  const [creating, setCreating] = useState(false)
  const [templateCards, setTemplateCards] = useState([])
  const [versionModalReady, setVersionModalReady] = useState(false)

  useEffect(() => {
    if (id && id !== 'new') {
      fetchProposal(id)
    } else {
      // new proposal wizard — pre-fill name from query param if provided
      const prefillName = searchParams.get('name')
      if (prefillName) setProposalName(prefillName)
      // If projectId is passed in URL, auto-select and lock it
      const prefillProjectId = searchParams.get('projectId')
      if (prefillProjectId) {
        const pid = parseInt(prefillProjectId)
        setSelectedProjectId(pid)
        setLinkToProject(true)
        setProjectLocked(true)
        fetchSrsVersions(pid)
      }
      setLoading(false)
    }
    apiClient.get('/proposals-builder/templates').then(r => {
      const templates = Array.isArray(r.data) ? r.data : r.data.templates || []
      setTemplateCards(templates)
      // templates loaded — user picks manually in wizard
    }).catch(() => {})
    apiClient.get('/projects').then(r => setProjects(Array.isArray(r.data) ? r.data : r.data.projects || [])).catch(() => {})
  }, [id])

  // Poll version count every 30s so the button badge stays fresh
  useEffect(() => {
    if (!id || id === 'new' || !proposal) return
    console.log('[VersionPoll] proposal changed, resetting interval for', id)
    const interval = setInterval(async () => {
      try {
        const vr = await apiClient.get(`/proposals-builder/${id}/versions`)
        setVersionCount(Array.isArray(vr.data) ? vr.data.length : 0)
      } catch {}
    }, 30000)
    return () => clearInterval(interval)
  }, [id, proposal])

  async function fetchProposal(proposalId) {
    console.log('[fetchProposal] Loading proposal:', proposalId)
    logger.syncEffectFired('n/a', proposalId, 0, 0, 'fetchProposal')
    try {
      const [res, vr] = await Promise.all([
        apiClient.get(`/proposals-builder/${proposalId}`),
        apiClient.get(`/proposals-builder/${proposalId}/versions`)
      ])
      console.log('[fetchProposal] API raw response blocks:', JSON.stringify(res.data.blocks)?.slice(0,200))
      const data = safeClone(res.data)
      console.log('[fetchProposal] safeClone blocks count:', data.blocks?.length)
      setProposal(data)
      setSelectedProjectId(data.project_id || null)
      if (data.project_id) setLinkToProject(true)
      setVersions(vr.data || [])
      setVersionCount(Array.isArray(vr.data) ? vr.data.length : 0)
    } catch (e) {
      console.error('Failed to load proposal:', e)
    } finally {
      setLoading(false)
    }
  }
  async function handleSaveVersion() {
    if (!proposal) return
    try {
      await apiClient.post(`/proposals-builder/proposals/${proposal.id}/save-version`)
      const vr = await apiClient.get(`/proposals-builder/${proposal.id}/versions`)
      setVersions(vr.data || [])
      setVersionCount(Array.isArray(vr.data) ? vr.data.length : 0)
      logger.versionSaved(proposal.id, new Date().toLocaleString(), proposal.blocks?.length || 0)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      console.error('Save version failed:', e)
    }
  }

  async function handleRestoreVersion(versionId) {
    if (!proposal) return
    try {
      const res = await apiClient.post(`/proposals-builder/proposals/${proposal.id}/restore/${versionId}`)
      setProposal(safeClone(res.data))
      logger.proposalLoaded(proposalId, safeClone(res.data).blocks?.length || 0, safeClone(res.data).project_id)
      setShowVersions(false)
    } catch (e) {
      console.error('Restore failed:', e)
    }
  }

  const handleInsertBlock = useCallback(async (blockData) => {
    logger.singleBlockInserted(blockData.type, blockData.content?.items?.length || 0)
    console.log('[handleInsertBlock] Called with:', JSON.stringify(blockData))
    if (!proposal) { console.log('[handleInsertBlock] No proposal, returning'); return }
    const cleanBlocks = (proposal.blocks || []).map(stripBlock)
    console.log('[handleInsertBlock] cleanBlocks count:', cleanBlocks.length)
    const newBlock = stripBlockDeep({ id: `block_${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`, ...blockData })
    console.log('[handleInsertBlock] newBlock after stripBlockDeep:', JSON.stringify(newBlock))
    const updatedBlocks = [...cleanBlocks, newBlock]
    console.log('[handleInsertBlock] updatedBlocks count:', updatedBlocks.length)
    setProposal(p => { console.log('[handleInsertBlock] setProposal called, blocks:', p.blocks?.length); return { ...p, blocks: updatedBlocks } })
    try {
      setSaving(true)
      console.log('[handleInsertBlock] Sending to API:', updatedBlocks.length, 'blocks')
      console.log('[handleInsertBlock] Sending to API:', updatedBlocks.length, 'blocks', { name: proposal.name, project_id: selectedProjectId })
      await apiClient.put(`/proposals-builder/proposals/${proposal.id}`, {
        name: proposal.name,
        blocks: updatedBlocks,
        project_id: proposal.project_id || selectedProjectId || null,
        srs_version: proposal.srs_version || null
      })
      console.log('[handleInsertBlock] API success')
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      console.error('[handleInsertBlock] API error:', e)
    } finally {
      setSaving(false)
    }
  }, [proposal, selectedProjectId])

  // Auto-fill SRS blocks when proposal loads with empty SRS blocks and a linked project
  useEffect(() => {
    if (!selectedProjectId || !proposal?.blocks) return
    const srsBlock = (proposal.blocks || []).find(b => ['scope','overview','techstack','timeline'].includes(b.type))
    if (!srsBlock) return
    const hasSrsData = (b) => {
      const c = b.content || {}
      if (b.type === 'overview') return !!c.text
      if (b.type === 'timeline') return !!(c.phases?.length)
      return !!(c.items?.length)
    }
    const needsFill = (proposal.blocks || []).some(b => ['scope','overview','techstack','timeline'].includes(b.type) && !hasSrsData(b))
    if (!needsFill) { console.log('[useEffect] SRS blocks already populated, skipping auto-fill'); return }
    console.log('[useEffect] Auto-filling SRS blocks for project', selectedProjectId)
    handleAutoFill()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId, proposal?.id])

  // Auto-fill: pull SRS data into SRS-type blocks in the builder
  const handleAutoFill = useCallback(async () => {
    if (!selectedProjectId || !proposal) { console.log('[handleAutoFill] Skipped — missing projectId or proposal'); return }
    console.log('[handleAutoFill] Starting, projectId:', selectedProjectId, 'proposal blocks:', proposal.blocks?.length)
    try {
      const srs = await fetchSrsForProject(selectedProjectId)
      console.log('[handleAutoFill] SRS fetched, content length:', srs?.content?.length)
      if (!srs?.content) return
      const parsed = parseSrsText(srs.content)
      console.log('[handleAutoFill] Parsed:', parsed.scope.length, 'scope,', parsed.techStack.length, 'tech')
      const cleanBlocks = (proposal.blocks || []).map(stripBlock)
      let updated = false

      for (const block of cleanBlocks) {
        if (block.type === 'scope' && parsed.scope.length) {
          block.content = { ...block.content, items: parsed.scope.map(t => ({ label: t })), source: 'srs', projectId: selectedProjectId }
          updated = true
        } else if (block.type === 'overview' && parsed.overview) {
          block.content = { ...block.content, text: parsed.overview, source: 'srs', projectId: selectedProjectId }
          updated = true
        } else if (block.type === 'techstack' && parsed.techStack.length) {
          block.content = { ...block.content, items: parsed.techStack, source: 'srs', projectId: selectedProjectId }
          updated = true
        } else if (block.type === 'timeline' && parsed.timeline.length) {
          block.content = { ...block.content, phases: parsed.timeline, projectId: selectedProjectId }
          updated = true
        }
      }

      if (updated) {
        console.log('[handleAutoFill] Updated, saving', cleanBlocks.length, 'blocks')
        setProposal(p => ({ ...p, blocks: cleanBlocks }))
        await apiClient.put(`/proposals-builder/proposals/${proposal.id}`, {
          name: proposal.name,
          blocks: cleanBlocks,
          project_id: proposal.project_id || selectedProjectId || null,
          srs_version: proposal.srs_version || null
        })
        console.log('[handleAutoFill] API save success')
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      } else {
        console.log('[handleAutoFill] No blocks needed update')
      }
    } catch (e) {
      console.error('[handleAutoFill] Auto-fill failed:', e)
    }
  }, [selectedProjectId, proposal])

  async function fetchSrsVersions(projectId) {
    if (!projectId) { setSrsVersions([]); return }
    try {
      const r = await apiClient.get(`/projects/${projectId}/srs`)
      setSrsVersions((r.data.versions || []).filter(v => v.type === 'technical'))
      setSelectedSrsIndex(0)
    } catch { setSrsVersions([]) }
  }

  async function handleCreateProposal() {
    if (!proposalName.trim()) return
    logger.wizardStarted(proposalName.trim())
    console.log('[handleCreateProposal] Creating proposal:', proposalName, 'linkToProject:', linkToProject, 'selectedProjectId:', selectedProjectId)
    setCreating(true)
    try {
      const srsVer = srsVersions[selectedSrsIndex]
      let initialBlocks = selectedTemplate?.blocks || []
      // Default template if none selected — SRS PDF style
      if (!selectedTemplate && !initialBlocks.length) {
        const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
        initialBlocks = [
          { id: `cover_${Date.now()}`, type: 'cover', content: { title: 'Project Proposal', subtitle: 'Proposal', client: '', date: today, preparedBy: 'Fifty Studios Holding Company' } },
          { id: `overview_${Date.now()}`, type: 'overview', content: { text: 'Add project overview here...', sectionTitle: '' } },
          { id: `scope_${Date.now()}`, type: 'scope', content: { items: [], ordered: false, source: 'template', sectionTitle: 'Features' } },
          { id: `table_${Date.now()}`, type: 'table', content: { sectionTitle: 'Timeline', headers: ['Phase', 'Duration'], rows: [['', '']] } },
          { id: `pricing_${Date.now()}`, type: 'pricing', content: { currency: 'KWD', items: [{label: 'Original Project Cost', price: 0}, {label: 'Discounted Price', price: 0}, {label: 'Total', price: 0}], sectionTitle: 'Financial' } },
          { id: `list_${Date.now()}_1`, type: 'list', content: { sectionTitle: 'Payment Terms:', items: [{label: '50% of the total upon contract signing', checked: false}, {label: '50% of the total upon final delivery and go-live', checked: false}], ordered: false, source: 'template' } },
          { id: `list_${Date.now()}_2`, type: 'list', content: { sectionTitle: 'Maintenance & Hosting:', items: [{label: 'First Year: Included from the total cost', checked: false}, {label: 'Second Year Renewal: 600 KWD (includes hosting, maintenance, and technical support)', checked: false}], ordered: false, source: 'template' } },
          { id: `list_${Date.now()}_3`, type: 'list', content: { sectionTitle: 'Notes & Conditions:', items: [{label: 'The client shall provide all branding materials (logo, color palette, and content).', checked: false}, {label: 'Hosting and maintenance include standard uptime, monitoring, and technical support. Any data loss, downtime, or force majeure incidents are outside the service scope.', checked: false}, {label: 'Any additional feature requests beyond this scope will be quoted separately.', checked: false}, {label: 'Delays caused by third parties (e.g., payment provider, content submission) are not part of the project timeline.', checked: false}], ordered: true, source: 'template' } },
        ]
      }
      console.log('[handleCreateProposal] template blocks:', initialBlocks.length, 'srsVer:', srsVer?.version)

      // If an SRS version is selected, fetch its content and convert to blocks
      if (srsVer && selectedProjectId) {
        console.log('[handleCreateProposal] Fetching SRS content for project:', selectedProjectId, 'version index:', selectedSrsIndex)
        const srsData = await fetchSrsContentForVersion(selectedProjectId, selectedSrsIndex, srsVersions)
        console.log('[handleCreateProposal] SRS data fetched:', srsData?.scope?.length, 'scope items')
        if (srsData) {
          const versionMeta = { srsVersionId: srsVer?.id, srsVersionLabel: srsVer ? `${srsVer.type} v${srsVer.version}` : null }
          const srsBlocks = []
          // Overview block from SRS
          if (srsData.overview) {
            srsBlocks.push({ id: `block_${Date.now()}_srs_ov`, type: 'overview', content: { text: srsData.overview, source: 'srs', projectId: selectedProjectId, ...versionMeta } })
          }
          // Scope block from SRS (Features)
          if (srsData.scope.length) {
            srsBlocks.push({ id: `block_${Date.now()}_srs_scope`, type: 'scope', content: { items: srsData.scope.map(t => ({ label: t, checked: false })), ordered: false, source: 'srs', sectionTitle: 'Features', projectId: selectedProjectId, ...versionMeta } })
          }
          // Timeline block from SRS
          if (srsData.timeline.length) {
            srsBlocks.push({ id: `block_${Date.now()}_srs_tl`, type: 'timeline', content: { phases: srsData.timeline, projectId: selectedProjectId, ...versionMeta } })
          }
          // Financial section: table (Timeline) + pricing + 3 lists
          const financialBlocks = [
            { id: `table_${Date.now()}`, type: 'table', content: { sectionTitle: 'Timeline', headers: ['Phase', 'Duration'], rows: [['', '']] } },
            { id: `pricing_${Date.now()}`, type: 'pricing', content: { currency: 'KWD', items: [{label: 'Original Project Cost', price: 0}, {label: 'Discounted Price', price: 0}, {label: 'Total', price: 0}], sectionTitle: 'Financial' } },
            { id: `list_${Date.now()}_1`, type: 'list', content: { sectionTitle: 'Payment Terms:', items: [{label: '50% of the total upon contract signing', checked: false}, {label: '50% of the total upon final delivery and go-live', checked: false}], ordered: false, source: 'template' } },
            { id: `list_${Date.now()}_2`, type: 'list', content: { sectionTitle: 'Maintenance & Hosting:', items: [{label: 'First Year: Included from the total cost', checked: false}, {label: 'Second Year Renewal: 600 KWD (includes hosting, maintenance, and technical support)', checked: false}], ordered: false, source: 'template' } },
            { id: `list_${Date.now()}_3`, type: 'list', content: { sectionTitle: 'Notes & Conditions:', items: [{label: 'The client shall provide all branding materials (logo, color palette, and content).', checked: false}, {label: 'Hosting and maintenance include standard uptime, monitoring, and technical support. Any data loss, downtime, or force majeure incidents are outside the service scope.', checked: false}, {label: 'Any additional feature requests beyond this scope will be quoted separately.', checked: false}, {label: 'Delays caused by third parties (e.g., payment provider, content submission) are not part of the project timeline.', checked: false}], ordered: true, source: 'template' } },
          ]
          console.log('[handleCreateProposal] SRS blocks created:', srsBlocks.length)
          // Keep cover, add SRS blocks (no techstack), then Financial + lists
          initialBlocks = [initialBlocks[0], ...srsBlocks, ...financialBlocks]
        }
      }

      console.log('[handleCreateProposal] DEBUG:', {
        proposalName: proposalName.trim(),
        selectedProjectId,
        srsVersionsCount: srsVersions.length,
        srsVersions: srsVersions.map(v => `${v.type} v${v.version}`),
        selectedSrsIndex,
        srsVer: srsVer ? `${srsVer.type} v${srsVer.version}` : null
      })
    console.log('[handleCreateProposal] DEBUG:', {
      proposalName: proposalName.trim(),
      selectedProjectId,
      srsVersionsCount: srsVersions.length,
      srsVersions: srsVersions.map(v => `${v.type} v${v.version}`),
      selectedSrsIndex,
      srsVer: srsVer ? `${srsVer.type} v${srsVer.version}` : null
    })
      const payload = {
        name: proposalName.trim(),
        project_id: selectedProjectId || null,
        srs_version: srsVer ? `${srsVer.type} v${srsVer.version}` : null,
        template_id: selectedTemplate?.id || null,
        blocks: initialBlocks
      }
      console.log('[handleCreateProposal] Payload:', JSON.stringify({...payload, blocks: `[${payload.blocks?.length} blocks]`}))
      const res = await apiClient.post('/proposals-builder/proposals', payload)
      logger.proposalLoaded(res.data.id, payload.blocks?.length || 0, payload.project_id)
      console.log('[handleCreateProposal] Created, redirecting to:', res.data.id)
      window.location.href = `/builder/${res.data.id}`
    } catch (e) {
      console.error('[handleCreateProposal] Create failed:', e)
      setCreating(false)
    }
  }

  function goToStep(s) {
    console.log('[goToStep]', s, 'proposalName:', proposalName, 'selectedProjectId:', selectedProjectId, 'selectedTemplate:', selectedTemplate?.id)
    if (s === 2) {
      const proj = projects.find(p => p.id === selectedProjectId)
      if (!proposalName.trim() && linkToProject && proj) setProposalName(proj.name)
      else if (!proposalName.trim()) setProposalName('Untitled Proposal')
    }
    setWizardStep(s)
  }

  const selectedProject = projects.find(p => p.id === selectedProjectId)
  const selectedSrs = srsVersions[selectedSrsIndex]

  async function openVersionModal() {
    if (versionModalReady) {
      setShowVersions(true)
      return
    }
    try {
      const vr = await apiClient.get(`/proposals-builder/${id}/versions`)
      setVersions(vr.data || [])
      setVersionCount(Array.isArray(vr.data) ? vr.data.length : 0)
    } catch {}
    setVersionModalReady(true)
    setShowVersions(true)
  }

  if (loading) return <div style={{ color: '#94a3b8', padding: 40, textAlign: 'center' }}>Loading...</div>

  if (id === 'new' || !proposal) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f172a', color: '#f1f5f9', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px' }}>
        <div style={{ maxWidth: 640, width: '100%' }}>

          {/* Step Indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 32, justifyContent: 'center' }}>
            {[1, 2].map(step => (
              <div key={step} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: wizardStep >= step ? '#7c3aed' : '#334155',
                  color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 'bold'
                }}>{step}</div>
                <span style={{ color: wizardStep >= step ? '#f1f5f9' : '#64748b', fontSize: 13 }}>
                  {step === 1 ? 'Link SRS' : 'Confirm'}
                </span>
                {step < 2 && <span style={{ color: '#334155' }}>›</span>}
              </div>
            ))}
          </div>

          {/* STEP 1 */}
          {wizardStep === 1 && (
            <div>
              <h2 style={{ marginBottom: 6, fontSize: 20 }}>Create New Proposal</h2>
              <p style={{ color: '#64748b', fontSize: 13, marginTop: 0, marginBottom: 28 }}>Choose a template and optionally link a project.</p>

              {/* TEMPLATE SELECTOR */}
              <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: 20, marginBottom: 20 }}>
                <label style={{ color: '#94a3b8', fontSize: 11, display: 'block', marginBottom: 12, letterSpacing: 1 }}>TEMPLATE</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
                  {templateCards.map(t => (
                    <button key={t.id} onClick={() => {
                      if (projectLocked) return
                      setSelectedTemplate(t)
                      logger.wizardStarted(t.name)
                    }} style={{
                      background: selectedTemplate?.id === t.id ? '#0f172a' : '#1e293b',
                      color: '#f1f5f9',
                      border: selectedTemplate?.id === t.id ? '2px solid #7c3aed' : '1px solid #334155',
                      borderRadius: 8, padding: '10px 14px', cursor: projectLocked ? 'not-allowed' : 'pointer', textAlign: 'left', transition: 'all 0.15s'
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{t.name}</div>
                      <div style={{ fontSize: 10, color: '#64748b' }}>{Array.isArray(t.blocks) ? t.blocks.length : 0} blocks</div>
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: 20, marginBottom: 20 }}>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ color: '#94a3b8', fontSize: 11, display: 'block', marginBottom: 6, letterSpacing: 1 }}>PROJECT</label>
                  <select value={selectedProjectId || ''} onChange={e => {
                    if (projectLocked) return
                    const pid = e.target.value ? parseInt(e.target.value) : null
                    console.log('[STEP1] Project selected, id:', pid)
                    setSelectedProjectId(pid)
                    if (pid) setLinkToProject(true)
                    const proj = projects.find(p => p.id === pid)
                    if (pid) logger.projectLinked(pid, proj?.name || 'unknown')
                    fetchSrsVersions(pid)
                  }} disabled={projectLocked} style={{ width: '100%', background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 8, padding: '10px 12px', fontSize: 14, cursor: projectLocked ? 'not-allowed' : 'pointer' }}>
                    <option value="">— Select a project (optional) —</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>

                  {srsVersions.length > 0 && (
                    <div>
                      <label style={{ color: '#94a3b8', fontSize: 11, display: 'block', marginBottom: 6, letterSpacing: 1 }}>SRS VERSION</label>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
                        {srsVersions.map((v, i) => (
                          <button key={i} onClick={() => {
                            console.log('[STEP1] SRS version selected, index:', i, 'version:', v.version)
                            setSelectedSrsIndex(i)
                            logger.srsVersionSelected(i, `${v.type} v${v.version}`)
                          }} style={{
                            background: selectedSrsIndex === i ? '#0f172a' : '#1e293b',
                            color: '#f1f5f9',
                            border: selectedSrsIndex === i ? '2px solid #7c3aed' : '1px solid #334155',
                            borderRadius: 8, padding: '10px 14px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                              <span style={{
                                fontSize: 10, fontWeight: 'bold', padding: '2px 6px', borderRadius: 4,
                                background: v.type === 'client' ? '#7c3aed' : '#2563eb',
                                color: '#fff'
                              }}>{v.type}</span>
                              <span style={{ fontSize: 12 }}>{v.version}</span>
                            </div>
                            <div style={{ fontSize: 10, color: '#64748b' }}>{new Date(v.created_at).toLocaleDateString()}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={() => goToStep(2)} style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 28px', cursor: 'pointer', fontSize: 14, fontWeight: 'bold' }}>
                  Continue →
                </button>
              </div>
            </div>
          )}

          {/* STEP 2 — Confirm */}
          {wizardStep === 2 && (
            <div>
              <h2 style={{ marginBottom: 6, fontSize: 20 }}>Confirm & Create</h2>
              <p style={{ color: '#64748b', fontSize: 13, marginTop: 0, marginBottom: 24 }}>Review your proposal details before creating.</p>

              <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: 24, marginBottom: 24 }}>
                <div style={{ marginBottom: 20 }}>
                  <label style={{ color: '#94a3b8', fontSize: 11, display: 'block', marginBottom: 8, letterSpacing: 1 }}>PROPOSAL NAME</label>
                  <input
                    value={proposalName}
                    onChange={e => setProposalName(e.target.value)}
                    placeholder="Proposal name..."
                    style={{ background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 8, padding: '10px 16px', fontSize: 14, width: '100%', boxSizing: 'border-box' }}
                  />
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={{ color: '#94a3b8', fontSize: 11, display: 'block', marginBottom: 6, letterSpacing: 1 }}>PROJECT</label>
                  {selectedProjectId && selectedProject ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14 }}>{selectedProject.name}</span>
                      {selectedSrs && (
                        <span style={{ fontSize: 11, background: '#1e1b4b', color: '#c4b5fd', padding: '3px 8px', borderRadius: 6 }}>
                          📦 SRS {selectedSrs.type} {selectedSrs.version}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span style={{ fontSize: 14, color: '#64748b' }}>No project (freeform)</span>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <button onClick={() => goToStep(2)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 13 }}>
                  ← Back
                </button>
                <button
                  onClick={handleCreateProposal}
                  disabled={!proposalName.trim() || creating}
                  style={{ background: (proposalName.trim() && !creating) ? '#7c3aed' : '#475569', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 28px', cursor: (proposalName.trim() && !creating) ? 'pointer' : 'not-allowed', fontSize: 14, fontWeight: 'bold' }}
                >
                  {creating ? 'Creating...' : 'Create Proposal →'}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#f1f5f9' }}>
      {/* Sticky Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 24px', borderBottom: '1px solid #1e293b', background: '#1e293b', position: 'sticky', top: 0, zIndex: 100 }}>
        <div>
          <h2 style={{ color: '#f1f5f9', margin: 0, fontSize: 16 }}>{proposal?.name || 'Untitled'}</h2>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
            {proposal?.blocks?.length || 0} blocks
            {saved && <span style={{ color: '#22c55e', marginLeft: 8 }}>✓ Saved</span>}
            {saving && <span style={{ color: '#f59e0b', marginLeft: 8 }}>Saving...</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {proposal?.srs_version && (
            <span style={{ background: '#7c3aed', color: '#fff', borderRadius: 16, padding: '4px 12px', fontSize: 12, fontWeight: 'bold', marginRight: 4 }}>
              📦 SRS {proposal.srs_version}
            </span>
          )}
          {proposal?.project_id ? (
            <span style={{ background: '#0f172a', color: '#f1f5f9', borderRadius: 16, padding: '6px 14px', fontSize: 12, fontWeight: 'bold', marginRight: 4 }}>
              📦 {projects.find(p => p.id === proposal.project_id)?.name || 'Linked Project'}
            </span>
          ) : (
            <select
              value={selectedProjectId || ''}
              onChange={async e => {
                const newProjectId = e.target.value ? parseInt(e.target.value) : null
                setSelectedProjectId(newProjectId)
                if (newProjectId) setLinkToProject(true)
                try {
                  await apiClient.put(`/proposals-builder/proposals/${proposal.id}`, {
                    name: proposal.name || 'Untitled Proposal',
                    blocks: (proposal.blocks || []).map(stripBlock),
                    project_id: newProjectId,
                    srs_version: proposal.srs_version || null
                  })
                  if (newProjectId) handleAutoFill()
                } catch (err) { console.error('Failed to save project link:', err) }
              }}
              style={{ background: '#0f172a', color: '#94a3b8', border: '1px solid #334155', borderRadius: 6, padding: '6px 8px', fontSize: 12, cursor: 'pointer' }}
            >
              <option value="">🔗 No project</option>
              {projects.map(p => <option key={p.id} value={p.id}>📦 {p.name}</option>)}
            </select>
          )}


          <button onClick={openVersionModal} style={{ background: '#334155', color: '#f1f5f9', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13 }}>
            💾 Versions ({versionCount})
          </button>
          <button onClick={() => window.open(`/api/proposals-pdf/${proposal?.id}/export-pdf`, '_blank')} style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13 }}>
            📄 Export PDF
            <span style={{ fontSize: 10, opacity: 0.75, marginLeft: 4 }}>(save version first)</span>
          </button>
          <button onClick={handleSaveVersion} style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13 }}>
            💾 Save Version
          </button>
          <button onClick={() => setShowActivityLog(v => !v)} style={{ background: showActivityLog ? '#7c3aed' : '#334155', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13 }}>
            📋 Activity Log</button>
        </div>
      </div>

      <ActivityLogPanel isOpen={showActivityLog} onClose={() => setShowActivityLog(false)} />

      {/* Builder */}
      <div style={{ padding: 24 }}>
        <ProposalBuilder
          proposalId={proposal.id}
          initialData={proposal}
          apiBase="/api/proposals-builder"
          onOpenSrsPanel={(type) => {
            setShowSrsPanel(true)
            logger.srsPanelOpened(proposal.id)
          }}
          onFillComplete={(updatedBlocks) => {
            console.log('[ProposalBuilderPage] onFillComplete called with', updatedBlocks.length, 'blocks')
            // Update the proposal state so initialData reflects the filled blocks
            setProposal(p => ({ ...p, blocks: updatedBlocks }))
          }}
          onBlockFillRequest={(type, blockId, currentBlocks, onFillComplete) => {
            console.log('[onBlockFillRequest] type:', type, 'blockId:', blockId, 'selectedProjectId:', selectedProjectId)
            if (!selectedProjectId) { console.log('[onBlockFillRequest] ABORT — no selectedProjectId'); return }
            fetchSrsForProject(selectedProjectId).then(srs => {
              console.log('[onBlockFillRequest] srs:', srs ? 'OK len=' + srs?.content?.length : 'NULL')
              if (!srs?.content) { console.log('[onBlockFillRequest] ABORT — no srs content'); return }
              const parsed = parseSrsText(srs.content)
              console.log('[onBlockFillRequest] parsed scope:', parsed.scope.length, 'techstack:', parsed.techStack.length)
              let content = { source: 'srs', projectId: selectedProjectId }
              if (type === 'scope') content = { ...content, items: parsed.scope.map(t => ({ label: t, checked: false })) }
              else if (type === 'techstack') content = { ...content, items: parsed.techStack.map(t => ({ label: t, checked: false })) }
              else if (type === 'overview') content = { ...content, text: parsed.overview || '' }
              else if (type === 'timeline') content = { ...content, phases: parsed.timeline || [] }
              console.log('[onBlockFillRequest] content items:', content.items?.length)
              // Update the specific block using the fresh currentBlocks array
              const updatedBlocks = currentBlocks.map(b => b.id === blockId ? { ...b, content } : b)
              console.log('[onBlockFillRequest] updatedBlocks:', updatedBlocks.length, 'target items:', updatedBlocks.find(b=>b.id===blockId)?.content?.items?.length)
              // Tell the builder to update its local blocks state with the filled content
              onFillComplete?.(updatedBlocks)
              // Also update parent state for persistence
              setProposal(p => ({ ...p, blocks: updatedBlocks }))
              apiClient.put(`/proposals-builder/proposals/${proposal.id}`, {
                name: proposal.name,
                blocks: updatedBlocks,
                project_id: proposal.project_id || selectedProjectId || null,
                srs_version: proposal.srs_version || null
              }).then(() => { console.log('[onBlockFillRequest] API success'); setSaved(true); setTimeout(() => setSaved(false), 2000) }).catch(e => console.error('[onBlockFillRequest] API err:', e))
            }).catch(e => console.error('[onBlockFillRequest] fetch err:', e))
          }}
        />
      </div>

      {/* SRS Data Panel — derive projectId + versionId from proposal blocks if not set at proposal level */}
      {showSrsPanel && (
        <SrsDataPanel
          onInsert={handleInsertBlock}
          onClose={() => setShowSrsPanel(false)}
          defaultProjectId={(() => {
            // Prefer the proposal-level project link
            if (selectedProjectId) return selectedProjectId
            // Fall back: scan existing SRS blocks for a projectId
            const srsBlock = proposal?.blocks?.find(b => b.content?.projectId)
            return srsBlock?.content?.projectId || null
          })()}
          defaultVersionId={(() => {
            // Prefer the proposal-level srs_version field
            if (proposal?.srs_version) {
              const parts = proposal.srs_version.split(' v')
              if (parts.length >= 2) {
                const type = parts[0].trim()
                const version = parts.slice(1).join(' v').trim()
                const match = srsVersions.find(v => v.type === type && v.version === version)
                if (match) return match.id
              }
            }
            // Fall back: scan existing SRS blocks for srsVersionId
            const srsBlock = proposal?.blocks?.find(b => b.content?.srsVersionId)
            return srsBlock?.content?.srsVersionId || null
          })()}
        />
      )}

      {/* Versions Modal */}
      {showVersions && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#1e293b', borderRadius: 16, padding: 24, width: 480, border: '1px solid #334155', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ color: '#f1f5f9', margin: 0 }}>Version History <span style={{ color: '#7c3aed', fontSize: 13 }}>({versionCount})</span></h3>
              <button onClick={() => setShowVersions(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>
            {versions.length === 0 ? (
              <div style={{ color: '#64748b', fontSize: 13, textAlign: 'center', padding: 20 }}>No versions saved yet. Click "Save Version" to create one.</div>
            ) : (
              <div>
                {[...versions].reverse().map(v => {
                  const blocks = v.blocks || []
                  const firstType = blocks[0]?.type || 'empty'
                  return (
                    <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #0f172a' }}>
                      <div>
                        <div style={{ color: '#f1f5f9', fontSize: 13 }}>
                          Version #{v.id} <span style={{ color: '#7c3aed', fontSize: 11 }}>{blocks.length} blocks</span>
                        </div>
                        <div style={{ color: '#64748b', fontSize: 11 }}>
                          {new Date(v.created_at).toLocaleString()} · starts with <span style={{ color: '#94a3b8' }}>{firstType}</span>
                        </div>
                      </div>
                      <button onClick={() => handleRestoreVersion(v.id)} style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}>Restore</button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
