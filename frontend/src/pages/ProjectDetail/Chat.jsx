import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { marked } from 'marked'
import apiClient from '../../api/client'
import { useAuth } from '../../contexts/AuthContext'

const PAGE_SIZE = 30

const msgVariants = {
  hidden: { opacity: 0, y: 12, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.2 } }
}

// Rendered markdown bubble — fades in from raw text
function MarkdownMessage({ content, isStreaming }) {
  const html = content ? marked.parse(content) : ''
  return (
    <motion.div
      className="srs-prose text-sm"
      key={isStreaming ? 'streaming' : 'done'}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

export default function Chat({ projectId, project, onVersionCreated }) {
  const [allMessages, setAllMessages] = useState([])       // full list from server
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE) // how many to show
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [isBackgroundProcessing, setIsBackgroundProcessing] = useState(false)
  const [processingType, setProcessingType] = useState('edit')
  const [processingLabel, setProcessingLabel] = useState('')
  const [error, setError] = useState('')
  const [showTips, setShowTips] = useState(false)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const [undoPending, setUndoPending] = useState(false)
  const messagesEndRef = useRef(null)
  const messagesContainerRef = useRef(null)
  const inputRef = useRef(null)
  const isStreamingRef = useRef(false)
  const { user } = useAuth()

  // Derived: slice allMessages to displayCount
  const messages = allMessages.slice(-displayCount)
  const hasMore = allMessages.length > displayCount

  const scrollToBottom = useCallback((behavior = 'smooth') => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior })
    })
  }, [])

  const fetchMessages = useCallback(async () => {
    if (isStreamingRef.current) return
    try {
      const res = await apiClient.get(`/projects/${projectId}/chat`)
      const msgs = res.data.messages || res.data || []
      const last = msgs[msgs.length - 1]
      if (last?.role === 'user') {
        const ageMs = Date.now() - new Date(last.created_at).getTime()
        if (ageMs > 5 * 60 * 1000) {
          msgs.push({
            id: 'stuck-warning',
            role: 'assistant',
            content: '⚠️ This is taking longer than expected. The AI may still be working — check the **History tab** to see if a new version appeared. If nothing shows up after a few minutes, try your request again.',
            isStuck: true,
            created_at: new Date().toISOString()
          })
          setIsBackgroundProcessing(false)
        } else {
          setIsBackgroundProcessing(true)
        }
      } else {
        setIsBackgroundProcessing(false)
      }
      setAllMessages(msgs)
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    fetchMessages()
  }, [fetchMessages])

  // Auto-poll when last message is user and recent
  useEffect(() => {
    const lastMsg = allMessages[allMessages.length - 1]
    if (!lastMsg || lastMsg.role !== 'user' || sending) return
    const ageMs = Date.now() - new Date(lastMsg.created_at).getTime()
    if (ageMs > 5 * 60 * 1000) return
    const interval = setInterval(fetchMessages, 5000)
    return () => clearInterval(interval)
  }, [allMessages, sending, fetchMessages])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [allMessages, sending])

  // Track scroll position for "jump to bottom" button
  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return
    const onScroll = () => {
      const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
      setShowScrollBtn(distFromBottom > 200)
    }
    container.addEventListener('scroll', onScroll)
    return () => container.removeEventListener('scroll', onScroll)
  }, [])

  // /undo confirmation handler
  const handleUndoConfirm = () => {
    setUndoPending(false)
    setInput('/undo')
    setTimeout(() => handleSendText('/undo'), 50)
  }

  const handleSend = async () => {
    const text = input.trim()
    if (!text || sending || isBackgroundProcessing) return

    // /undo — intercept with confirmation dialog
    if (text === '/undo' && !undoPending) {
      setUndoPending(true)
      setInput('')
      return
    }

    handleSendText(text)
  }

  const handleSendText = async (text) => {
    if (!text || sending || isBackgroundProcessing) return
    setUndoPending(false)
    setSending(true)
    setInput('')
    setError('')
    const isCommand = text.startsWith('/')
    const isConfirm = /^(yes|yeah|yep|ok|okay|confirm|proceed|go ahead|do it|start)$/i.test(text)
    setProcessingType(isCommand ? 'command' : isConfirm ? 'confirm' : 'edit')
    const label = text.length > 50 ? text.substring(0, 50) + '...' : text
    setProcessingLabel(label)

    // Optimistically add user message
    const tempUserMsg = {
      id: Date.now(),
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
      sender_name: user?.name
    }
    setAllMessages(prev => [...prev, tempUserMsg])
    scrollToBottom()

    // Add AI placeholder with streaming flag
    const tempAiId = Date.now() + 1
    const tempAiMsg = {
      id: tempAiId,
      role: 'assistant',
      content: '',
      created_at: new Date().toISOString(),
      isStreaming: true
    }
    setAllMessages(prev => [...prev, tempAiMsg])
    scrollToBottom()

    let streamedContent = ''
    const token = localStorage.getItem('srs_token')
    // Match apiClient's baseURL fallback so /api proxies correctly in dev
    const baseURL = import.meta.env.VITE_API_URL || '/api'
    const url = `${baseURL}/projects/${projectId}/chat/stream?message=${encodeURIComponent(text)}&token=${token}`

    isStreamingRef.current = true
    const eventSource = new EventSource(url)

    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.type === 'chunk') {
          streamedContent += data.content
          setAllMessages(prev => prev.map(m =>
            m.id === tempAiId
              ? { ...m, content: streamedContent }
              : m
          ))
          scrollToBottom()
        } else if (data.type === 'queued') {
          eventSource.close()
          isStreamingRef.current = false
          const userMsgCreatedAt = data.userMessageCreatedAt || new Date().toISOString()
          setAllMessages(prev => prev.filter(m => m.id !== tempAiId))
          setSending(false)
          setIsBackgroundProcessing(true)
          const pollInterval = setInterval(async () => {
            try {
              const res = await apiClient.get(`/projects/${projectId}/chat`)
              const msgs = res.data.messages || []
              const newAiMsg = msgs.find(m =>
                m.role === 'assistant' && new Date(m.created_at) > new Date(userMsgCreatedAt)
              )
              if (newAiMsg) {
                clearInterval(pollInterval)
                setIsBackgroundProcessing(false)
                setAllMessages(msgs)
                if (onVersionCreated) onVersionCreated()
                scrollToBottom()
              }
            } catch {}
          }, 5000)
          setTimeout(() => {
            clearInterval(pollInterval)
            setIsBackgroundProcessing(false)
            setAllMessages(prev => {
              const hasNewReply = prev.some(m => m.role === 'assistant' && new Date(m.created_at) > new Date(userMsgCreatedAt))
              if (!hasNewReply) {
                return [...prev, {
                  id: Date.now(), role: 'assistant', isStuck: true,
                  content: '⚠️ This is taking longer than expected. Check the History tab for a new version, or try again.',
                  created_at: new Date().toISOString()
                }]
              }
              return prev
            })
          }, 10 * 60 * 1000)
        } else if (data.type === 'done') {
          const finalContent = data.aiMessage?.content || streamedContent
          const version = data.version || data.srs_version || null
          setAllMessages(prev => prev.map(m =>
            m.id === tempAiId
              ? { ...m, content: finalContent, isStreaming: false, srs_version: version }
              : m
          ))
          setSending(false)
          isStreamingRef.current = false
          eventSource.close()
          if (onVersionCreated) onVersionCreated()
          scrollToBottom()
        } else if (data.type === 'error') {
          setError(data.message || 'Failed to get response.')
          setAllMessages(prev => prev.filter(m => m.id !== tempAiId))
          setSending(false)
          isStreamingRef.current = false
          eventSource.close()
        }
      } catch {
        // ignore keep-alive parse errors
      }
    }

    eventSource.onerror = () => {
      // SSE connection dropped — AI may still be processing in background
      eventSource.close()
      isStreamingRef.current = false
      setSending(false)
      setAllMessages(prev => prev.filter(m => m.id !== tempAiId))
      setIsBackgroundProcessing(true)
      const anchorTime = tempUserMsg.created_at
      // Poll every 5s, only stop when assistant msg NEWER than our user msg appears
      const pollInterval = setInterval(async () => {
        try {
          const res = await apiClient.get(`/projects/${projectId}/chat`)
          const msgs = res.data.messages || []
          const newAiMsg = msgs.find(m =>
            m.role === 'assistant' && new Date(m.created_at) > new Date(anchorTime)
          )
          if (newAiMsg) {
            clearInterval(pollInterval)
            setIsBackgroundProcessing(false)
            setAllMessages(msgs)
            if (onVersionCreated) onVersionCreated()
          }
        } catch {}
      }, 5000)
      // Stop polling after 10 minutes
      setTimeout(() => { clearInterval(pollInterval); setIsBackgroundProcessing(false) }, 10 * 60 * 1000)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const formatTime = (d) => {
    if (!d) return ''
    return new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="flex flex-col relative" style={{ height: 'calc(100vh - 12.5rem)' }}>
      {/* CSS for streaming cursor */}
      <style>{`
        @keyframes chat-cursor-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        .chat-stream-cursor {
          display: inline-block;
          color: #F47B20;
          font-weight: bold;
          animation: chat-cursor-blink 0.7s ease-in-out infinite;
          margin-left: 1px;
        }
        @keyframes streaming-border-pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
        .streaming-bubble-border {
          border-left: 3px solid #F47B20 !important;
          animation: streaming-border-pulse 1.4s ease-in-out infinite;
        }
      `}</style>

      {/* Undo confirmation dialog */}
      <AnimatePresence>
        {undoPending && (
          <motion.div
            className="absolute inset-0 z-20 flex items-center justify-center"
            style={{ background: 'rgba(3,7,18,0.7)', backdropFilter: 'blur(6px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="rounded-2xl p-6 max-w-sm w-full mx-6"
              style={{ background: '#0d1117', border: '1px solid rgba(239,68,68,0.3)', boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }}
              initial={{ scale: 0.9, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 10 }}
              transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>
                  <span style={{ fontSize: 18 }}>↩️</span>
                </div>
                <div>
                  <p className="text-sm font-bold" style={{ color: '#f1f5f9' }}>Undo last version?</p>
                  <p className="text-xs" style={{ color: '#475569' }}>This will permanently delete the latest SRS version.</p>
                </div>
              </div>
              <p className="text-xs mb-5 px-1" style={{ color: '#64748b' }}>
                The previous version will become the active document. This action <span style={{ color: '#ef4444', fontWeight: 600 }}>cannot be reversed</span>.
              </p>
              <div className="flex gap-2">
                <motion.button
                  whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  onClick={handleUndoConfirm}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                  style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444' }}
                >
                  ↩️ Yes, undo
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  onClick={() => setUndoPending(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #1e2533', color: '#94a3b8' }}
                >
                  Cancel
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Jump to bottom button */}
      <AnimatePresence>
        {showScrollBtn && (
          <motion.button
            className="absolute z-10 flex items-center justify-center w-8 h-8 rounded-full shadow-lg"
            style={{
              bottom: '7rem',
              right: '1.5rem',
              background: '#161b27',
              border: '1px solid rgba(244,123,32,0.35)',
              color: '#F59340',
            }}
            initial={{ opacity: 0, scale: 0.7, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.7, y: 8 }}
            transition={{ type: 'spring', stiffness: 400, damping: 22 }}
            onClick={() => scrollToBottom('smooth')}
            title="Jump to bottom"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Messages */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
        {loading ? (
          <div className="space-y-4 pt-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
                <div className={`skeleton rounded-2xl ${i % 2 === 0 ? 'w-2/3 h-16' : 'w-1/2 h-12'}`} />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <motion.div
            className="text-center py-14"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{
                background: 'linear-gradient(135deg, rgba(244,123,32,0.15), rgba(139,92,246,0.15))',
                border: '1px solid rgba(244,123,32,0.2)'
              }}
            >
              <svg className="w-7 h-7" style={{ color: '#F59340' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold mb-1" style={{ color: '#94a3b8' }}>Ask the AI</h3>
            <p className="text-xs" style={{ color: '#475569' }}>
              Ask AI to modify or improve your SRS document.
            </p>
            <p className="text-xs mt-1" style={{ color: '#334155' }}>Each AI response creates a new version.</p>
          </motion.div>
        ) : (
          <AnimatePresence initial={false}>
            {/* Load more */}
            {hasMore && (
              <motion.div
                className="flex justify-center pb-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <button
                  onClick={() => setDisplayCount(c => c + PAGE_SIZE)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all hover:opacity-80"
                  style={{ background: '#111827', border: '1px solid #1e2533', color: '#94a3b8' }}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                  Load {Math.min(PAGE_SIZE, allMessages.length - displayCount)} earlier messages
                </button>
              </motion.div>
            )}

            {messages.map((msg, idx) => {
              const isUser = msg.role === 'user'
              const isStreamingMsg = msg.isStreaming
              const isStuck = msg.isStuck
              const hasContent = !!msg.content
              const msgType = msg.msg_type || 'message'

              // Bubble style by type
              const bubbleStyle = (() => {
                if (isUser) return {
                  background: 'linear-gradient(135deg, #F47B20, #D4680A)',
                  border: 'none',
                  boxShadow: '0 4px 12px rgba(244,123,32,0.2)'
                }
                if (isStuck) return {
                  background: 'rgba(245,158,11,0.06)',
                  border: '1px solid rgba(245,158,11,0.3)'
                }
                if (msgType === 'clarify') return {
                  background: 'rgba(245,158,11,0.07)',
                  border: '1px solid rgba(245,158,11,0.35)',
                  borderLeft: '3px solid #F59340'
                }
                if (msgType === 'confirm') return {
                  background: 'rgba(34,197,94,0.06)',
                  border: '1px solid rgba(34,197,94,0.3)',
                  borderLeft: '3px solid #22c55e'
                }
                if (msgType === 'success') return {
                  background: 'rgba(34,197,94,0.05)',
                  border: '1px solid rgba(34,197,94,0.2)'
                }
                if (msgType === 'error') return {
                  background: 'rgba(239,68,68,0.06)',
                  border: '1px solid rgba(239,68,68,0.25)'
                }
                if (isStreamingMsg) return {
                  background: '#161b27',
                  border: '1px solid #1e2533',
                  boxShadow: '0 0 20px rgba(244,123,32,0.06)'
                }
                return { background: '#161b27', border: '1px solid #1e2533' }
              })()

              // Label by type
              const aiLabel = (() => {
                if (msgType === 'clarify') return '🟡 Needs clarification'
                if (msgType === 'confirm') return '🟢 Edit plan'
                if (msgType === 'success') return '✅ Done'
                if (msgType === 'error') return '⚠️ Error'
                if (msgType === 'info') return 'ℹ️ Info'
                return 'AI Assistant'
              })()

              return (
                <motion.div
                  key={msg.id || idx}
                  className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                  variants={msgVariants}
                  initial="hidden"
                  animate="visible"
                >
                  <div className="max-w-[80%]">
                    {!isUser && (
                      <div className="flex items-center gap-2 mb-1.5 ml-1">
                        <div
                          className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{
                            background: 'linear-gradient(135deg, rgba(244,123,32,0.2), rgba(139,92,246,0.2))',
                            border: '1px solid rgba(244,123,32,0.3)'
                          }}
                        >
                          <svg className="w-3.5 h-3.5" style={{ color: '#F59340' }} fill="currentColor" viewBox="0 0 20 20">
                            <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z" />
                          </svg>
                        </div>
                        <span className="text-xs" style={{ color: '#94a3b8' }}>{aiLabel}</span>
                        <AnimatePresence>
                          {msgType === 'success' && msg.srs_version && (
                            <motion.span
                              className="px-2 py-0.5 text-xs font-medium rounded-full"
                              style={{ backgroundColor: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e' }}
                              initial={{ scale: 0, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                            >
                              v{msg.srs_version}
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </div>
                    )}

                    <div
                      className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                        isUser ? 'rounded-br-sm' : `rounded-bl-sm${isStreamingMsg ? ' streaming-bubble-border' : ''}`
                      }`}
                      style={{ color: '#f1f5f9', transition: 'box-shadow 0.3s ease', ...bubbleStyle }}
                    >
                      {isUser ? (
                        msg.content
                      ) : isStreamingMsg && !hasContent ? (
                        <div className="flex gap-1.5 items-center py-1">
                          {[0, 1, 2].map(i => (
                            <motion.div key={i} className="w-2 h-2 rounded-full" style={{ backgroundColor: '#F47B20' }}
                              animate={{ y: [0, -5, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }} />
                          ))}
                        </div>
                      ) : isStreamingMsg && hasContent ? (
                        <div className="text-sm leading-relaxed" style={{ color: '#f1f5f9', whiteSpace: 'pre-wrap' }}>
                          {msg.content}<span className="chat-stream-cursor">▊</span>
                        </div>
                      ) : (
                        <MarkdownMessage content={msg.content} isStreaming={false} />
                      )}
                    </div>

                    {/* Yes/No buttons for confirm type */}
                    {msgType === 'confirm' && !isUser && (
                      <div className="flex gap-2 mt-2 ml-1">
                        <motion.button
                          whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                          onClick={() => { setInput('yes'); setTimeout(() => inputRef.current?.focus(), 50) }}
                          className="px-4 py-1.5 rounded-xl text-xs font-semibold"
                          style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)', color: '#22c55e' }}
                        >
                          ✅ Yes, proceed
                        </motion.button>
                        <motion.button
                          whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                          onClick={() => { setInput('no'); setTimeout(() => inputRef.current?.focus(), 50) }}
                          className="px-4 py-1.5 rounded-xl text-xs font-semibold"
                          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}
                        >
                          ✗ Cancel
                        </motion.button>
                      </div>
                    )}

                    <div className={`text-xs mt-1 ${isUser ? 'text-right mr-1' : 'ml-1'}`} style={{ color: '#334155' }}>
                      {formatTime(msg.created_at)}
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        )}

        {/* Processing bubble — shown when sending, background processing, or last msg is user and recent */}
        {allMessages.length > 0 && allMessages[allMessages.length - 1]?.role === 'user' && !allMessages.find(m => m.isStuck) &&
          (sending || isBackgroundProcessing || (Date.now() - new Date(allMessages[allMessages.length - 1]?.created_at).getTime()) < 5 * 60 * 1000) && (
          <motion.div
            className="flex justify-start px-6 pb-2"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <div className="flex items-start gap-2 max-w-xs">
              <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 mt-1" style={{ background: 'linear-gradient(135deg, #F47B20, #D4680A)' }}>
                <span style={{ fontSize: 12 }}>⚡</span>
              </div>
              <div className="px-4 py-3 rounded-2xl rounded-tl-sm" style={{ backgroundColor: '#161b27', border: '1px solid #1e2533' }}>
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    {[0,1,2].map(i => (
                      <motion.div key={i} style={{ width:6, height:6, borderRadius:'50%', backgroundColor:'#F47B20' }}
                        animate={{ opacity:[0.3,1,0.3], y:[0,-3,0] }}
                        transition={{ duration:1, repeat:Infinity, delay:i*0.2 }} />
                    ))}
                  </div>
                  <span className="text-xs" style={{ color: '#475569' }}>
                    {isBackgroundProcessing
                      ? processingType === 'command'
                        ? <>Running <span style={{ color: '#F47B20', fontWeight: 600 }}>{processingLabel}</span>...</>
                        : processingType === 'confirm'
                        ? 'Generating new SRS version (~4-5 min)...'
                        : <><span style={{ color: '#94a3b8' }}>Editing:</span> <span style={{ color: '#f1f5f9', fontStyle: 'italic' }}>"{processingLabel}"</span></>
                      : 'AI is processing...'}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            className="px-6 py-2"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <div
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs"
              style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5' }}
            >
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input — blocked if no SRS generated yet */}
      <div className="px-6 py-4" style={{ borderTop: '1px solid #1e2533' }}>
        {project?.generation_status !== 'ready' && messages.length === 0 ? (
          <motion.div
            className="flex flex-col items-center justify-center gap-3 py-6 rounded-2xl"
            style={{ backgroundColor: 'rgba(244,123,32,0.04)', border: '1px dashed rgba(244,123,32,0.2)' }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'rgba(244,123,32,0.1)', border: '1px solid rgba(244,123,32,0.2)' }}>
              <svg className="w-5 h-5" fill="none" stroke="#F47B20" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold mb-1" style={{ color: '#f1f5f9' }}>Generate your SRS document first</p>
              <p className="text-xs" style={{ color: '#475569' }}>Submit the questionnaire to generate your first SRS version</p>
            </div>
          </motion.div>
        ) : (
        <div>
        {/* Command menu popup */}
        <AnimatePresence>
          {input.startsWith('/') && !sending && !isBackgroundProcessing && (
            <motion.div
              className="mb-2 rounded-xl overflow-hidden"
              style={{ background: '#0f1117', border: '1px solid #1e2533' }}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
            >
              {[
                { cmd: '/status', desc: 'Show current version and stats' },
                { cmd: '/undo',   desc: 'Rollback to previous version' },
                { cmd: '/diff',   desc: 'What changed in last edit' },
                { cmd: '/scope',  desc: 'Summarize project scope' },
              ].filter(c => c.cmd.startsWith(input.toLowerCase())).map(({ cmd, desc }) => (
                <button
                  key={cmd}
                  onMouseDown={(e) => { e.preventDefault(); setInput(cmd) }}
                  className="flex items-center gap-3 w-full px-4 py-2.5 text-left hover:bg-white/5 transition-colors"
                >
                  <span className="text-xs font-mono font-bold" style={{ color: '#F47B20' }}>{cmd}</span>
                  <span className="text-xs" style={{ color: '#64748b' }}>{desc}</span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-end gap-2.5">
          <div
            className="flex-1 rounded-2xl transition-all"
            style={{ backgroundColor: '#0f1117', border: '1px solid #1e2533' }}
            onFocusCapture={e => {
              e.currentTarget.style.borderColor = '#F47B20'
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(244,123,32,0.08)'
            }}
            onBlurCapture={e => {
              e.currentTarget.style.borderColor = '#1e2533'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sending || isBackgroundProcessing}
              placeholder={isBackgroundProcessing
                ? processingType === 'command' ? 'Running command...'
                  : processingType === 'confirm' ? 'Generating version...'
                  : 'Waiting for AI response...'
                : 'Ask AI to edit SRS... or type / for commands'}
              rows={2}
              className="w-full px-4 py-3 text-sm outline-none resize-none disabled:opacity-60"
              style={{
                backgroundColor: 'transparent',
                color: '#f1f5f9',
                borderRadius: '16px',
              }}
            />
          </div>
          <motion.button
            onClick={handleSend}
            disabled={sending || isBackgroundProcessing || !input.trim()}
            className="w-10 h-10 flex items-center justify-center rounded-xl text-white flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(135deg, #F47B20, #D4680A)' }}
            whileHover={{ scale: 1.05, boxShadow: '0 4px 12px rgba(244,123,32,0.3)' }}
            whileTap={{ scale: 0.93 }}
          >
            {sending || isBackgroundProcessing ? (
              <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            )}
          </motion.button>
        </div>
        <div className="flex items-center justify-between mt-2 ml-1">
          <p className="text-xs" style={{ color: '#334155' }}>Enter to send · Shift+Enter for new line</p>
          <button
            onClick={() => setShowTips(p => !p)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
            style={{
              backgroundColor: showTips ? 'rgba(244,123,32,0.12)' : 'rgba(244,123,32,0.06)',
              border: `1px solid ${showTips ? 'rgba(244,123,32,0.35)' : 'rgba(244,123,32,0.15)'}`,
              color: showTips ? '#F47B20' : '#94a3b8'
            }}
          >
            💡 <span>Tips & Commands</span>
            <svg className="w-3 h-3 transition-transform" style={{ transform: showTips ? 'rotate(180deg)' : 'rotate(0deg)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
        <AnimatePresence>
          {showTips && (
            <motion.div
              className="mt-3 rounded-2xl overflow-hidden"
              style={{ backgroundColor: '#0a0e1a', border: '1px solid rgba(244,123,32,0.18)', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.2 }}
            >
              {/* Header */}
              <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid #1e2533', background: 'rgba(244,123,32,0.04)' }}>
                <span style={{ fontSize: 15 }}>💡</span>
                <span className="text-sm font-bold" style={{ color: '#F47B20' }}>Tips & Commands</span>
                <span className="ml-auto text-xs" style={{ color: '#334155' }}>Type / to open command menu</span>
              </div>

              <div className="p-4 space-y-5">

                {/* Commands section */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-2.5" style={{ color: '#475569' }}>⌨️ Commands</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { cmd: '/status', icon: '📊', desc: 'Show current version number and document stats' },
                      { cmd: '/diff',   icon: '🔍', desc: 'AI summary of what changed in the last edit' },
                      { cmd: '/undo',   icon: '↩️', desc: 'Roll back to the previous SRS version' },
                      { cmd: '/scope',  icon: '🗺️', desc: 'Summarize the full project scope in plain English' },
                    ].map(({ cmd, icon, desc }) => (
                      <motion.button
                        key={cmd}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.97 }}
                        onMouseDown={(e) => { e.preventDefault(); setInput(cmd); setTimeout(() => inputRef.current?.focus(), 50) }}
                        className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all"
                        style={{ background: '#111827', border: '1px solid #1e2533' }}
                      >
                        <span style={{ fontSize: 14, lineHeight: 1.4 }}>{icon}</span>
                        <div>
                          <p className="text-xs font-bold font-mono mb-0.5" style={{ color: '#F47B20' }}>{cmd}</p>
                          <p className="text-[10px] leading-relaxed" style={{ color: '#475569' }}>{desc}</p>
                        </div>
                      </motion.button>
                    ))}
                  </div>
                </div>

                {/* Divider */}
                <div style={{ height: 1, background: '#1e2533' }} />

                {/* How the AI flow works */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-2.5" style={{ color: '#475569' }}>🤖 How the AI Flow Works</p>
                  <div className="space-y-2">
                    {[
                      { icon: '🟡', color: '#F59340', border: 'rgba(245,158,11,0.3)', label: 'Clarify', desc: 'AI may ask a question before editing — just answer and it proceeds.' },
                      { icon: '🟢', color: '#22c55e', border: 'rgba(34,197,94,0.3)', label: 'Confirm', desc: 'For big changes, AI shows a plan first. Hit Yes/No to approve or cancel.' },
                      { icon: '✅', color: '#22c55e', border: 'rgba(34,197,94,0.2)', label: 'Done', desc: 'Edit applied. A new versioned SRS is saved with a diff summary.' },
                      { icon: '⚠️', color: '#ef4444', border: 'rgba(239,68,68,0.25)', label: 'Error', desc: 'Something went wrong — try rephrasing your request.' },
                    ].map(({ icon, color, border, label, desc }) => (
                      <div key={label} className="flex items-start gap-2.5 px-3 py-2 rounded-xl" style={{ background: '#111827', border: `1px solid ${border}` }}>
                        <span style={{ fontSize: 13, marginTop: 1 }}>{icon}</span>
                        <div>
                          <span className="text-xs font-semibold" style={{ color }}>{label} — </span>
                          <span className="text-xs" style={{ color: '#64748b' }}>{desc}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Divider */}
                <div style={{ height: 1, background: '#1e2533' }} />

                {/* Edit tips */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-2.5" style={{ color: '#475569' }}>✍️ Writing Good Edits</p>
                  <div className="space-y-2">
                    {[
                      { label: 'Be specific', example: '"Add a section about push notifications with Firebase"' },
                      { label: 'Reference sections', example: '"In section 3.1, add FR-010: OAuth via Google"' },
                      { label: 'Batch edits', example: '"Do 3 things: 1) Add glossary 2) Update timeline 3) Add Arabic"' },
                      { label: 'Tone / style', example: '"Make the whole doc more formal and professional"' },
                      { label: 'Targeted rewrite', example: '"Rewrite the non-functional requirements section only"' },
                    ].map((tip, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <div className="w-1 h-1 rounded-full mt-2 flex-shrink-0" style={{ backgroundColor: '#F47B20' }} />
                        <p className="text-xs leading-relaxed" style={{ color: '#64748b' }}>
                          <span className="font-semibold" style={{ color: '#94a3b8' }}>{tip.label}:</span>{' '}
                          <span style={{ color: '#475569', fontStyle: 'italic' }}>{tip.example}</span>
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Footer note */}
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'rgba(244,123,32,0.04)', border: '1px solid rgba(244,123,32,0.1)' }}>
                  <span style={{ fontSize: 12 }}>📝</span>
                  <p className="text-[11px]" style={{ color: '#475569' }}>
                    Every edit creates a new SRS version — view them all in the <span style={{ color: '#F59340', fontWeight: 600 }}>History tab</span>.
                  </p>
                </div>

              </div>
            </motion.div>
          )}
        </AnimatePresence>
        </div>
        )}
      </div>
    </div>
  )
}
