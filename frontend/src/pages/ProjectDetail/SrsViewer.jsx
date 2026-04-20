import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { marked } from 'marked'
import apiClient from '../../api/client'
import { useAuth } from '../../contexts/AuthContext'
import Modal from '../../components/Modal'

// Helper: time ago
function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

// Avatar colors derived from name
const AVATAR_COLORS = ['#F47B20','#14b8a6','#8b5cf6','#ec4899','#3b82f6','#22c55e']
function avatarColor(name) {
  if (!name) return AVATAR_COLORS[0]
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length]
}

export default function SrsViewer({ projectId, project, onProjectUpdate }) {
  const { user, isSuperAdmin } = useAuth()
  const [versions, setVersions] = useState([])
  // Group versions by type for display
  const groupedVersions = versions.reduce((acc, v) => {
    if (v.type === 'client') {
      const parent = v.parent_version || 'unknown';
      if (!acc[parent]) acc[parent] = [];
      acc[parent].push(v);
    } else {
      if (!acc['technical']) acc['technical'] = [];
      acc['technical'].push(v);
    }
    return acc;
  }, {});

  // Download handlers for client versions
  const handleClientDownload = async (version) => {
    setDownloading(true);
    try {
      const token = localStorage.getItem('srs_token');
      const res = await apiClient.get(`/projects/${projectId}/srs/${version}/download`, {
        responseType: 'blob',
        headers: { Authorization: `Bearer ${token}` }
      });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${version}.pdf`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch {
      console.error('PDF download failed');
    } finally {
      setDownloading(false);
    }
  };

  const handleClientDownloadDocx = async (version) => {
    setDownloadingDocx(true);
    try {
      const token = localStorage.getItem('srs_token');
      const res = await apiClient.get(`/projects/${projectId}/srs/${version}/download-docx`, {
        responseType: 'blob',
        headers: { Authorization: `Bearer ${token}` }
      });
      const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${version}.docx`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch {
      console.error('DOCX download failed');
    } finally {
      setDownloadingDocx(false);
    }
  };

  const handleClientUploadDrive = async (version) => {
    setUploading(true);
    try {
      const token = localStorage.getItem('srs_token');
      await apiClient.post(`/projects/${projectId}/srs/${version}/upload-to-drive`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (err) {
      console.error('Upload to Drive failed:', err);
    } finally {
      setUploading(false);
    }
  };

  const technicalVersions = versions.filter(v => v.type !== 'client');
  const [srsContent, setSrsContent] = useState('')
  const [selectedVersion, setSelectedVersion] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadingContent, setLoadingContent] = useState(false)
  const [error, setError] = useState('')
  const [retrying, setRetrying] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [downloadingMd, setDownloadingMd] = useState(false)
  const [downloadingDocx, setDownloadingDocx] = useState(false)
  const [exportingJson, setExportingJson] = useState(false)
  const [queueLength, setQueueLength] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)

  // Re-generate modal state
  const [showRegenModal, setShowRegenModal] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  // Comments state
  const [comments, setComments] = useState([])
  const [showComments, setShowComments] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [newCommentSection, setNewCommentSection] = useState('')
  const [showCommentForm, setShowCommentForm] = useState(false)
  const [submittingComment, setSubmittingComment] = useState(false)

  const fetchVersions = useCallback(async () => {
    try {
      const res = await apiClient.get(`/projects/${projectId}/srs`)
      const list = res.data.versions || res.data || []
      setVersions(list)
      if (list.length > 0 && !selectedVersion) {
        setSelectedVersion(list[0].version)
      }
    } catch {
      // Silently fail — the next 3-second poll will succeed if this was transient.
      // Do NOT setError here; "Failed to load project" on the parent page is triggered
      // by onProjectUpdate re-fetch, not a genuine auth or network failure.
    } finally {
      setLoading(false)
    }
  }, [projectId])

  const fetchComments = useCallback(async () => {
    if (!selectedVersion) return
    try {
      const res = await apiClient.get(`/projects/${projectId}/comments?version=${selectedVersion}`)
      setComments(res.data.comments || res.data || [])
    } catch {
      setComments([])
    }
  }, [projectId, selectedVersion])

  useEffect(() => {
    if (showComments && selectedVersion) {
      fetchComments()
    }
  }, [showComments, fetchComments, selectedVersion])

  const submitComment = async () => {
    if (!newComment.trim()) return
    setSubmittingComment(true)
    try {
      await apiClient.post(`/projects/${projectId}/comments`, {
        content: newComment,
        srs_version: selectedVersion,
        section_ref: newCommentSection || null
      })
      setNewComment('')
      setNewCommentSection('')
      setShowCommentForm(false)
      fetchComments()
    } catch {
      // ignore
    } finally {
      setSubmittingComment(false)
    }
  }

  const deleteComment = async (id) => {
    try {
      await apiClient.delete(`/projects/${projectId}/comments/${id}`)
      fetchComments()
    } catch {
      // ignore
    }
  }

  const generationStatus = project?.generation_status || 'idle'

  // Check if the current user can re-generate (owner or super admin)
  const canRegenerate =
    isSuperAdmin() || (user && project && project.created_by === user.id)

  const fetchVersionContent = useCallback(async (versionId) => {
    if (!versionId) return
    setLoadingContent(true)
    try {
      const res = await apiClient.get(`/projects/${projectId}/srs/${versionId}`)
      const content = res.data.content || res.data.srs_content || ''
      setSrsContent(content)
    } catch {
      setSrsContent('')
    } finally {
      setLoadingContent(false)
    }
  }, [projectId])

  useEffect(() => {
    fetchVersions()
  }, [fetchVersions])

  useEffect(() => {
    if (selectedVersion) {
      fetchVersionContent(selectedVersion)
    }
  }, [selectedVersion, fetchVersionContent])

  useEffect(() => {
    if (generationStatus !== 'generating') return
    const interval = setInterval(async () => {
      try {
        const statusRes = await apiClient.get(`/projects/${projectId}/srs/status`)
        setQueueLength(statusRes.data.queueLength || 0)
        setIsProcessing(statusRes.data.isProcessing || false)
      } catch {}
      fetchVersions()
      onProjectUpdate()
    }, 3000)
    return () => clearInterval(interval)
  }, [generationStatus, fetchVersions, onProjectUpdate, projectId])

  const handleRetry = async () => {
    setRetrying(true)
    try {
      await apiClient.post(`/projects/${projectId}/srs/generate`)
      onProjectUpdate()
      fetchVersions()
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to retry generation.')
    } finally {
      setRetrying(false)
    }
  }

  const handleRegenerate = async () => {
    setRegenerating(true)
    try {
      await apiClient.post(`/projects/${projectId}/srs/regenerate`)
      setShowRegenModal(false)
      onProjectUpdate()
      fetchVersions()
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to re-generate SRS.')
      setShowRegenModal(false)
    } finally {
      setRegenerating(false)
    }
  }

  const handleDownload = async () => {
    if (!selectedVersion) return
    setDownloading(true)
    try {
      const token = localStorage.getItem('srs_token')
      const baseURL = import.meta.env.VITE_API_URL || '/api'
      const url = `${baseURL}/projects/${projectId}/srs/${selectedVersion}/download`
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Download failed')
      const blob = await res.blob()
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `srs-v${selectedVersion}.pdf`
      link.click()
      URL.revokeObjectURL(link.href)
    } catch {
      setError('Failed to download PDF.')
    } finally {
      setDownloading(false)
    }
  }

  const handleDownloadMd = async () => {
    if (!selectedVersion) return
    setDownloadingMd(true)
    try {
      const token = localStorage.getItem('srs_token')
      const baseURL = import.meta.env.VITE_API_URL || '/api'
      const url = `${baseURL}/projects/${projectId}/srs/${selectedVersion}/download-md`
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error('Download failed')
      const blob = await res.blob()
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `srs-v${selectedVersion}.md`
      link.click()
      URL.revokeObjectURL(link.href)
    } catch {
      setError('Failed to download Markdown.')
    } finally {
      setDownloadingMd(false)
    }
  }

  const handleDownloadDocx = async () => {
    if (!selectedVersion) return
    setDownloadingDocx(true)
    try {
      const token = localStorage.getItem('srs_token')
      const baseURL = import.meta.env.VITE_API_URL || '/api'
      const url = `${baseURL}/projects/${projectId}/srs/${selectedVersion}/download-docx`
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error('Download failed')
      const blob = await res.blob()
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `srs-v${selectedVersion}.docx`
      link.click()
      URL.revokeObjectURL(link.href)
    } catch {
      setError('Failed to download DOCX.')
    } finally {
      setDownloadingDocx(false)
    }
  }

  const handleExportJson = async () => {
    if (!selectedVersion) return
    setExportingJson(true)
    try {
      const token = localStorage.getItem('srs_token')
      const baseURL = import.meta.env.VITE_API_URL || '/api'
      const url = `${baseURL}/projects/${projectId}/srs/${selectedVersion}/export-json`
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `srs-v${selectedVersion}.json`
      link.click()
      URL.revokeObjectURL(link.href)
    } catch {
      setError('Failed to export JSON.')
    } finally {
      setExportingJson(false)
    }
  }

  // marked v5+ returns a Promise — use synchronous option
  const htmlContent = srsContent ? marked.parse(srsContent, { async: false }) : ''

  const formatDate = (d) => {
    if (!d) return ''
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <motion.div
      className="p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-base font-semibold" style={{ color: '#f1f5f9' }}>SRS Document</h2>
          <p className="text-xs mt-0.5" style={{ color: '#475569' }}>AI-generated Software Requirements Specification</p>
        </div>
        <motion.button
          onClick={() => setShowComments(prev => !prev)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl transition-all"
          style={{
            color: showComments ? '#14b8a6' : '#94a3b8',
            border: `1px solid ${showComments ? 'rgba(20,184,166,0.4)' : '#1e2533'}`,
            backgroundColor: showComments ? 'rgba(20,184,166,0.08)' : 'transparent'
          }}
          whileHover={{ borderColor: showComments ? 'rgba(20,184,166,0.6)' : '#2d3748', color: showComments ? '#14b8a6' : '#f1f5f9' }}
          whileTap={{ scale: 0.95 }}
        >
          💬 Comments
          {comments.length > 0 && (
            <span
              className="inline-flex items-center justify-center w-4 h-4 rounded-full text-xs font-bold"
              style={{ backgroundColor: 'rgba(20,184,166,0.2)', color: '#14b8a6', fontSize: 10 }}
            >
              {comments.length}
            </span>
          )}
        </motion.button>
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

      {/* Status Banners */}
      {/* Inline scan-line + gradient-text CSS */}
      <style>{`
        @keyframes srs-scan {
          0% { transform: translateY(-100%); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(100vh); opacity: 0; }
        }
        .srs-scanline::after {
          content: '';
          position: absolute;
          left: 0; right: 0;
          height: 2px;
          background: linear-gradient(90deg, transparent, rgba(245,158,11,0.4), rgba(244,123,32,0.4), transparent);
          animation: srs-scan 3s linear infinite;
          pointer-events: none;
        }
        @keyframes gradient-shift {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        .streaming-gradient-text {
          background: linear-gradient(90deg, #f59e0b, #F47B20, #fbbf24, #F47B20, #f59e0b);
          background-size: 300% 300%;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: gradient-shift 3s ease infinite;
        }
        @keyframes stream-cursor-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        .stream-cursor {
          display: inline-block;
          color: #F47B20;
          animation: stream-cursor-blink 0.8s ease-in-out infinite;
          font-weight: bold;
        }
      `}</style>

      <AnimatePresence mode="wait">
        {generationStatus === 'generating' && (
          <motion.div
            className="mb-5 rounded-2xl overflow-hidden"
            style={{
              border: '1px solid rgba(245,158,11,0.25)',
              background: 'rgba(245,158,11,0.03)',
              boxShadow: '0 0 0 1px rgba(244,123,32,0.05), 0 8px 32px rgba(0,0,0,0.2)'
            }}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ duration: 0.3 }}
          >
            {/* Gradient top border */}
            <div style={{
              height: 3,
              background: 'linear-gradient(90deg, #f59e0b, #F47B20, #fbbf24, #F47B20, #f59e0b)',
              backgroundSize: '300% 100%',
              animation: 'gradient-shift 3s ease infinite'
            }} />

            <div className="p-4">
              {/* Header row */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  {/* Animated pen icon */}
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.2)' }}>
                    <motion.span
                      style={{ fontSize: 16, display: 'block' }}
                      animate={{ rotate: [0, -10, 10, -10, 0] }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    >✍️</motion.span>
                  </div>
                  <div>
                    <p className="text-sm font-bold streaming-gradient-text">AI is writing your SRS...</p>
                    <p className="text-xs mt-0.5" style={{ color: 'rgba(245,158,11,0.5)' }}>
                      {queueLength > 0
                        ? `${queueLength} project${queueLength > 1 ? 's' : ''} ahead in queue`
                        : 'Writing document now...'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-1 rounded-full overflow-hidden mb-3" style={{ backgroundColor: 'rgba(245,158,11,0.1)' }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: 'linear-gradient(90deg, #f59e0b, #F47B20, #fbbf24)' }}
                  animate={{ x: ['-100%', '200%'] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                />
              </div>

              {/* Queue info */}
              {queueLength > 0 && (
                <div className="flex items-center gap-2 mt-3">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ backgroundColor: 'rgba(245,158,11,0.2)', color: '#f59e0b' }}>
                    {queueLength + 1}
                  </div>
                  <p className="text-xs" style={{ color: 'rgba(245,158,11,0.6)' }}>
                    {queueLength} project{queueLength > 1 ? 's' : ''} ahead in queue — your SRS will start shortly
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {generationStatus === 'failed' && (
          <motion.div
            className="mb-5 p-4 rounded-2xl flex items-center justify-between"
            style={{ backgroundColor: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5" fill="none" stroke="#ef4444" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm font-medium" style={{ color: '#fca5a5' }}>Generation failed. You can retry.</p>
            </div>
            <motion.button
              onClick={handleRetry}
              disabled={retrying}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: '#ef4444' }}
              whileHover={{ backgroundColor: '#dc2626' }}
              whileTap={{ scale: 0.97 }}
            >
              {retrying && <span className="w-3 h-3 rounded-full border border-white/30 border-t-white animate-spin" />}
              {retrying ? 'Retrying...' : 'Retry Generation'}
            </motion.button>
          </motion.div>
        )}

        {generationStatus === 'idle' && versions.length === 0 && !loading && (
          <motion.div
            className="mb-5 p-4 rounded-2xl flex items-center gap-3"
            style={{ backgroundColor: 'rgba(71,85,105,0.08)', border: '1px solid rgba(71,85,105,0.2)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <svg className="w-5 h-5" fill="none" stroke="#94a3b8" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm" style={{ color: '#94a3b8' }}>
              No SRS document yet. Submit the questionnaire to generate one, or use the <strong style={{ color: '#F47B20' }}>Re-generate SRS</strong> button below.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Re-generate SRS Button — always visible when no versions or status allows it */}
      <AnimatePresence>
        {canRegenerate && (generationStatus === 'ready' || generationStatus === 'failed' || (generationStatus === 'idle' && !loading)) && (
          <motion.div
            className="mb-5 flex items-center gap-3"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
          >
            <div className="relative group">
              <motion.button
                onClick={() => setShowRegenModal(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
                style={{ backgroundColor: 'transparent', border: '1px solid #F47B20', color: '#F47B20' }}
                whileHover={{ backgroundColor: 'rgba(244,123,32,0.08)', boxShadow: '0 0 0 1px rgba(244,123,32,0.3)' }}
                whileTap={{ scale: 0.97 }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Re-generate SRS
              </motion.button>
              <div className="absolute left-0 bottom-full mb-2 z-10 px-3 py-2 rounded-lg text-xs whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ backgroundColor: '#1e2533', border: '1px solid #334155', color: '#94a3b8' }}>
                ⚠️ This will create a new version from the current questionnaire answers.
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Animated PDF Preview Skeleton */}
      <AnimatePresence>
        {generationStatus === 'generating' && versions.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.97 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            style={{ position: 'relative', maxWidth: 680, margin: '0 auto', marginBottom: 24 }}
          >
            <style>{`
              @keyframes pdf-shimmer {
                0% { background-position: -400px 0; }
                100% { background-position: 400px 0; }
              }
              .pdf-skeleton {
                background: linear-gradient(90deg, #1e2533 25%, #2d3748 50%, #1e2533 75%);
                background-size: 800px 100%;
                animation: pdf-shimmer 1.8s ease-in-out infinite;
                border-radius: 4px;
              }
              @keyframes spin-orange {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            `}</style>

            {/* Paper stack pages behind */}
            <div style={{ position:'absolute', bottom:-12, left:12, right:12, height:'100%', backgroundColor:'#0a0e17', borderRadius:16, zIndex:0, opacity:0.5 }} />
            <div style={{ position:'absolute', bottom:-6, left:6, right:6, height:'100%', backgroundColor:'#0d1117', borderRadius:16, zIndex:1, opacity:0.7 }} />

            {/* Main card */}
            <div style={{
              position: 'relative',
              zIndex: 2,
              backgroundColor: '#0d1117',
              border: '1px solid rgba(244,123,32,0.15)',
              borderRadius: 16,
              boxShadow: '0 0 40px rgba(244,123,32,0.05), 0 20px 60px rgba(0,0,0,0.5)',
              padding: '40px 48px'
            }}>
              {/* Header area */}
              {[
                // [index, type, width, height, extra]
              ].map(() => null)}

              {(() => {
                const skeletonLines = [
                  // header
                  { type: 'header' },
                  { type: 'divider' },
                  // doc title
                  { width: '100%', height: 24 },
                  // subtitle
                  { width: '60%', height: 12 },
                  { type: 'gap' },
                  { type: 'spinner' },
                  // section 1
                  { width: '40%', height: 16, darker: true },
                  { width: '100%', height: 10 },
                  { width: '95%', height: 10 },
                  { width: '70%', height: 10 },
                  { type: 'gap' },
                  // section 2
                  { width: '35%', height: 16, darker: true },
                  { width: '100%', height: 10 },
                  { width: '88%', height: 10 },
                  { width: '92%', height: 10 },
                  { width: '55%', height: 10 },
                  { type: 'gap' },
                  // section 3 with bullets
                  { width: '45%', height: 16, darker: true },
                  { type: 'bullet', width: '80%' },
                  { type: 'bullet', width: '70%' },
                  { type: 'bullet', width: '85%' },
                  { type: 'bullet', width: '65%' },
                  { type: 'gap' },
                  { type: 'footer' },
                ]

                let lineIndex = 0
                return skeletonLines.map((item, i) => {
                  if (item.type === 'gap') {
                    return <div key={i} style={{ height: 20 }} />
                  }
                  if (item.type === 'divider') {
                    return <div key={i} style={{ height: 1, backgroundColor: 'rgba(244,123,32,0.1)', margin: '16px 0' }} />
                  }
                  if (item.type === 'spinner') {
                    return (
                      <div key={i} style={{ display:'flex', justifyContent:'center', alignItems:'center', padding:'20px 0' }}>
                        <div style={{
                          width: 44,
                          height: 44,
                          borderRadius: '50%',
                          border: '3px solid rgba(244,123,32,0.15)',
                          borderTop: '3px solid #F47B20',
                          animation: 'spin-orange 1s linear infinite'
                        }} />
                      </div>
                    )
                  }
                  if (item.type === 'footer') {
                    return (
                      <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6, marginTop:16 }}>
                        <motion.div
                          style={{ width:7, height:7, borderRadius:'50%', backgroundColor:'#F47B20' }}
                          animate={{ opacity:[1,0.3,1], scale:[1,0.7,1] }}
                          transition={{ duration:1.2, repeat:Infinity, ease:'easeInOut' }}
                        />
                        <span style={{ color:'#475569', fontSize:11 }}>Generating SRS Document...</span>
                      </div>
                    )
                  }
                  if (item.type === 'header') {
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                        <motion.div
                          style={{ width:36, height:36, borderRadius:'50%', backgroundColor:'rgba(244,123,32,0.15)', border:'1px solid rgba(244,123,32,0.3)', flexShrink:0 }}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: lineIndex++ * 0.04 }}
                        />
                        <motion.div
                          className="pdf-skeleton"
                          style={{ width: 200, height: 16 }}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: lineIndex++ * 0.04 }}
                        />
                      </div>
                    )
                  }
                  if (item.type === 'bullet') {
                    const idx = lineIndex++
                    return (
                      <motion.div
                        key={i}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.04 }}
                      >
                        <div className="pdf-skeleton" style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0 }} />
                        <div className="pdf-skeleton" style={{ width: item.width, height: 10, flex: 1 }} />
                      </motion.div>
                    )
                  }
                  // normal line
                  const idx = lineIndex++
                  if (item.darker) {
                    return (
                      <motion.div
                        key={i}
                        style={{
                          width: item.width,
                          height: 14,
                          marginBottom: 8,
                          backgroundColor: 'rgba(244,123,32,0.12)',
                          borderRadius: 4,
                        }}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.04 }}
                      />
                    )
                  }
                  return (
                    <motion.div
                      key={i}
                      className="pdf-skeleton"
                      style={{
                        width: item.width,
                        height: item.height,
                        marginBottom: 8,
                      }}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.04 }}
                    />
                  )
                })
              })()}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <div key={i} className={`skeleton h-${i === 0 ? 8 : 4} rounded`} />)}
        </div>
      ) : versions.length > 0 ? (
        <>
          {/* Version switcher — grouped technical + client */}
          <motion.div
            className="flex flex-col gap-3 mb-4"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            {/* Technical versions */}
            {groupedVersions['technical'] && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold mr-1" style={{ color: '#475569' }}>Technical</span>
                {groupedVersions['technical'].map(v => (
                  <button
                    key={v.version}
                    onClick={() => setSelectedVersion(v.version)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-xl transition-all"
                    style={{
                      backgroundColor: selectedVersion === v.version ? 'rgba(244,123,32,0.15)' : 'transparent',
                      border: `1px solid ${selectedVersion === v.version ? 'rgba(244,123,32,0.4)' : '#334155'}`,
                      color: selectedVersion === v.version ? '#F47B20' : '#475569'
                    }}
                  >
                    v{v.version}
                  </button>
                ))}
              </div>
            )}


            {/* Client versions — nested under parent */}
            {Object.entries(groupedVersions)
              .filter(([key]) => key !== 'technical')
              .map(([parentVer, clientVers]) => (
              <div key={parentVer} className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold mr-1" style={{ color: '#475569' }}>Client</span>
                  {clientVers.map(cv => {
                    const isSelected = selectedVersion === cv.version;
                    return (
                      <div key={cv.version} className="flex items-center gap-1">
                        <button
                          onClick={() => setSelectedVersion(cv.version)}
                          className="text-xs font-semibold px-3 py-1.5 rounded-xl transition-all"
                          style={{
                            backgroundColor: isSelected ? 'rgba(20,184,166,0.12)' : 'transparent',
                            border: `1px solid ${isSelected ? 'rgba(20,184,166,0.35)' : '#334155'}`,
                            color: isSelected ? '#14b8a6' : '#475569'
                          }}
                        >
                          v{cv.version.replace('client-', '')}
                        </button>
                        <button
                          onClick={() => handleClientDownload(cv.version)}
                          className="text-xs px-2 py-1 rounded-lg transition-all"
                          style={{ backgroundColor: 'transparent', border: '1px solid #334155', color: '#475569' }}
                          title="Download PDF"
                        >
                          📄
                        </button>
                        <button
                          onClick={() => handleClientDownloadDocx(cv.version)}
                          className="text-xs px-2 py-1 rounded-lg transition-all"
                          style={{ backgroundColor: 'transparent', border: '1px solid #334155', color: '#475569' }}
                          title="Download DOCX"
                        >
                          📝
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </motion.div>


          {/* Active version label + Downloads */}
          <motion.div
            className="flex items-center gap-3 mb-3"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <div className="flex items-center gap-2 flex-1">
              <span className="text-xs font-semibold px-3 py-1.5 rounded-xl" style={{
                backgroundColor: selectedVersion?.startsWith('client-') ? 'rgba(20,184,166,0.1)' : 'rgba(244,123,32,0.1)',
                border: `1px solid ${selectedVersion?.startsWith('client-') ? 'rgba(20,184,166,0.25)' : 'rgba(244,123,32,0.25)'}`,
                color: selectedVersion?.startsWith('client-') ? '#14b8a6' : '#F47B20'
              }}>
                v{selectedVersion}{versions.find(v => v.version === selectedVersion)?.created_by_name ? ` — ${versions.find(v => v.version === selectedVersion).created_by_name}` : ''}
              </span>
            </div>

            {/* Download MD — only for technical */}
            {!selectedVersion?.startsWith('client-') && (
              <motion.button
                onClick={handleDownloadMd}
                disabled={downloadingMd || !selectedVersion}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-60"
                style={{ backgroundColor: 'transparent', border: '1px solid #334155', color: '#94a3b8' }}
                whileHover={{ borderColor: '#64748b', color: '#f1f5f9', backgroundColor: 'rgba(255,255,255,0.04)' }}
                whileTap={{ scale: 0.97 }}
              >
                {downloadingMd ? <span className="w-4 h-4 rounded-full border-2 border-current/30 border-t-current animate-spin" /> : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                )}
                Download MD
              </motion.button>
            )}

            {/* Download DOCX */}
            <div className="relative group">
              <motion.button
                onClick={handleDownloadDocx}
                disabled={downloadingDocx || !selectedVersion}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-60"
                style={{ backgroundColor: 'transparent', border: '1px solid #334155', color: '#94a3b8' }}
                whileHover={{ borderColor: '#64748b', color: '#f1f5f9', backgroundColor: 'rgba(255,255,255,0.04)' }}
                whileTap={{ scale: 0.97 }}
              >
                {downloadingDocx ? <span className="w-4 h-4 rounded-full border-2 border-current/30 border-t-current animate-spin" /> : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                )}
                Download DOCX
              </motion.button>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-20 px-3 py-2 rounded-lg text-xs whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ backgroundColor: '#1e2533', border: '1px solid #334155', color: '#94a3b8' }}>
                📌 After opening: Ctrl+A → F9 → "Update entire table" to fix page numbers &amp; table of contents
              </div>
            </div>

            {/* Export JSON — only for technical */}
            {!selectedVersion?.startsWith('client-') && (
              <motion.button
                onClick={handleExportJson}
                disabled={exportingJson || !selectedVersion}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-60"
                style={{ backgroundColor: 'transparent', border: '1px solid #334155', color: '#94a3b8' }}
                whileHover={{ borderColor: '#64748b', color: '#f1f5f9', backgroundColor: 'rgba(255,255,255,0.04)' }}
                whileTap={{ scale: 0.97 }}
              >
                {exportingJson ? <span className="w-4 h-4 rounded-full border-2 border-current/30 border-t-current animate-spin" /> : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                )}
                JSON
              </motion.button>
            )}

            {/* Download PDF */}
            <motion.button
              onClick={handleDownload}
              disabled={downloading || !selectedVersion}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg, #F47B20, #D4680A)', boxShadow: '0 4px 12px rgba(244,123,32,0.25)' }}
              whileHover={{ scale: 1.02, boxShadow: '0 6px 16px rgba(244,123,32,0.35)' }}
              whileTap={{ scale: 0.97 }}
            >
              {downloading ? <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              )}
              Download PDF
            </motion.button>
          </motion.div>


          {/* Content + Comments 2-column layout */}
          <div className="flex gap-4 items-start">
            {/* SRS Content */}
            <motion.div
              className="rounded-2xl p-6 min-h-96"
              style={{
                backgroundColor: '#0f1117',
                border: '1px solid #1e2533',
                flex: showComments ? '0 0 70%' : '1 1 100%',
                transition: 'flex 0.3s ease',
                minWidth: 0
              }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
            >
              <AnimatePresence mode="wait">
                {loadingContent ? (
                  <motion.div
                    key="loading"
                    className="space-y-3 py-4"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <div className="skeleton h-8 w-2/3 rounded" />
                    <div className="skeleton h-4 rounded" />
                    <div className="skeleton h-4 rounded" />
                    <div className="skeleton h-4 w-4/5 rounded" />
                    <div className="skeleton h-6 w-1/3 mt-4 rounded" />
                    <div className="skeleton h-4 rounded" />
                    <div className="skeleton h-4 w-3/4 rounded" />
                  </motion.div>
                ) : htmlContent ? (
                  <motion.div
                    key="content"
                    className="srs-prose"
                    dangerouslySetInnerHTML={{ __html: htmlContent }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  />
                ) : (
                  <motion.p
                    key="empty"
                    className="text-center py-10 text-sm"
                    style={{ color: '#475569' }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    No content available for this version.
                  </motion.p>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Comments Panel */}
            <AnimatePresence>
              {showComments && (
                <motion.div
                  className="rounded-2xl flex-shrink-0"
                  style={{
                    width: '30%',
                    backgroundColor: '#0f1117',
                    border: '1px solid #1e2533',
                    overflow: 'hidden'
                  }}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                >
                  {/* Panel header */}
                  <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid #1e2533' }}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold" style={{ color: '#f1f5f9' }}>Comments</span>
                      {comments.length > 0 && (
                        <span
                          className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-xs font-bold"
                          style={{ backgroundColor: 'rgba(20,184,166,0.15)', color: '#14b8a6', minWidth: 20 }}
                        >
                          {comments.length}
                        </span>
                      )}
                    </div>
                    <motion.button
                      onClick={() => { setShowCommentForm(true) }}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium"
                      style={{
                        backgroundColor: 'rgba(20,184,166,0.1)',
                        border: '1px solid rgba(20,184,166,0.25)',
                        color: '#14b8a6'
                      }}
                      whileHover={{ backgroundColor: 'rgba(20,184,166,0.18)' }}
                      whileTap={{ scale: 0.95 }}
                    >
                      + Add
                    </motion.button>
                  </div>

                  {/* Add comment form */}
                  <AnimatePresence>
                    {showCommentForm && (
                      <motion.div
                        className="px-4 py-3"
                        style={{ borderBottom: '1px solid #1e2533', backgroundColor: 'rgba(20,184,166,0.03)' }}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                      >
                        <input
                          type="text"
                          value={newCommentSection}
                          onChange={e => setNewCommentSection(e.target.value)}
                          placeholder="Section ref (e.g. 3.1)"
                          className="w-full text-xs px-3 py-1.5 rounded-lg mb-2 outline-none"
                          style={{
                            backgroundColor: '#161b27',
                            border: '1px solid #1e2533',
                            color: '#94a3b8'
                          }}
                        />
                        <textarea
                          value={newComment}
                          onChange={e => setNewComment(e.target.value)}
                          placeholder="Write a comment..."
                          rows={3}
                          className="w-full text-xs px-3 py-2 rounded-lg mb-2 outline-none resize-none"
                          style={{
                            backgroundColor: '#161b27',
                            border: '1px solid #1e2533',
                            color: '#f1f5f9'
                          }}
                        />
                        <div className="flex gap-2">
                          <motion.button
                            onClick={submitComment}
                            disabled={submittingComment || !newComment.trim()}
                            className="flex-1 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                            style={{ background: 'linear-gradient(135deg, #14b8a6, #0d9488)' }}
                            whileTap={{ scale: 0.97 }}
                          >
                            {submittingComment ? 'Posting...' : 'Post'}
                          </motion.button>
                          <motion.button
                            onClick={() => { setShowCommentForm(false); setNewComment(''); setNewCommentSection('') }}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium"
                            style={{ backgroundColor: 'transparent', border: '1px solid #1e2533', color: '#64748b' }}
                            whileTap={{ scale: 0.97 }}
                          >
                            Cancel
                          </motion.button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Comment list */}
                  <div className="overflow-y-auto" style={{ maxHeight: 480 }}>
                    {comments.length === 0 ? (
                      <div className="px-4 py-8 text-center">
                        <p className="text-xs" style={{ color: '#475569' }}>No comments yet</p>
                        <p className="text-xs mt-1" style={{ color: '#334155' }}>Be the first to comment</p>
                      </div>
                    ) : (
                      comments.map(c => (
                        <div
                          key={c.id}
                          className="px-4 py-3 group"
                          style={{ borderBottom: '1px solid rgba(30,37,51,0.7)' }}
                        >
                          <div className="flex items-start gap-2">
                            {/* Avatar */}
                            <div
                              className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5"
                              style={{
                                backgroundColor: `${avatarColor(c.user_name || c.author_name)}20`,
                                color: avatarColor(c.user_name || c.author_name),
                                border: `1px solid ${avatarColor(c.user_name || c.author_name)}30`
                              }}
                            >
                              {(c.user_name || c.author_name || '?').charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs font-semibold" style={{ color: '#e2e8f0' }}>
                                  {c.user_name || c.author_name || 'Unknown'}
                                </span>
                                {c.is_client && (
                                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(20,184,166,0.1)', color: '#14b8a6', border: '1px solid rgba(20,184,166,0.2)' }}>
                                    🌐 Client
                                  </span>
                                )}
                                {c.section_ref && (
                                  <span
                                    className="text-xs px-1.5 py-0.5 rounded"
                                    style={{ backgroundColor: 'rgba(244,123,32,0.1)', color: '#F47B20', border: '1px solid rgba(244,123,32,0.2)' }}
                                  >
                                    §{c.section_ref}
                                  </span>
                                )}
                                <span className="text-xs" style={{ color: '#475569' }}>{timeAgo(c.created_at)}</span>
                              </div>
                              <p className="text-xs mt-1 leading-relaxed" style={{ color: '#94a3b8', wordBreak: 'break-word' }}>
                                {c.content}
                              </p>
                            </div>
                            {/* Delete button — own comments or super_admin */}
                            {(isSuperAdmin() || (user && c.user_id === user.id)) && (
                              <motion.button
                                onClick={() => deleteComment(c.id)}
                                className="opacity-0 group-hover:opacity-100 p-1 rounded transition-opacity flex-shrink-0"
                                style={{ color: '#ef4444' }}
                                whileTap={{ scale: 0.9 }}
                                title="Delete comment"
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </motion.button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </>
      ) : null}

      {/* Re-generate Confirmation Modal */}
      <AnimatePresence>
        {showRegenModal && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={(e) => { if (e.target === e.currentTarget) setShowRegenModal(false) }}
          >
            <motion.div
              className="w-full max-w-md rounded-2xl p-6"
              style={{
                backgroundColor: '#0d1628',
                border: '1px solid #1e2533',
                boxShadow: '0 20px 60px rgba(0,0,0,0.5)'
              }}
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
            >
              {/* Icon */}
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: 'rgba(244,123,32,0.12)', border: '1px solid rgba(244,123,32,0.2)' }}
                >
                  <svg className="w-5 h-5" fill="none" stroke="#F47B20" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </div>
                <h3 className="text-base font-semibold" style={{ color: '#f1f5f9' }}>Re-generate SRS?</h3>
              </div>

              {/* Warning */}
              <div
                className="mb-5 p-3 rounded-xl"
                style={{ backgroundColor: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}
              >
                <p className="text-sm" style={{ color: '#fcd34d' }}>
                  ⚠️ The AI will re-write the full SRS document. Your existing versions will be kept in History.
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 justify-end">
                <motion.button
                  onClick={() => setShowRegenModal(false)}
                  disabled={regenerating}
                  className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-60"
                  style={{
                    backgroundColor: 'transparent',
                    border: '1px solid #334155',
                    color: '#94a3b8'
                  }}
                  whileHover={{ backgroundColor: 'rgba(255,255,255,0.04)', color: '#f1f5f9' }}
                  whileTap={{ scale: 0.97 }}
                >
                  Cancel
                </motion.button>
                <motion.button
                  onClick={handleRegenerate}
                  disabled={regenerating}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
                  style={{
                    background: 'linear-gradient(135deg, #F47B20, #D4680A)',
                    boxShadow: '0 4px 12px rgba(244,123,32,0.25)'
                  }}
                  whileHover={{ scale: 1.02, boxShadow: '0 6px 16px rgba(244,123,32,0.35)' }}
                  whileTap={{ scale: 0.97 }}
                >
                  {regenerating && (
                    <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  )}
                  {regenerating ? 'Generating...' : 'Yes, Re-generate'}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
