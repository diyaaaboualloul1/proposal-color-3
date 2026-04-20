import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import apiClient from '../../api/client'
import Modal from '../../components/Modal'

const STATUS_OPTIONS = ['active', 'completed', 'archived']

const STATUS_COLORS = {
  active: '#22c55e',
  completed: '#F47B20',
  archived: '#475569',
}

export default function Overview({ project, onUpdate }) {
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    name: project.name || '',
    client_name: project.client_name || '',
    client_contact: project.client_contact || '',
    description: project.description || '',
    status: project.status || 'active',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Share state — versioned links
  const [shareLinks, setShareLinks] = useState([])
  const [shareVersions, setShareVersions] = useState({ technical: [], client: [] })
  const [loadingLinks, setLoadingLinks] = useState(true)
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [linkType, setLinkType] = useState('technical')
  const [linkVersion, setLinkVersion] = useState('')
  const [creatingLink, setCreatingLink] = useState(false)
  const [newLinkUrl, setNewLinkUrl] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const fetchShareData = async () => {
      try {
        const [linksRes, versionsRes] = await Promise.all([
          apiClient.get(`/projects/${project.id}/share-links`),
          apiClient.get(`/projects/${project.id}/srs`)
        ])
        setShareLinks(linksRes.data.links || [])
        setShareVersions({
          technical: (versionsRes.data.versions || []).filter(v => v.type === 'technical').map(v => v.version),
          client: (versionsRes.data.versions || []).filter(v => v.type === 'client').map(v => v.version)
        })
      } catch {
        setShareLinks([])
      } finally {
        setLoadingLinks(false)
      }
    }
    fetchShareData()
  }, [project.id])

  const handleGenerateLink = async () => {
    if (!linkVersion) return
    setCreatingLink(true)
    try {
      const res = await apiClient.post(`/projects/${project.id}/share-links`, {
        srs_type: linkType,
        srs_version: linkVersion
      })
      setNewLinkUrl(res.data.shareUrl)
      const linksRes = await apiClient.get(`/projects/${project.id}/share-links`)
      setShareLinks(linksRes.data.links || [])
    } catch {
    } finally {
      setCreatingLink(false)
    }
  }

  const handleToggleLink = async (link) => {
    try {
      await apiClient.patch(`/projects/${project.id}/share-links/${link.id}`)
      setShareLinks(prev => prev.map(l => l.id === link.id ? { ...l, status: l.status === 'active' ? 'revoked' : 'active' } : l))
    } catch {}
  }

  const handleDeleteLink = async (linkId) => {
    try {
      await apiClient.delete(`/projects/${project.id}/share-links/${linkId}`)
      setShareLinks(prev => prev.filter(l => l.id !== linkId))
    } catch {}
  }

  const handleCopy = (text) => {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text)
    } else {
      const el = document.createElement('textarea')
      el.value = text; el.style.position = 'fixed'; el.style.opacity = '0'
      document.body.appendChild(el); el.focus(); el.select()
      document.execCommand('copy'); document.body.removeChild(el)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const openLinkModal = () => {
    setLinkType('technical')
    setLinkVersion(shareVersions.technical[0] || '')
    setNewLinkUrl('')
    setShowLinkModal(true)
  }

  // Delete flow state
  const [deleteStep, setDeleteStep] = useState(0) // 0=hidden, 1=confirm, 2=type name
  const [deleteInput, setDeleteInput] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      await apiClient.put(`/projects/${project.id}`, form)
      setEditing(false)
      onUpdate()
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save changes.')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setForm({
      name: project.name || '',
      client_name: project.client_name || '',
      client_contact: project.client_contact || '',
      description: project.description || '',
      status: project.status || 'active',
    })
    setEditing(false)
    setError('')
  }

  const handleDeleteConfirm = async () => {
    if (deleteInput !== project.name) return
    setDeleting(true)
    try {
      await apiClient.delete(`/projects/${project.id}`)
      navigate('/')
    } catch (err) {
      setDeleteError(err.response?.data?.message || 'Failed to delete project.')
      setDeleting(false)
    }
  }

  const resetDelete = () => {
    setDeleteStep(0)
    setDeleteInput('')
    setDeleteError('')
  }

  const formatDate = (d) => {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  }

  const inputStyle = {
    width: '100%',
    padding: '8px 12px',
    backgroundColor: '#0f1117',
    border: '1px solid #1e2533',
    borderRadius: '10px',
    color: '#f1f5f9',
    fontSize: '0.875rem',
    outline: 'none',
    transition: 'all 0.2s'
  }

  const onFocus = e => { e.target.style.borderColor = '#F47B20'; e.target.style.boxShadow = '0 0 0 3px rgba(244,123,32,0.1)' }
  const onBlur = e => { e.target.style.borderColor = '#1e2533'; e.target.style.boxShadow = 'none' }

  const nameMatches = deleteInput === project.name

  const FieldRow = ({ label, name, value, type = 'text', isTextarea = false, isSelect = false }) => (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 py-4" style={{ borderBottom: '1px solid #1e2533' }}>
      <label className="text-xs font-semibold uppercase tracking-wider w-40 flex-shrink-0" style={{ color: '#475569' }}>
        {label}
      </label>
      <div className="flex-1">
        {editing ? (
          isSelect ? (
            <select
              name={name}
              value={form[name]}
              onChange={handleChange}
              style={{ ...inputStyle, backgroundColor: '#0f1117' }}
              onFocus={onFocus}
              onBlur={onBlur}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s} style={{ backgroundColor: '#0f1117' }}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          ) : isTextarea ? (
            <textarea
              name={name}
              value={form[name]}
              onChange={handleChange}
              rows={3}
              style={{ ...inputStyle, resize: 'none' }}
              onFocus={onFocus}
              onBlur={onBlur}
            />
          ) : (
            <input
              type={type}
              name={name}
              value={form[name]}
              onChange={handleChange}
              style={inputStyle}
              onFocus={onFocus}
              onBlur={onBlur}
            />
          )
        ) : (
          <div className="flex items-center gap-2">
            {name === 'status' ? (
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                style={{
                  backgroundColor: `${STATUS_COLORS[project.status]}18`,
                  border: `1px solid ${STATUS_COLORS[project.status]}35`,
                  color: STATUS_COLORS[project.status]
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: STATUS_COLORS[project.status] }}
                />
                {project.status?.charAt(0).toUpperCase() + project.status?.slice(1)}
              </span>
            ) : (
              <p className="text-sm" style={{ color: value || project[name] ? '#f1f5f9' : '#334155' }}>
                {value || project[name] || '—'}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )

  return (
    <motion.div
      className="p-6 max-w-2xl"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-base font-semibold" style={{ color: '#f1f5f9' }}>Project Details</h2>
          <p className="text-xs mt-0.5" style={{ color: '#475569' }}>View and edit project information</p>
        </div>
        <AnimatePresence mode="wait">
          {!editing ? (
            <motion.button
              key="edit"
              onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl transition-all"
              style={{ color: '#94a3b8', border: '1px solid #1e2533' }}
              whileHover={{ backgroundColor: '#161b27', color: '#f1f5f9', borderColor: '#2d3748' }}
              whileTap={{ scale: 0.95 }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit
            </motion.button>
          ) : (
            <motion.div
              key="actions"
              className="flex items-center gap-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.button
                onClick={handleCancel}
                className="px-3 py-1.5 text-xs font-medium rounded-xl transition-colors"
                style={{ color: '#94a3b8', border: '1px solid #1e2533' }}
                whileHover={{ color: '#f1f5f9', borderColor: '#2d3748' }}
                whileTap={{ scale: 0.95 }}
              >
                Cancel
              </motion.button>
              <motion.button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white rounded-xl disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #F47B20, #D4680A)' }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
              >
                {saving && <span className="w-3 h-3 rounded-full border border-white/30 border-t-white animate-spin" />}
                {saving ? 'Saving...' : 'Save Changes'}
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div
            className="mb-4 p-3 rounded-xl flex items-start gap-2"
            style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <p className="text-sm" style={{ color: '#fca5a5' }}>{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        className="rounded-2xl overflow-hidden"
        style={{ backgroundColor: '#0f1117', border: '1px solid #1e2533' }}
      >
        <div className="px-5">
          <FieldRow label="Project Name" name="name" />
          <FieldRow label="Status" name="status" isSelect />
          <FieldRow label="Client Name" name="client_name" />
          <FieldRow label="Client Contact" name="client_contact" />
          <FieldRow label="Description" name="description" isTextarea />

          <div className="flex flex-col sm:flex-row sm:items-center gap-2 py-4" style={{ borderBottom: '1px solid #1e2533' }}>
            <label className="text-xs font-semibold uppercase tracking-wider w-40 flex-shrink-0" style={{ color: '#475569' }}>
              Created
            </label>
            <p className="text-sm" style={{ color: '#94a3b8' }}>{formatDate(project.created_at)}</p>
          </div>

          {project.created_by_name && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 py-4">
              <label className="text-xs font-semibold uppercase tracking-wider w-40 flex-shrink-0" style={{ color: '#475569' }}>
                Created By
              </label>
              <div className="flex items-center gap-2">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{ backgroundColor: 'rgba(244,123,32,0.15)', color: '#F59340', border: '1px solid rgba(244,123,32,0.25)' }}
                >
                  {project.created_by_name.charAt(0).toUpperCase()}
                </div>
                <p className="text-sm" style={{ color: '#94a3b8' }}>{project.created_by_name}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Share Section */}
      <div className="mt-6 p-5 rounded-2xl" style={{ backgroundColor: '#0f1117', border: '1px solid #1e2533' }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="#F47B20" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            <h3 className="text-sm font-semibold" style={{ color: '#f1f5f9' }}>Share Links</h3>
          </div>
          <motion.button
            onClick={openLinkModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, #F47B20, #D4680A)' }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Generate Link
          </motion.button>
        </div>

        {loadingLinks ? (
          <div className="space-y-2">
            <div className="skeleton h-4 w-full rounded" />
            <div className="skeleton h-4 w-3/4 rounded" />
          </div>
        ) : shareLinks.length === 0 ? (
          <p className="text-xs" style={{ color: '#475569' }}>No share links yet — generate one above</p>
        ) : (
          <div className="space-y-1.5">
            <div className="grid grid-cols-12 gap-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color: '#475569' }}>
              <div className="col-span-2">Type</div>
              <div className="col-span-2">Version</div>
              <div className="col-span-4">Link</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-2 text-right">Actions</div>
            </div>
            {shareLinks.map(link => (
              <div key={link.id} className="grid grid-cols-12 gap-2 items-center px-3 py-2 rounded-xl" style={{ backgroundColor: '#161b27', border: '1px solid #1e2533' }}>
                <div className="col-span-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" style={{
                    backgroundColor: link.srs_type === 'client' ? 'rgba(20,184,166,0.1)' : 'rgba(244,123,32,0.1)',
                    border: `1px solid ${link.srs_type === 'client' ? 'rgba(20,184,166,0.2)' : 'rgba(244,123,32,0.2)'}`,
                    color: link.srs_type === 'client' ? '#14b8a6' : '#F47B20'
                  }}>
                    {link.srs_type === 'client' ? 'Client Summary' : 'Detailed SRS'}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-xs font-mono" style={{ color: '#94a3b8' }}>{link.srs_version}</span>
                </div>
                <div className="col-span-4 flex items-center gap-1.5">
                  <input
                    type="text"
                    readOnly
                    value={link.shareUrl || `${window.location.origin}/share/${link.token}`}
                    className="flex-1 text-xs px-2 py-1 rounded-lg outline-none truncate"
                    style={{ backgroundColor: '#0f1117', border: '1px solid #1e2533', color: '#64748b', fontFamily: 'monospace' }}
                  />
                  <motion.button
                    onClick={() => handleCopy(link.shareUrl || `${window.location.origin}/share/${link.token}`)}
                    className="flex-shrink-0 px-2 py-1 rounded-lg text-xs"
                    style={{ backgroundColor: '#0f1117', border: '1px solid #1e2533', color: '#94a3b8' }}
                    whileTap={{ scale: 0.92 }}
                  >
                    {copied ? '✓' : '📋'}
                  </motion.button>
                </div>
                <div className="col-span-2">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{
                    backgroundColor: link.status === 'active' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                    border: `1px solid ${link.status === 'active' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
                    color: link.status === 'active' ? '#22c55e' : '#ef4444'
                  }}>
                    <span className={`w-1.5 h-1.5 rounded-full ${link.status === 'active' ? 'bg-green-400' : 'bg-red-400'}`} />
                    {link.status === 'active' ? 'Active' : 'Revoked'}
                  </span>
                </div>
                <div className="col-span-2 flex items-center justify-end gap-1.5">
                  <motion.button
                    onClick={() => handleToggleLink(link)}
                    title={link.status === 'active' ? 'Revoke' : 'Activate'}
                    className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors"
                    style={{ border: '1px solid #1e2533', color: '#64748b' }}
                    whileHover={{ backgroundColor: link.status === 'active' ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)', color: link.status === 'active' ? '#f87171' : '#4ade80', borderColor: link.status === 'active' ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)' }}
                    whileTap={{ scale: 0.92 }}
                  >
                    {link.status === 'active' ? (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                  </motion.button>
                  <motion.button
                    onClick={() => handleDeleteLink(link.id)}
                    title="Delete link"
                    className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors"
                    style={{ border: '1px solid #1e2533', color: '#475569' }}
                    whileHover={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#f87171', borderColor: 'rgba(239,68,68,0.3)' }}
                    whileTap={{ scale: 0.92 }}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </motion.button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {showLinkModal && (
          <Modal isOpen={showLinkModal} onClose={() => setShowLinkModal(false)}>
            <div className="space-y-5 w-80">
              <h2 className="text-base font-bold" style={{ color: '#f1f5f9' }}>Generate Share Link</h2>

              {!newLinkUrl ? (
                <>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#475569' }}>1. Choose Type</label>
                    <div className="grid grid-cols-2 gap-2">
                      <motion.button
                        onClick={() => { setLinkType('technical'); setLinkVersion(shareVersions.technical[0] || '') }}
                        className="flex flex-col items-center gap-1.5 p-3 rounded-xl text-sm font-medium"
                        style={{
                          backgroundColor: linkType === 'technical' ? 'rgba(244,123,32,0.12)' : '#161b27',
                          border: `2px solid ${linkType === 'technical' ? '#F47B20' : '#1e2533'}`,
                          color: linkType === 'technical' ? '#F47B20' : '#64748b'
                        }}
                        whileTap={{ scale: 0.97 }}
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Detailed SRS
                      </motion.button>
                      <motion.button
                        onClick={() => { setLinkType('client'); setLinkVersion(shareVersions.client[0] || '') }}
                        className="flex flex-col items-center gap-1.5 p-3 rounded-xl text-sm font-medium"
                        style={{
                          backgroundColor: linkType === 'client' ? 'rgba(20,184,166,0.12)' : '#161b27',
                          border: `2px solid ${linkType === 'client' ? '#14b8a6' : '#1e2533'}`,
                          color: linkType === 'client' ? '#14b8a6' : '#64748b'
                        }}
                        whileTap={{ scale: 0.97 }}
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 10H5m4 0v2c0 .656.126 1.283.356 1.857M7 10v2c0 .656.126 1.283.356 1.857m4 0V10" />
                        </svg>
                        Client Summary
                      </motion.button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#475569' }}>2. Choose Version</label>
                    <select
                      value={linkVersion}
                      onChange={e => setLinkVersion(e.target.value)}
                      style={{ width: '100%', padding: '8px 12px', backgroundColor: '#161b27', border: '1px solid #1e2533', borderRadius: '10px', color: '#f1f5f9', fontSize: '0.875rem', outline: 'none' }}
                    >
                      {(linkType === 'technical' ? shareVersions.technical : shareVersions.client).map(v => (
                        <option key={v} value={v} style={{ backgroundColor: '#161b27' }}>{v}</option>
                      ))}
                    </select>
                    {(linkType === 'technical' ? shareVersions.technical : shareVersions.client).length === 0 && (
                      <p className="text-xs" style={{ color: '#ef4444' }}>No {linkType === 'client' ? 'client summaries' : 'technical versions'} available</p>
                    )}
                  </div>

                  <motion.button
                    onClick={handleGenerateLink}
                    disabled={!linkVersion || creatingLink}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
                    style={{ background: 'linear-gradient(135deg, #F47B20, #D4680A)' }}
                    whileTap={{ scale: 0.97 }}
                  >
                    {creatingLink && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />}
                    {creatingLink ? 'Generating...' : 'Generate Link'}
                  </motion.button>
                </>
              ) : (
                <>
                  <p className="text-xs" style={{ color: '#22c55e' }}>
                    ✅ Share link created for <span className="font-mono font-semibold">{linkType === 'client' ? 'Client Summary' : 'Detailed SRS'} {linkVersion}</span>
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={newLinkUrl}
                      className="flex-1 text-xs px-3 py-2 rounded-xl outline-none"
                      style={{ backgroundColor: '#161b27', border: '1px solid #1e2533', color: '#94a3b8', fontFamily: 'monospace' }}
                    />
                    <motion.button
                      onClick={() => handleCopy(newLinkUrl)}
                      className="px-3 py-2 rounded-xl text-xs font-semibold"
                      style={{
                        backgroundColor: copied ? 'rgba(34,197,94,0.12)' : 'rgba(244,123,32,0.12)',
                        border: `1px solid ${copied ? 'rgba(34,197,94,0.3)' : 'rgba(244,123,32,0.3)'}`,
                        color: copied ? '#22c55e' : '#F47B20'
                      }}
                      whileTap={{ scale: 0.95 }}
                    >
                      {copied ? '✓ Copied!' : 'Copy'}
                    </motion.button>
                  </div>
                  <div className="flex gap-2">
                    <motion.button
                      onClick={() => setShowLinkModal(false)}
                      className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold"
                      style={{ backgroundColor: '#161b27', border: '1px solid #1e2533', color: '#94a3b8' }}
                      whileTap={{ scale: 0.97 }}
                    >
                      Done
                    </motion.button>
                    <motion.button
                      onClick={() => setNewLinkUrl('')}
                      className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold"
                      style={{ backgroundColor: 'rgba(244,123,32,0.1)', border: '1px solid rgba(244,123,32,0.2)', color: '#F47B20' }}
                      whileTap={{ scale: 0.97 }}
                    >
                      Create Another
                    </motion.button>
                  </div>
                </>
              )}
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Delete Project Button — bottom of overview, separated */}
      <div className="mt-8 pt-6" style={{ borderTop: '1px solid #1e2533' }}>
        <motion.button
          onClick={() => setDeleteStep(1)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-all"
          style={{
            color: '#ef4444',
            border: '1px solid rgba(239,68,68,0.3)',
            backgroundColor: 'transparent',
          }}
          whileHover={{ backgroundColor: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.5)' }}
          whileTap={{ scale: 0.97 }}
        >
          🗑 Delete Project
        </motion.button>
      </div>

      {/* Delete Modal — Step 2: First confirmation */}
      <Modal
        isOpen={deleteStep === 1}
        onClose={resetDelete}
        title="Delete Project?"
        maxWidth="max-w-md"
      >
        {/* Warning box */}
        <div
          className="p-4 rounded-xl mb-5"
          style={{
            backgroundColor: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.25)',
          }}
        >
          <p className="text-sm leading-relaxed" style={{ color: '#fca5a5' }}>
            This action is permanent and cannot be undone. All files, SRS versions, questionnaire data, and chat history will be deleted forever.
          </p>
        </div>
        <div className="flex items-center gap-3 justify-end">
          <motion.button
            onClick={resetDelete}
            className="px-4 py-2 text-sm font-medium rounded-xl transition-colors"
            style={{ color: '#94a3b8', border: '1px solid #1e2533' }}
            whileHover={{ color: '#f1f5f9', borderColor: '#2d3748' }}
            whileTap={{ scale: 0.95 }}
          >
            Cancel
          </motion.button>
          <motion.button
            onClick={() => setDeleteStep(2)}
            className="px-4 py-2 text-sm font-medium rounded-xl text-white"
            style={{ backgroundColor: '#ef4444', border: '1px solid rgba(239,68,68,0.5)' }}
            whileHover={{ backgroundColor: '#dc2626' }}
            whileTap={{ scale: 0.97 }}
          >
            Yes, Continue
          </motion.button>
        </div>
      </Modal>

      {/* Delete Modal — Step 3: Type project name */}
      <Modal
        isOpen={deleteStep === 2}
        onClose={resetDelete}
        title="Delete Project?"
        maxWidth="max-w-md"
      >
        <p className="text-sm mb-1" style={{ color: '#94a3b8' }}>
          To confirm, type the project name:{' '}
          <span className="font-semibold" style={{ color: '#f1f5f9' }}>{project.name}</span>
        </p>
        <input
          type="text"
          value={deleteInput}
          onChange={e => { setDeleteInput(e.target.value); setDeleteError('') }}
          placeholder={project.name}
          className="mt-3 mb-4"
          style={{
            ...inputStyle,
            borderColor: deleteInput.length === 0
              ? '#1e2533'
              : nameMatches
                ? '#22c55e'
                : '#ef4444',
            boxShadow: deleteInput.length === 0
              ? 'none'
              : nameMatches
                ? '0 0 0 3px rgba(34,197,94,0.1)'
                : '0 0 0 3px rgba(239,68,68,0.1)',
          }}
          autoFocus
        />

        {deleteError && (
          <p className="text-xs mb-3" style={{ color: '#fca5a5' }}>{deleteError}</p>
        )}

        <div className="flex items-center gap-3 justify-end">
          <motion.button
            onClick={resetDelete}
            className="px-4 py-2 text-sm font-medium rounded-xl transition-colors"
            style={{ color: '#94a3b8', border: '1px solid #1e2533' }}
            whileHover={{ color: '#f1f5f9', borderColor: '#2d3748' }}
            whileTap={{ scale: 0.95 }}
          >
            Cancel
          </motion.button>
          <motion.button
            onClick={handleDeleteConfirm}
            disabled={!nameMatches || deleting}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl text-white disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              backgroundColor: nameMatches ? '#ef4444' : '#374151',
              border: `1px solid ${nameMatches ? 'rgba(239,68,68,0.5)' : '#374151'}`,
              transition: 'all 0.2s',
            }}
            whileHover={nameMatches ? { backgroundColor: '#dc2626' } : {}}
            whileTap={nameMatches ? { scale: 0.97 } : {}}
          >
            {deleting && <span className="w-3 h-3 rounded-full border border-white/30 border-t-white animate-spin" />}
            {deleting ? 'Deleting...' : 'Delete Forever'}
          </motion.button>
        </div>
      </Modal>
    </motion.div>
  )
}
