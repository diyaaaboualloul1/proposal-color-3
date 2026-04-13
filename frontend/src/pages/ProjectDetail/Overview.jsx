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

  // Share state
  const [shareInfo, setShareInfo] = useState(null) // {hasShare, token, shareUrl}
  const [generatingShare, setGeneratingShare] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const fetchShareInfo = async () => {
      try {
        const res = await apiClient.get(`/projects/${project.id}/share`)
        setShareInfo(res.data)
      } catch {
        setShareInfo({ hasShare: false })
      }
    }
    fetchShareInfo()
  }, [project.id])

  const handleGenerateShare = async () => {
    setGeneratingShare(true)
    try {
      const res = await apiClient.post(`/projects/${project.id}/share`)
      setShareInfo({ hasShare: true, ...res.data })
    } catch {
      // ignore
    } finally {
      setGeneratingShare(false)
    }
  }

  const handleRevoke = async () => {
    try {
      await apiClient.delete(`/projects/${project.id}/share`)
      setShareInfo({ hasShare: false })
    } catch {
      // ignore
    }
  }

  const handleCopy = () => {
    if (!shareInfo?.shareUrl) return
    // Fallback for non-HTTPS environments where clipboard API is blocked
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(shareInfo.shareUrl)
    } else {
      const el = document.createElement('textarea')
      el.value = shareInfo.shareUrl
      el.style.position = 'fixed'
      el.style.opacity = '0'
      document.body.appendChild(el)
      el.focus()
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
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
        <div className="flex items-center gap-2 mb-3">
          <svg className="w-4 h-4" fill="none" stroke="#F47B20" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
          <h3 className="text-sm font-semibold" style={{ color: '#f1f5f9' }}>Share this SRS</h3>
        </div>

        {shareInfo === null ? (
          <div className="flex items-center gap-2">
            <div className="skeleton h-4 w-32 rounded" />
          </div>
        ) : shareInfo.hasShare ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xs" style={{ color: '#64748b' }}>Anyone with this link can view the SRS (read-only, no login required)</p>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: 'rgba(244,123,32,0.1)', border: '1px solid rgba(244,123,32,0.2)', color: '#F47B20' }}>
                📄 Always shows latest version
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={shareInfo.shareUrl || ''}
                className="flex-1 text-xs px-3 py-2 rounded-xl outline-none"
                style={{
                  backgroundColor: '#161b27',
                  border: '1px solid #1e2533',
                  color: '#94a3b8',
                  fontFamily: 'monospace'
                }}
              />
              <motion.button
                onClick={handleCopy}
                className="px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap"
                style={{
                  backgroundColor: copied ? 'rgba(34,197,94,0.12)' : 'rgba(244,123,32,0.12)',
                  border: `1px solid ${copied ? 'rgba(34,197,94,0.3)' : 'rgba(244,123,32,0.3)'}`,
                  color: copied ? '#22c55e' : '#F47B20',
                  minWidth: '70px'
                }}
                whileTap={{ scale: 0.95 }}
              >
                {copied ? '✓ Copied!' : 'Copy'}
              </motion.button>
              <motion.button
                onClick={handleRevoke}
                className="px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap"
                style={{
                  backgroundColor: 'transparent',
                  border: '1px solid rgba(239,68,68,0.3)',
                  color: '#ef4444'
                }}
                whileHover={{ backgroundColor: 'rgba(239,68,68,0.06)' }}
                whileTap={{ scale: 0.95 }}
              >
                Revoke
              </motion.button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs" style={{ color: '#64748b' }}>No share link — generate one to share this SRS with clients</p>
            <motion.button
              onClick={handleGenerateShare}
              disabled={generatingShare}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg, #F47B20, #D4680A)' }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
            >
              {generatingShare && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />}
              {generatingShare ? 'Generating...' : 'Generate Link'}
            </motion.button>
          </div>
        )}
      </div>

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
