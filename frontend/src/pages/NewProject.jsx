import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import apiClient from '../api/client'

export default function NewProject() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    name: '',
    client_name: '',
    client_contact: '',
    description: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim() || !form.client_name.trim()) {
      setError('Project name and client name are required.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await apiClient.post('/projects', form)
      const project = res.data.project || res.data
      navigate(`/projects/${project.id}`)
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create project.')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = {
    backgroundColor: '#0f1117',
    border: '1px solid #1e2533',
    color: '#f1f5f9',
    borderRadius: '12px',
    width: '100%',
    padding: '10px 14px',
    fontSize: '0.875rem',
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s'
  }

  const handleFocus = (e) => {
    e.target.style.borderColor = '#F47B20'
    e.target.style.boxShadow = '0 0 0 3px rgba(244,123,32,0.1)'
  }
  const handleBlur = (e) => {
    e.target.style.borderColor = '#1e2533'
    e.target.style.boxShadow = 'none'
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Header */}
      <motion.div
        className="flex items-center gap-3 mb-8"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <motion.button
          onClick={() => navigate('/')}
          className="p-2 rounded-xl transition-colors"
          style={{ color: '#94a3b8', border: '1px solid #1e2533', backgroundColor: '#0f1117' }}
          whileHover={{ backgroundColor: '#161b27', color: '#f1f5f9', borderColor: '#2d3748' }}
          whileTap={{ scale: 0.93 }}
        >
          <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </motion.button>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#f1f5f9' }}>New Project</h1>
          <p className="text-sm mt-0.5" style={{ color: '#475569' }}>Create a new client project</p>
        </div>
      </motion.div>

      {/* Form */}
      <motion.div
        className="rounded-2xl p-6"
        style={{ backgroundColor: '#0f1117', border: '1px solid #1e2533' }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.3 }}
      >
        <AnimatePresence>
          {error && (
            <motion.div
              className="mb-5 p-3 rounded-xl flex items-start gap-2"
              style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <svg className="w-4 h-4 mt-0.5" fill="none" stroke="#ef4444" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p className="text-sm" style={{ color: '#fca5a5' }}>{error}</p>
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={handleSubmit} className="space-y-5">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: '#94a3b8' }}>
              Project Name <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              required
              placeholder="e.g. Acme Corp Website"
              style={inputStyle}
              onFocus={handleFocus}
              onBlur={handleBlur}
            />
          </motion.div>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: '#94a3b8' }}>
              Client Name <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="text"
              name="client_name"
              value={form.client_name}
              onChange={handleChange}
              required
              placeholder="e.g. Acme Corporation"
              style={inputStyle}
              onFocus={handleFocus}
              onBlur={handleBlur}
            />
          </motion.div>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: '#94a3b8' }}>Client Contact</label>
            <input
              type="text"
              name="client_contact"
              value={form.client_contact}
              onChange={handleChange}
              placeholder="e.g. John Doe (john@acme.com)"
              style={inputStyle}
              onFocus={handleFocus}
              onBlur={handleBlur}
            />
          </motion.div>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: '#94a3b8' }}>Description</label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={3}
              placeholder="Brief project description..."
              style={{ ...inputStyle, resize: 'none' }}
              onFocus={handleFocus}
              onBlur={handleBlur}
            />
          </motion.div>

          <motion.div
            className="flex items-center gap-3 pt-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35 }}
          >
            <motion.button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
              style={{
                background: 'linear-gradient(135deg, #F47B20, #D4680A)',
                boxShadow: '0 4px 14px rgba(244,123,32,0.3)'
              }}
              whileHover={{ scale: 1.02, boxShadow: '0 6px 20px rgba(244,123,32,0.4)' }}
              whileTap={{ scale: 0.97 }}
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  Create Project
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </>
              )}
            </motion.button>
            <motion.button
              type="button"
              onClick={() => navigate('/')}
              className="px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
              style={{ color: '#94a3b8', border: '1px solid #1e2533' }}
              whileHover={{ borderColor: '#2d3748', color: '#f1f5f9' }}
              whileTap={{ scale: 0.97 }}
            >
              Cancel
            </motion.button>
          </motion.div>
        </form>
      </motion.div>
    </div>
  )
}
