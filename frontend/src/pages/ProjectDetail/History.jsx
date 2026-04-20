import { useState, useEffect, useCallback } from 'react'
import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import apiClient from '../../api/client'
import { useAuth } from '../../contexts/AuthContext'

const rowVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: (i) => ({ opacity: 1, y: 0, transition: { delay: i * 0.04 } })
}

// Helper: build download filename from project name + version
function makeFilename(projectName, version, ext) {
  const slug = (projectName || 'SRS')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim().replace(/\s+/g, '-').replace(/-+/g, '-').substring(0, 40).replace(/-$/, '');
  return `${slug}-v${version}.${ext}`;
}

export default function History({ projectId, project }) {
  const { user, isSuperAdmin } = useAuth()
  const [versions, setVersions] = useState([])
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(null)
  const [downloadingMd, setDownloadingMd] = useState(null)
  const [downloadingDocx, setDownloadingDocx] = useState(null)
  const [exportingJson, setExportingJson] = useState(null)
  const [error, setError] = useState('')
  const [toast, setToast] = useState(null)

  // Delete state
  const [deleteConfirm, setDeleteConfirm] = useState(null) // version object to delete
  const [deleting, setDeleting] = useState(null)

  // Drive upload state — map of version string → { uploading, shareUrl, error }
  const [driveStatuses, setDriveStatuses] = useState({})

  // Client sub-row expand/collapse
  const [expandedParents, setExpandedParents] = useState({})
  const toggleExpand = (v) => setExpandedParents(prev => ({ ...prev, [v]: !prev[v] }))

  // Group client versions under their technical parent version
  const grouped = {}
  const technicalRows = []
  for (const v of versions) {
    if (v.type === 'client') {
      const parent = v.parent_version || ''
      if (!grouped[parent]) grouped[parent] = []
      grouped[parent].push(v)
    } else {
      technicalRows.push(v)
    }
  }

  const canDelete = isSuperAdmin() || (user && project && project.created_by === user.id)
  const canUploadDrive = isSuperAdmin() || (user && project && project.created_by === user.id)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  // Diff state
  const [diffV1, setDiffV1] = useState('')
  const [diffV2, setDiffV2] = useState('')
  const [diffResult, setDiffResult] = useState(null)
  const [diffEditTitle, setDiffEditTitle] = useState(null)
  const [loadingDiff, setLoadingDiff] = useState(false)
  const [showUnchanged, setShowUnchanged] = useState(true)
  const [diffStats, setDiffStats] = useState(null)

  const fetchVersions = useCallback(async () => {
    try {
      const res = await apiClient.get(`/projects/${projectId}/srs`)
      setVersions(res.data.versions || res.data || [])
    } catch {
      setError('Failed to load version history.')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    fetchVersions()
  }, [fetchVersions])

  const handleDownloadMd = async (versionId, versionNumber) => {
    setDownloadingMd(versionId)
    try {
      const token = localStorage.getItem('srs_token')
      const baseURL = import.meta.env.VITE_API_URL || '/api'
      const url = `${baseURL}/projects/${projectId}/srs/${versionId}/download-md`
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Download failed')
      const blob = await res.blob()
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = makeFilename(project?.name, versionNumber || 'latest', 'md')
      link.click()
      URL.revokeObjectURL(link.href)
    } catch {
      setError('Failed to download Markdown.')
    } finally {
      setDownloadingMd(null)
    }
  }

  const handleDownload = async (versionId, versionNumber) => {
    setDownloading(versionId)
    try {
      const token = localStorage.getItem('srs_token')
      const baseURL = import.meta.env.VITE_API_URL || '/api'
      const url = `${baseURL}/projects/${projectId}/srs/${versionId}/download`
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Download failed')
      const blob = await res.blob()
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = makeFilename(project?.name, versionNumber || 'latest', 'pdf')
      link.click()
      URL.revokeObjectURL(link.href)
    } catch {
      setError('Failed to download PDF.')
    } finally {
      setDownloading(null)
    }
  }

  const handleDownloadDocx = async (versionId, versionNumber) => {
    setDownloadingDocx(versionId)
    try {
      const token = localStorage.getItem('srs_token')
      const baseURL = import.meta.env.VITE_API_URL || '/api'
      const url = `${baseURL}/projects/${projectId}/srs/${versionId}/download-docx`
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error('Download failed')
      const blob = await res.blob()
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = makeFilename(project?.name, versionNumber || 'latest', 'docx')
      link.click()
      URL.revokeObjectURL(link.href)
    } catch {
      setError('Failed to download DOCX.')
    } finally {
      setDownloadingDocx(null)
    }
  }

  const handleExportJson = async (versionId, versionNumber) => {
    setExportingJson(versionId)
    try {
      const token = localStorage.getItem('srs_token')
      const baseURL = import.meta.env.VITE_API_URL || '/api'
      const url = `${baseURL}/projects/${projectId}/srs/${versionId}/export-json`
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error('Export failed')
      const data = await res.json()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = makeFilename(project?.name, versionNumber || 'latest', 'json')
      link.click()
      URL.revokeObjectURL(link.href)
    } catch {
      setError('Failed to export JSON.')
    } finally {
      setExportingJson(null)
    }
  }

  const handleCompare = async () => {
    if (!diffV1 || !diffV2) { setError('Please select two versions to compare.'); return }
    if (diffV1 === diffV2) { setError('Please select two different versions.'); return }
    setLoadingDiff(true)
    setDiffResult(null)
    setDiffEditTitle(null)
    setDiffStats(null)
    try {
      const res = await apiClient.get(`/projects/${projectId}/srs/diff?v1=${diffV1}&v2=${diffV2}`)
      const diff = res.data.diff
      setDiffResult(diff)
      setDiffEditTitle(res.data.editTitle || null)
      // Compute stats
      const added = diff.filter(d => d.type === 'added').reduce((a, d) => a + d.value.split('\n').filter(l => l.trim()).length, 0)
      const removed = diff.filter(d => d.type === 'removed').reduce((a, d) => a + d.value.split('\n').filter(l => l.trim()).length, 0)
      const unchanged = diff.filter(d => d.type === 'unchanged').reduce((a, d) => a + d.value.split('\n').filter(l => l.trim()).length, 0)
      setDiffStats({ added, removed, unchanged })
    } catch {
      setError('Failed to load diff. Please try again.')
    } finally {
      setLoadingDiff(false)
    }
  }

  const handleDeleteVersion = async () => {
    if (!deleteConfirm) return
    const version = deleteConfirm.version
    setDeleting(version)
    try {
      await apiClient.delete(`/projects/${projectId}/srs/${version}`)
      setVersions(prev => prev.filter(v => v.version !== version))
      showToast(`Version v${version} deleted successfully.`, 'success')
    } catch {
      showToast('Failed to delete version. Please try again.', 'error')
    } finally {
      setDeleting(null)
      setDeleteConfirm(null)
    }
  }

  const handleUploadToDrive = async (version) => {
    setDriveStatuses(prev => ({ ...prev, [version]: { uploading: true, shareUrl: null, error: null } }))
    try {
      const res = await apiClient.post(`/projects/${projectId}/srs/${version}/upload-to-drive`)
      const shareUrl = res.data.driveShareUrl || res.data.shareUrl
      setVersions(prev => prev.map(v =>
        v.version === version
          ? { ...v, drive_share_url: shareUrl }
          : v
      ))
      setDriveStatuses(prev => ({
        ...prev,
        [version]: { uploading: false, shareUrl, error: null }
      }))
      showToast('Uploaded to Google Drive!', 'success')
    } catch (err) {
      const errMsg = err.response?.data?.error || 'Upload failed. Please try again.'
      setDriveStatuses(prev => ({
        ...prev,
        [version]: { uploading: false, shareUrl: null, error: errMsg }
      }))
      showToast(errMsg, 'error')
    }
  }

  const formatDate = (d) => {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  }

  const SOURCE_COLORS = {
    ai: { bg: 'rgba(139,92,246,0.1)', border: 'rgba(139,92,246,0.25)', color: '#a78bfa' },
    chat: { bg: 'rgba(244,123,32,0.1)', border: 'rgba(244,123,32,0.25)', color: '#F59340' },
    manual: { bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.25)', color: '#22c55e' },
  }

  // Render diff lines
  const renderDiff = (diff) => {
    if (!diff || !Array.isArray(diff)) return null
    const filtered = showUnchanged ? diff : diff.filter(item => item.type !== 'unchanged')
    let lineNum = 0

    return filtered.flatMap((item, idx) => {
      const isAdded = item.type === 'added'
      const isRemoved = item.type === 'removed'
      const isUnchanged = item.type === 'unchanged'
      const lines = (item.value || '').split('\n').filter(l => l.length > 0)

      return lines.map((line, lineIdx) => {
        lineNum++
        return (
          <motion.div
            key={`${idx}-${lineIdx}`}
            initial={{ opacity: 0, x: isAdded ? -4 : isRemoved ? 4 : 0 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: Math.min(lineNum * 0.005, 0.3) }}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 0,
              backgroundColor: isAdded ? 'rgba(34,197,94,0.07)' : isRemoved ? 'rgba(239,68,68,0.07)' : 'transparent',
              borderLeft: isAdded ? '3px solid #22c55e' : isRemoved ? '3px solid #ef4444' : '3px solid transparent',
            }}
          >
            {/* Sign column */}
            <span style={{
              width: 28,
              flexShrink: 0,
              textAlign: 'center',
              fontFamily: 'monospace',
              fontSize: 12,
              fontWeight: 700,
              paddingTop: 2,
              color: isAdded ? '#22c55e' : isRemoved ? '#ef4444' : '#1e2533',
              userSelect: 'none',
            }}>
              {isAdded ? '+' : isRemoved ? '−' : ' '}
            </span>
            {/* Line content */}
            <span style={{
              flex: 1,
              fontFamily: 'monospace',
              fontSize: 12,
              padding: '2px 12px 2px 4px',
              color: isAdded ? '#86efac' : isRemoved ? '#fca5a5' : '#475569',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              lineHeight: 1.6,
            }}>
              {line}
            </span>
          </motion.div>
        )
      })
    })
  }

  return (
    <motion.div
      className="p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="mb-5">
        <h2 className="text-base font-semibold" style={{ color: '#f1f5f9' }}>Version History</h2>
        <p className="text-xs mt-0.5" style={{ color: '#475569' }}>All generated SRS versions</p>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div
            className="mb-4 p-3 rounded-xl"
            style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <p className="text-sm" style={{ color: '#fca5a5' }}>{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl flex items-center gap-3 shadow-xl"
            style={{
              backgroundColor: toast.type === 'success' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
              border: `1px solid ${toast.type === 'success' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
              backdropFilter: 'blur(12px)',
              minWidth: '240px'
            }}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
          >
            <span style={{ color: toast.type === 'success' ? '#4ade80' : '#fca5a5', fontSize: '16px' }}>
              {toast.type === 'success' ? '✓' : '✕'}
            </span>
            <span className="text-sm font-medium" style={{ color: toast.type === 'success' ? '#4ade80' : '#fca5a5' }}>
              {toast.msg}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Dialog */}
      <AnimatePresence>
        {deleteConfirm && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !deleting && setDeleteConfirm(null)}
          >
            <motion.div
              className="rounded-2xl p-6 max-w-sm w-full"
              style={{ backgroundColor: '#0f1117', border: '1px solid #1e2533', boxShadow: '0 25px 50px rgba(0,0,0,0.5)' }}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                style={{ backgroundColor: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.2)' }}
              >
                <svg className="w-5 h-5" style={{ color: '#f87171' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <h3 className="text-base font-semibold mb-1" style={{ color: '#f1f5f9' }}>
                Delete version v{deleteConfirm.version}?
              </h3>
              <p className="text-sm mb-5" style={{ color: '#64748b' }}>
                This cannot be undone. The SRS document for v{deleteConfirm.version} will be permanently removed.
              </p>
              <div className="flex gap-3">
                <motion.button
                  onClick={() => setDeleteConfirm(null)}
                  disabled={!!deleting}
                  className="flex-1 py-2 rounded-xl text-sm font-medium disabled:opacity-50"
                  style={{ color: '#64748b', border: '1px solid #1e2533' }}
                  whileHover={{ color: '#94a3b8', borderColor: '#334155' }}
                  whileTap={{ scale: 0.97 }}
                >
                  Cancel
                </motion.button>
                <motion.button
                  onClick={handleDeleteVersion}
                  disabled={!!deleting}
                  className="flex-1 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-60 flex items-center justify-center gap-2"
                  style={{
                    background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                    boxShadow: '0 4px 12px rgba(239,68,68,0.25)'
                  }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                >
                  {deleting ? (
                    <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  )}
                  Delete
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-14 rounded-xl" />)}
        </div>
      ) : versions.length === 0 ? (
        <motion.div
          className="text-center py-20"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
            style={{ backgroundColor: 'rgba(244,123,32,0.06)', border: '1px solid rgba(244,123,32,0.12)' }}
          >
            <svg className="w-7 h-7" style={{ color: '#334155' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold mb-1" style={{ color: '#475569' }}>No versions yet</h3>
          <p className="text-xs" style={{ color: '#334155' }}>
            Submit the questionnaire to generate your first SRS version
          </p>
        </motion.div>
      ) : (
        <>
          {/* Version Compare Panel */}
          {versions.length >= 2 && (
            <motion.div
              className="mb-6 rounded-2xl overflow-hidden"
              style={{ background: '#0a0e1a', border: '1px solid #1e2533' }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {/* Header */}
              <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid #1e2533', background: 'rgba(244,123,32,0.03)' }}>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(244,123,32,0.1)', border: '1px solid rgba(244,123,32,0.2)' }}>
                  <svg className="w-4 h-4" style={{ color: '#F47B20' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-bold" style={{ color: '#f1f5f9' }}>Version Compare</p>
                  <p className="text-xs" style={{ color: '#334155' }}>Select two versions to see what changed</p>
                </div>
              </div>

              {/* Controls */}
              <div className="px-5 py-4">
                <div className="flex items-center gap-3 flex-wrap">
                  {/* V1 Select */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#334155' }}>Base</span>
                    <select
                      value={diffV1}
                      onChange={e => { setDiffV1(e.target.value); setDiffResult(null); setDiffStats(null) }}
                      className="px-3 py-2 text-sm rounded-xl outline-none"
                      style={{ background: '#111827', border: `1px solid ${diffV1 ? 'rgba(244,123,32,0.4)' : '#1e2533'}`, color: diffV1 ? '#f1f5f9' : '#475569', minWidth: 100 }}
                      onFocus={e => { e.target.style.borderColor = '#F47B20' }}
                      onBlur={e => { e.target.style.borderColor = diffV1 ? 'rgba(244,123,32,0.4)' : '#1e2533' }}
                    >
                      <option value="" style={{ background: '#111827' }}>Select…</option>
                      {versions.map(v => <option key={v.version} value={v.version} style={{ background: '#111827' }}>v{v.version}</option>)}
                    </select>
                  </div>

                  {/* Arrow */}
                  <div className="flex items-end pb-1">
                    <motion.div
                      animate={{ x: diffV1 && diffV2 ? [0, 4, 0] : 0 }}
                      transition={{ duration: 1, repeat: diffV1 && diffV2 ? Infinity : 0, repeatDelay: 1 }}
                    >
                      <svg className="w-5 h-5" fill="none" stroke={diffV1 && diffV2 ? '#F47B20' : '#1e2533'} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                      </svg>
                    </motion.div>
                  </div>

                  {/* V2 Select */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#334155' }}>Compare to</span>
                    <select
                      value={diffV2}
                      onChange={e => { setDiffV2(e.target.value); setDiffResult(null); setDiffStats(null) }}
                      className="px-3 py-2 text-sm rounded-xl outline-none"
                      style={{ background: '#111827', border: `1px solid ${diffV2 ? 'rgba(244,123,32,0.4)' : '#1e2533'}`, color: diffV2 ? '#f1f5f9' : '#475569', minWidth: 100 }}
                      onFocus={e => { e.target.style.borderColor = '#F47B20' }}
                      onBlur={e => { e.target.style.borderColor = diffV2 ? 'rgba(244,123,32,0.4)' : '#1e2533' }}
                    >
                      <option value="" style={{ background: '#111827' }}>Select…</option>
                      {versions.map(v => <option key={v.version} value={v.version} style={{ background: '#111827' }}>v{v.version}</option>)}
                    </select>
                  </div>

                  {/* Compare button */}
                  <div className="flex items-end pb-0.5 gap-2">
                    <motion.button
                      onClick={handleCompare}
                      disabled={loadingDiff || !diffV1 || !diffV2}
                      className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-40"
                      style={{ background: 'linear-gradient(135deg, #F47B20, #D4680A)', boxShadow: '0 4px 14px rgba(244,123,32,0.25)' }}
                      whileHover={{ scale: 1.03, boxShadow: '0 6px 20px rgba(244,123,32,0.35)' }}
                      whileTap={{ scale: 0.96 }}
                    >
                      {loadingDiff ? (
                        <>
                          <motion.svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                            animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </motion.svg>
                          Comparing…
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                          </svg>
                          Compare
                        </>
                      )}
                    </motion.button>

                    {diffResult && (
                      <motion.button
                        onClick={() => { setDiffResult(null); setDiffV1(''); setDiffV2(''); setDiffStats(null); setDiffEditTitle(null) }}
                        className="px-3 py-2 rounded-xl text-xs font-semibold"
                        style={{ color: '#475569', border: '1px solid #1e2533' }}
                        whileHover={{ color: '#94a3b8', borderColor: '#334155' }}
                        whileTap={{ scale: 0.96 }}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                      >
                        Clear
                      </motion.button>
                    )}
                  </div>
                </div>
              </div>

              {/* Diff Result */}
              <AnimatePresence>
                {diffResult && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25 }}
                    className="overflow-hidden"
                  >
                    <div style={{ borderTop: '1px solid #1e2533' }}>

                      {/* Diff header */}
                      <div className="px-5 py-3 flex items-start justify-between gap-4 flex-wrap" style={{ background: '#0d1117' }}>
                        <div className="flex-1 min-w-0">
                          {/* Version route */}
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-bold px-2 py-0.5 rounded-lg" style={{ background: 'rgba(244,123,32,0.12)', color: '#F59340', border: '1px solid rgba(244,123,32,0.2)' }}>
                              v{diffV1}
                            </span>
                            <svg className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#334155' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                            </svg>
                            <span className="text-xs font-bold px-2 py-0.5 rounded-lg" style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}>
                              v{diffV2}
                            </span>
                          </div>
                          {/* Edit title */}
                          {diffEditTitle && (
                            <motion.p
                              className="text-xs mt-1"
                              style={{ color: '#64748b' }}
                              initial={{ opacity: 0, y: 4 }}
                              animate={{ opacity: 1, y: 0 }}
                            >
                              <span style={{ color: '#334155' }}>Edit: </span>
                              <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>"{diffEditTitle}"</span>
                            </motion.p>
                          )}
                        </div>

                        {/* Stats */}
                        {diffStats && (
                          <motion.div
                            className="flex items-center gap-3 flex-shrink-0"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.1 }}
                          >
                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.15)' }}>
                              <span style={{ color: '#22c55e', fontWeight: 800, fontSize: 11 }}>+</span>
                              <span className="text-xs font-bold" style={{ color: '#22c55e' }}>{diffStats.added}</span>
                              <span className="text-[10px]" style={{ color: '#334155' }}>added</span>
                            </div>
                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
                              <span style={{ color: '#ef4444', fontWeight: 800, fontSize: 11 }}>−</span>
                              <span className="text-xs font-bold" style={{ color: '#ef4444' }}>{diffStats.removed}</span>
                              <span className="text-[10px]" style={{ color: '#334155' }}>removed</span>
                            </div>
                            <motion.button
                              onClick={() => setShowUnchanged(p => !p)}
                              className="text-[10px] px-2.5 py-1 rounded-lg font-semibold"
                              style={{
                                background: showUnchanged ? 'rgba(244,123,32,0.1)' : 'rgba(255,255,255,0.03)',
                                border: `1px solid ${showUnchanged ? 'rgba(244,123,32,0.3)' : '#1e2533'}`,
                                color: showUnchanged ? '#F59340' : '#475569',
                              }}
                              whileHover={{ opacity: 0.8 }}
                              whileTap={{ scale: 0.95 }}
                            >
                              {showUnchanged ? 'Hide unchanged' : 'Show unchanged'}
                            </motion.button>
                          </motion.div>
                        )}
                      </div>

                      {/* Diff body */}
                      <motion.div
                        style={{ maxHeight: 520, overflowY: 'auto', background: '#070b12' }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.1 }}
                      >
                        {renderDiff(diffResult)}
                        {diffResult.filter(d => d.type !== 'unchanged').length === 0 && (
                          <div className="py-12 text-center">
                            <p className="text-sm" style={{ color: '#334155' }}>No differences found between these versions.</p>
                          </div>
                        )}
                      </motion.div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* Version Table */}
          <motion.div
            className="rounded-2xl overflow-hidden"
            style={{ border: '1px solid #1e2533' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: '#0f1117', borderBottom: '1px solid #1e2533' }}>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: '#475569' }}>Version</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: '#475569' }}>Created</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: '#475569' }}>Author</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: '#475569' }}>Source</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: '#475569' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence>
                  {technicalRows.map((v, idx) => {
                    const srcCfg = SOURCE_COLORS[v.source] || SOURCE_COLORS.ai
                    const hasChildren = grouped[v.version]?.length > 0
                    const isExpanded = expandedParents[v.version]
                    return (
                      <React.Fragment key={v.version}>
                        <motion.tr
                          custom={idx}
                          variants={rowVariants}
                          initial="hidden"
                          animate="visible"
                          className="border-b transition-colors"
                          style={{ borderColor: '#1e2533' }}
                          whileHover={{ backgroundColor: 'rgba(255,255,255,0.015)' }}
                        >
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            {hasChildren ? (
                              <button
                                onClick={() => toggleExpand(v.version)}
                                className="w-5 h-5 flex items-center justify-center rounded text-xs transition-colors"
                                style={{ color: '#475569', backgroundColor: '#1e2533' }}
                              >
                                {isExpanded ? (
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                  </svg>
                                ) : (
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                  </svg>
                                )}
                              </button>
                            ) : (
                              <span className="w-5" />
                            )}
                            <span
                              className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold"
                              style={{ backgroundColor: 'rgba(244,123,32,0.12)', color: '#F59340', border: '1px solid rgba(244,123,32,0.2)' }}
                            >
                              v{v.version}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-xs" style={{ color: '#94a3b8' }}>{formatDate(v.created_at)}</td>
                        <td className="px-5 py-4">
                          {v.created_by_name ? (
                            <div className="flex items-center gap-2">
                              <div
                                className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                                style={{ backgroundColor: 'rgba(244,123,32,0.15)', color: '#F59340' }}
                              >
                                {v.created_by_name.charAt(0).toUpperCase()}
                              </div>
                              <span className="text-xs" style={{ color: '#94a3b8' }}>{v.created_by_name}</span>
                            </div>
                          ) : (
                            <span className="text-xs" style={{ color: '#334155' }}>—</span>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize"
                            style={{ backgroundColor: srcCfg.bg, border: `1px solid ${srcCfg.border}`, color: srcCfg.color }}
                          >
                            {v.source || 'ai'}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="inline-flex items-center gap-2">
                            {/* Upload to Drive — only for admin/project creator */}
                            {canUploadDrive && (
                              <>
                                {(driveStatuses[v.version]?.shareUrl || v.drive_share_url) ? (
                                  <a
                                    href={driveStatuses[v.version]?.shareUrl || v.drive_share_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors"
                                    style={{ backgroundColor: 'rgba(34,197,94,0.12)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)' }}
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                    </svg>
                                    Open in Google Docs
                                  </a>
                                ) : driveStatuses[v.version]?.uploading ? (
                                  <span
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg opacity-60"
                                    style={{ color: '#94a3b8', border: '1px solid #1e2533' }}
                                  >
                                    <span className="w-3 h-3 rounded-full border border-current/30 border-t-current animate-spin" />
                                    Uploading...
                                  </span>
                                ) : driveStatuses[v.version]?.error ? (
                                  <motion.button
                                    onClick={() => handleUploadToDrive(v.version)}
                                    title="Retry upload"
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors"
                                    style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                    Retry
                                  </motion.button>
                                ) : (
                                  <motion.button
                                    onClick={() => handleUploadToDrive(v.version)}
                                    title="Upload to Google Drive"
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors"
                                    style={{ backgroundColor: 'rgba(59,130,246,0.12)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.3)' }}
                                    whileHover={{ backgroundColor: 'rgba(59,130,246,0.2)', scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                    </svg>
                                    Upload to Drive
                                  </motion.button>
                                )}
                              </>
                            )}
                            {/* Delete */}
                            {canDelete && (
                              <motion.button
                                onClick={() => setDeleteConfirm(v)}
                                title="Delete version"
                                className="inline-flex items-center justify-center w-7 h-7 rounded-lg transition-colors"
                                style={{ color: '#475569', border: '1px solid #1e2533' }}
                                whileHover={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#f87171', borderColor: 'rgba(239,68,68,0.3)' }}
                                whileTap={{ scale: 0.92 }}
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </motion.button>
                            )}
                            {/* MD */}
                            <motion.button
                              onClick={() => handleDownloadMd(v.version, v.version)}
                              disabled={downloadingMd === v.version}
                              title="Download Markdown"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg disabled:opacity-60 transition-colors"
                              style={{ color: '#64748b', border: '1px solid #1e2533' }}
                              whileHover={{ backgroundColor: '#161b27', color: '#94a3b8', borderColor: '#2d3748' }}
                              whileTap={{ scale: 0.95 }}
                            >
                              {downloadingMd === v.version ? (
                                <span className="w-3 h-3 rounded-full border border-current/30 border-t-current animate-spin" />
                              ) : (
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                              )}
                              MD
                            </motion.button>

                            {/* DOCX */}
                            <motion.button
                              onClick={() => handleDownloadDocx(v.version, v.version)}
                              disabled={downloadingDocx === v.version}
                              title="Download DOCX"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg disabled:opacity-60 transition-colors"
                              style={{ color: '#64748b', border: '1px solid #1e2533' }}
                              whileHover={{ backgroundColor: '#161b27', color: '#94a3b8', borderColor: '#2d3748' }}
                              whileTap={{ scale: 0.95 }}
                            >
                              {downloadingDocx === v.version ? (
                                <span className="w-3 h-3 rounded-full border border-current/30 border-t-current animate-spin" />
                              ) : (
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                </svg>
                              )}
                              DOCX
                            </motion.button>

                            {/* JSON */}
                            <motion.button
                              onClick={() => handleExportJson(v.version, v.version)}
                              disabled={exportingJson === v.version}
                              title="Export JSON"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg disabled:opacity-60 transition-colors"
                              style={{ color: '#64748b', border: '1px solid #1e2533' }}
                              whileHover={{ backgroundColor: '#161b27', color: '#94a3b8', borderColor: '#2d3748' }}
                              whileTap={{ scale: 0.95 }}
                            >
                              {exportingJson === v.version ? (
                                <span className="w-3 h-3 rounded-full border border-current/30 border-t-current animate-spin" />
                              ) : (
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                              )}
                              JSON
                            </motion.button>

                            {/* PDF */}
                            <motion.button
                              onClick={() => handleDownload(v.version, v.version)}
                              disabled={downloading === v.id}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg disabled:opacity-60 transition-colors"
                              style={{ color: '#94a3b8', border: '1px solid #1e2533' }}
                              whileHover={{ backgroundColor: '#161b27', color: '#f1f5f9', borderColor: '#2d3748' }}
                              whileTap={{ scale: 0.95 }}
                            >
                              {downloading === v.id ? (
                                <span className="w-3 h-3 rounded-full border border-current/30 border-t-current animate-spin" />
                              ) : (
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                              )}
                              PDF
                            </motion.button>
                          </div>
                        </td>
                      </motion.tr>

                        {/* Client sub-rows */}
                        {isExpanded && (grouped[v.version] || []).map(cv => (
                          <motion.tr
                            key={cv.version}
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            style={{ borderColor: '#1e2533', backgroundColor: 'rgba(20,184,166,0.02)' }}
                          >
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2 pl-10">
                                <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold" style={{ backgroundColor: 'rgba(20,184,166,0.1)', color: '#14b8a6', border: '1px solid rgba(20,184,166,0.2)' }}>
                                  v{cv.version.replace('client-', '')}
                                </span>
                                <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: 'rgba(20,184,166,0.08)', color: '#14b8a6' }}>Client Summary</span>
                              </div>
                            </td>
                            <td className="px-5 py-3 text-xs" style={{ color: '#94a3b8' }}>{formatDate(cv.created_at)}</td>
                            <td className="px-5 py-3">
                              {cv.created_by_name ? (
                                <div className="flex items-center gap-2">
                                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold" style={{ backgroundColor: 'rgba(20,184,166,0.15)', color: '#14b8a6' }}>
                                    {cv.created_by_name.charAt(0).toUpperCase()}
                                  </div>
                                  <span className="text-xs" style={{ color: '#94a3b8' }}>{cv.created_by_name}</span>
                                </div>
                              ) : <span className="text-xs" style={{ color: '#334155' }}>—</span>}
                            </td>
                            <td className="px-5 py-3">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: 'rgba(20,184,166,0.1)', border: '1px solid rgba(20,184,166,0.2)', color: '#14b8a6' }}>
                                Client
                              </span>
                            </td>
                            <td className="px-5 py-3 text-right">
                              <div className="inline-flex items-center gap-2">
                                {canUploadDrive && (
                                  <>
                                    {(driveStatuses[cv.version]?.shareUrl || cv.drive_share_url) ? (
                                      <a
                                        href={driveStatuses[cv.version]?.shareUrl || cv.drive_share_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors"
                                        style={{ backgroundColor: 'rgba(34,197,94,0.12)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)' }}
                                      >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                        </svg>
                                        Open in Google Docs
                                      </a>
                                    ) : driveStatuses[cv.version]?.uploading ? (
                                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg opacity-60" style={{ color: '#94a3b8', border: '1px solid #1e2533' }}>
                                        <span className="w-3 h-3 rounded-full border border-current/30 border-t-current animate-spin" />
                                        Uploading...
                                      </span>
                                    ) : driveStatuses[cv.version]?.error ? (
                                      <motion.button onClick={() => handleUploadToDrive(cv.version)} title="Retry upload" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors" style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                        Retry
                                      </motion.button>
                                    ) : (
                                      <motion.button onClick={() => handleUploadToDrive(cv.version)} title="Upload to Google Drive" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors" style={{ backgroundColor: 'rgba(59,130,246,0.12)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.3)' }} whileHover={{ backgroundColor: 'rgba(59,130,246,0.2)', scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                        Upload to Drive
                                      </motion.button>
                                    )}
                                  </>
                                )}
                                <motion.button onClick={() => handleDownload(cv.version, cv.version)} disabled={downloading === cv.version} title="Download PDF" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg disabled:opacity-60 transition-colors" style={{ color: '#64748b', border: '1px solid #1e2533' }} whileHover={{ backgroundColor: '#161b27', color: '#94a3b8', borderColor: '#2d3748' }} whileTap={{ scale: 0.95 }}>
                                  {downloading === cv.version ? <span className="w-3 h-3 rounded-full border border-current/30 border-t-current animate-spin" /> : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>}
                                  PDF
                                </motion.button>
                                <motion.button onClick={() => handleDownloadDocx(cv.version, cv.version)} disabled={downloadingDocx === cv.version} title="Download DOCX" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg disabled:opacity-60 transition-colors" style={{ color: '#64748b', border: '1px solid #1e2533' }} whileHover={{ backgroundColor: '#161b27', color: '#94a3b8', borderColor: '#2d3748' }} whileTap={{ scale: 0.95 }}>
                                  {downloadingDocx === cv.version ? <span className="w-3 h-3 rounded-full border border-current/30 border-t-current animate-spin" /> : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>}
                                  DOCX
                                </motion.button>
                                {canDelete && (
                                  <motion.button
                                    onClick={() => setDeleteConfirm(cv)}
                                    title="Delete version"
                                    className="inline-flex items-center justify-center w-7 h-7 rounded-lg transition-colors"
                                    style={{ color: '#475569', border: '1px solid #1e2533' }}
                                    whileHover={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#f87171', borderColor: 'rgba(239,68,68,0.3)' }}
                                    whileTap={{ scale: 0.92 }}
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                  </motion.button>
                                )}
                              </div>
                            </td>
                          </motion.tr>
                        ))}
                      </React.Fragment>
                    )
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </motion.div>
        </>
      )}
    </motion.div>
  )
}
