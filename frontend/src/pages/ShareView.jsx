import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { marked } from 'marked'

const AVATAR_COLORS = ['#F47B20','#14b8a6','#8b5cf6','#ec4899','#3b82f6','#22c55e']
function avatarColor(name) {
  if (!name) return AVATAR_COLORS[0]
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length]
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours/24)}d ago`
}

export default function ShareView() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedVersion, setSelectedVersion] = useState(null)
  const [srsContent, setSrsContent] = useState('')
  const [loadingVersion, setLoadingVersion] = useState(false)
  const [downloading, setDownloading] = useState(false)

  // Comments state
  const [comments, setComments] = useState([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentName, setCommentName] = useState('')
  const [commentText, setCommentText] = useState('')
  const [commentRef, setCommentRef] = useState('')
  const [commentError, setCommentError] = useState('')
  const [commentSuccess, setCommentSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const fetchShare = async () => {
      try {
        const baseURL = import.meta.env.VITE_API_URL || '/api'
        const res = await fetch(`${baseURL}/share/${token}`)
        if (!res.ok) {
          if (res.status === 404) throw new Error('This share link is invalid or has been revoked.')
          throw new Error('Failed to load shared SRS.')
        }
        const json = await res.json()
        setData(json)
        if (json.srs?.content) {
          setSrsContent(json.srs.content)
        }
        if (json.versions && json.versions.length > 0) {
          setSelectedVersion(json.versions[0].version)
        }
      } catch (err) {
        setError(err.message || 'Failed to load shared SRS.')
      } finally {
        setLoading(false)
      }
    }
    fetchShare()
  }, [token])

  useEffect(() => {
    if (!selectedVersion || !data) return
    // If multiple versions, load content for selected version
    if (data.versions && data.versions.length > 1) {
      const loadVersion = async () => {
        setLoadingVersion(true)
        try {
          const baseURL = import.meta.env.VITE_API_URL || '/api'
          const res = await fetch(`${baseURL}/share/${token}/srs/${selectedVersion}`)
          if (res.ok) {
            const json = await res.json()
            setSrsContent(json.content || json.srs_content || '')
          }
        } catch {
          // fallback to initial content
        } finally {
          setLoadingVersion(false)
        }
      }
      loadVersion()
    }
  }, [selectedVersion, token, data])

  const handleDownload = async () => {
    if (!selectedVersion) return
    setDownloading(true)
    try {
      const baseURL = import.meta.env.VITE_API_URL || '/api'
      const res = await fetch(`${baseURL}/share/${token}/srs/${selectedVersion}/download`)
      if (!res.ok) throw new Error('Download failed')
      const blob = await res.blob()
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `srs-v${selectedVersion}.pdf`
      link.click()
      URL.revokeObjectURL(link.href)
    } catch {
      // silent
    } finally {
      setDownloading(false)
    }
  }

  const formatDate = (d) => {
    if (!d) return ''
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const baseURL = import.meta.env.VITE_API_URL || ''

  const fetchComments = async () => {
    setCommentsLoading(true)
    try {
      const res = await fetch(`${baseURL}/share/${token}/comments`)
      if (res.ok) {
        const json = await res.json()
        setComments(json.comments || [])
      }
    } catch {
      // silent
    } finally {
      setCommentsLoading(false)
    }
  }

  useEffect(() => {
    if (token) fetchComments()
  }, [token])

  const handlePostComment = async (e) => {
    e.preventDefault()
    setCommentError('')
    if (!commentName.trim()) { setCommentError('Your name is required.'); return }
    if (!commentText.trim()) { setCommentError('Comment cannot be empty.'); return }
    setSubmitting(true)
    try {
      const res = await fetch(`${baseURL}/share/${token}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author_name: commentName.trim(), content: commentText.trim(), section_ref: commentRef.trim() || undefined })
      })
      if (!res.ok) throw new Error('Failed to post comment')
      setCommentName('')
      setCommentText('')
      setCommentRef('')
      setCommentSuccess(true)
      setTimeout(() => setCommentSuccess(false), 4000)
      await fetchComments()
    } catch {
      setCommentError('Failed to post comment. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const htmlContent = srsContent ? marked.parse(srsContent) : ''

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#080d18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            border: '3px solid rgba(244,123,32,0.2)',
            borderTopColor: '#F47B20',
            animation: 'spin 0.8s linear infinite',
            margin: '0 auto 16px'
          }} />
          <p style={{ color: '#475569', fontSize: 14 }}>Loading SRS...</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#080d18', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{
          textAlign: 'center',
          maxWidth: 400,
          padding: 32,
          borderRadius: 16,
          backgroundColor: '#0f1117',
          border: '1px solid rgba(239,68,68,0.2)'
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔗</div>
          <h2 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Link Not Found</h2>
          <p style={{ color: '#94a3b8', fontSize: 14 }}>{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#080d18', color: '#f1f5f9' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .share-prose { color: #cbd5e1; line-height: 1.75; font-size: 15px; }
        .share-prose h1 { color: #f1f5f9; font-size: 1.6rem; font-weight: 700; margin: 1.5rem 0 1rem; border-bottom: 1px solid #1e2533; padding-bottom: 0.5rem; }
        .share-prose h2 { color: #f1f5f9; font-size: 1.25rem; font-weight: 600; margin: 1.5rem 0 0.75rem; }
        .share-prose h3 { color: #e2e8f0; font-size: 1.1rem; font-weight: 600; margin: 1.25rem 0 0.5rem; }
        .share-prose p { margin: 0.75rem 0; }
        .share-prose ul, .share-prose ol { padding-left: 1.5rem; margin: 0.75rem 0; list-style-position: outside; }
        .share-prose ul { list-style-type: disc; }
        .share-prose ol { list-style-type: decimal; }
        .share-prose ul ul { list-style-type: circle; }
        .share-prose ul ul ul { list-style-type: square; }
        .share-prose li { margin: 0.35rem 0; }
        .share-prose code { background: rgba(244,123,32,0.08); border: 1px solid rgba(244,123,32,0.15); border-radius: 4px; padding: 1px 6px; font-size: 0.85em; color: #F59340; font-family: monospace; }
        .share-prose pre { background: #0f1117; border: 1px solid #1e2533; border-radius: 10px; padding: 16px; overflow-x: auto; margin: 1rem 0; }
        .share-prose pre code { background: none; border: none; padding: 0; color: #94a3b8; }
        .share-prose blockquote { border-left: 3px solid #F47B20; padding-left: 1rem; color: #94a3b8; margin: 1rem 0; }
        .share-prose table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
        .share-prose th { background: rgba(244,123,32,0.08); color: #F47B20; font-weight: 600; padding: 10px 14px; text-align: left; border: 1px solid #1e2533; }
        .share-prose td { padding: 10px 14px; border: 1px solid #1e2533; color: #cbd5e1; }
        .share-prose tr:hover td { background: rgba(255,255,255,0.02); }
        .share-prose a { color: #F47B20; text-decoration: underline; }
        .share-prose hr { border-color: #1e2533; margin: 1.5rem 0; }
      `}</style>

      {/* Header bar */}
      <header style={{
        backgroundColor: '#0d1628',
        borderBottom: '1px solid #1e2533',
        padding: '0 24px',
        height: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Fifty Studios logo — same as sidebar */}
          <div style={{
            width: 36, height: 36, borderRadius: 12, overflow: 'hidden',
            flexShrink: 0, boxShadow: '0 0 12px rgba(244,123,32,0.3)'
          }}>
            <img src="/logo.jpg" alt="Fifty Studios" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9', lineHeight: 1.3, margin: 0 }}>SRS Platform</p>
            <p style={{ fontSize: 11, color: '#475569', lineHeight: 1.3, margin: 0 }}>Fifty Studios</p>
          </div>

        </div>

        {/* Download PDF */}
        {selectedVersion && (
          <button
            onClick={handleDownload}
            disabled={downloading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              borderRadius: 10,
              background: downloading ? 'rgba(244,123,32,0.5)' : 'linear-gradient(135deg, #F47B20, #D4680A)',
              border: 'none',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: downloading ? 'not-allowed' : 'pointer',
              transition: 'opacity 0.2s'
            }}
          >
            {downloading ? (
              <span style={{
                display: 'inline-block',
                width: 14, height: 14,
                borderRadius: '50%',
                border: '2px solid rgba(255,255,255,0.3)',
                borderTopColor: '#fff',
                animation: 'spin 0.8s linear infinite'
              }} />
            ) : (
              <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            )}
            Download PDF
          </button>
        )}
      </header>

      {/* Project header */}
      <div style={{
        backgroundColor: '#0d1628',
        borderBottom: '1px solid #1e2533',
        padding: '20px 24px'
      }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: '#f1f5f9', marginBottom: 4 }}>
                {data?.project?.name || 'SRS Document'}
              </h1>
              {data?.project?.client_name && (
                <p style={{ fontSize: 14, color: '#64748b' }}>
                  Client: <span style={{ color: '#94a3b8' }}>{data.project.client_name}</span>
                </p>
              )}
            </div>

            {/* Version selector */}
            {data?.versions && data.versions.length > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ fontSize: 12, color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>Version</label>
                <select
                  value={selectedVersion || ''}
                  onChange={e => setSelectedVersion(e.target.value)}
                  style={{
                    backgroundColor: '#161b27',
                    border: '1px solid #1e2533',
                    color: '#f1f5f9',
                    padding: '6px 10px',
                    borderRadius: 8,
                    fontSize: 13,
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  {data.versions.map(v => (
                    <option key={v.version} value={v.version} style={{ backgroundColor: '#161b27' }}>
                      v{v.version} — {formatDate(v.created_at)}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SRS Content */}
      <main style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>
        {loadingVersion ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              border: '3px solid rgba(244,123,32,0.2)',
              borderTopColor: '#F47B20',
              animation: 'spin 0.8s linear infinite'
            }} />
          </div>
        ) : htmlContent ? (
          <div
            className="share-prose"
            dangerouslySetInnerHTML={{ __html: htmlContent }}
          />
        ) : (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#475569' }}>
            No content available for this version.
          </div>
        )}
      </main>

      {/* Comments Section */}
      <section style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px 48px', fontFamily: "'Segoe UI', Arial, sans-serif" }}>
        <div style={{ borderTop: '1px solid #1e2533', paddingTop: 32 }}>
          {/* Section title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9', margin: 0 }}>💬 Client Comments</h2>
            <span style={{
              backgroundColor: 'rgba(244,123,32,0.15)',
              color: '#F47B20',
              border: '1px solid rgba(244,123,32,0.3)',
              borderRadius: 12,
              padding: '2px 10px',
              fontSize: 12,
              fontWeight: 700
            }}>{comments.length}</span>
          </div>

          {/* Comments list */}
          {commentsLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                border: '3px solid rgba(244,123,32,0.2)',
                borderTopColor: '#F47B20',
                animation: 'spin 0.8s linear infinite'
              }} />
            </div>
          ) : comments.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '32px 0',
              color: '#475569', fontSize: 14,
              backgroundColor: '#0d1117',
              border: '1px solid #1e2533',
              borderRadius: 12,
              marginBottom: 24
            }}>
              No comments yet. Be the first to leave feedback!
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
              {comments.map(c => (
                <div key={c.id} style={{
                  backgroundColor: '#0d1117',
                  border: '1px solid #1e2533',
                  borderRadius: 12,
                  padding: '14px 16px',
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-start'
                }}>
                  {/* Avatar */}
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    backgroundColor: avatarColor(c.author_name),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: 15, color: '#fff',
                    flexShrink: 0, userSelect: 'none'
                  }}>
                    {(c.author_name || '?')[0].toUpperCase()}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Header row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                      <span style={{
                        fontWeight: 700, fontSize: 14, color: '#f1f5f9',
                        direction: 'auto', unicodeBidi: 'plaintext',
                        fontFamily: "'Segoe UI', Arial, sans-serif"
                      }}>{c.author_name}</span>
                      {c.section_ref && (
                        <span style={{
                          backgroundColor: 'rgba(244,123,32,0.12)',
                          color: '#F47B20',
                          border: '1px solid rgba(244,123,32,0.25)',
                          borderRadius: 6,
                          padding: '1px 7px',
                          fontSize: 11,
                          fontWeight: 600
                        }}>§ {c.section_ref}</span>
                      )}
                      <span style={{ fontSize: 12, color: '#475569', marginLeft: 'auto' }}>{timeAgo(c.created_at)}</span>
                    </div>
                    {/* Comment text */}
                    <p style={{
                      margin: 0, fontSize: 14, color: '#cbd5e1',
                      lineHeight: 1.65, whiteSpace: 'pre-wrap',
                      direction: 'auto', unicodeBidi: 'plaintext',
                      fontFamily: "'Segoe UI', Arial, sans-serif"
                    }}>{c.content}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add comment form */}
          <div style={{
            backgroundColor: '#0d1117',
            border: '1px solid #1e2533',
            borderRadius: 14,
            padding: '20px'
          }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: '#f1f5f9', marginBottom: 16, marginTop: 0 }}>Leave a Comment</h3>
            <form onSubmit={handlePostComment} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Name + Section ref row */}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <input
                  type="text"
                  placeholder="Your name *"
                  value={commentName}
                  onChange={e => setCommentName(e.target.value)}
                  dir="auto"
                  style={{
                    flex: '1 1 160px',
                    backgroundColor: '#161b27',
                    border: '1px solid #1e2533',
                    borderRadius: 8,
                    padding: '9px 12px',
                    color: '#f1f5f9',
                    fontSize: 14,
                    outline: 'none',
                    fontFamily: "'Segoe UI', Arial, sans-serif"
                  }}
                />
                <input
                  type="text"
                  placeholder="Section ref (optional, e.g. 3.1)"
                  value={commentRef}
                  onChange={e => setCommentRef(e.target.value)}
                  dir="auto"
                  style={{
                    flex: '1 1 160px',
                    backgroundColor: '#161b27',
                    border: '1px solid #1e2533',
                    borderRadius: 8,
                    padding: '9px 12px',
                    color: '#f1f5f9',
                    fontSize: 14,
                    outline: 'none',
                    fontFamily: "'Segoe UI', Arial, sans-serif"
                  }}
                />
              </div>
              <textarea
                placeholder="Your comment... *"
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                rows={3}
                dir="auto"
                style={{
                  backgroundColor: '#161b27',
                  border: '1px solid #1e2533',
                  borderRadius: 8,
                  padding: '9px 12px',
                  color: '#f1f5f9',
                  fontSize: 14,
                  outline: 'none',
                  resize: 'vertical',
                  fontFamily: "'Segoe UI', Arial, sans-serif",
                  lineHeight: 1.6
                }}
              />
              {/* Error / Success */}
              {commentError && (
                <p style={{ margin: 0, fontSize: 13, color: '#f87171' }}>{commentError}</p>
              )}
              {commentSuccess && (
                <p style={{ margin: 0, fontSize: 13, color: '#4ade80' }}>✅ Comment posted!</p>
              )}
              <div>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    padding: '9px 22px',
                    borderRadius: 9,
                    background: submitting ? 'rgba(244,123,32,0.5)' : 'linear-gradient(135deg, #F47B20, #D4680A)',
                    border: 'none',
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontFamily: "'Segoe UI', Arial, sans-serif"
                  }}
                >
                  {submitting && (
                    <span style={{
                      display: 'inline-block',
                      width: 13, height: 13,
                      borderRadius: '50%',
                      border: '2px solid rgba(255,255,255,0.3)',
                      borderTopColor: '#fff',
                      animation: 'spin 0.8s linear infinite'
                    }} />
                  )}
                  Post Comment
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid #1e2533',
        padding: '16px 24px',
        textAlign: 'center',
        marginTop: 0
      }}>
        <p style={{ fontSize: 12, color: '#334155' }}>
          Powered by{' '}
          <span style={{ color: '#F47B20', fontWeight: 600 }}>Fifty Studios SRS Platform</span>
        </p>
      </footer>
    </div>
  )
}
