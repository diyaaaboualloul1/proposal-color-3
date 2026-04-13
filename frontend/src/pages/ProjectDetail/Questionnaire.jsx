import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import apiClient from '../../api/client'
import Modal from '../../components/Modal'

const PROJECT_TYPES = ['Web App', 'Mobile App', 'API', 'Desktop', 'Other']
const DEPLOYMENTS = ['Cloud', 'On-Premise', 'Hybrid', 'TBD']

const EMPTY_FORM = {
  project_type: '',
  industry: '',
  target_users: '',
  core_features: '',
  tech_preferences: '',
  integrations: '',
  non_functional_requirements: '',
  timeline: '',
  budget_range: '',
  special_requirements: '',
  existing_systems: '',
  deployment: ''
}

const SECTIONS = [
  {
    title: 'Project Info',
    color: '#F47B20',
    fields: [
      { key: 'project_type', label: 'Project Type', placeholder: 'Select type...', type: 'select', options: PROJECT_TYPES },
      { key: 'industry', label: 'Industry', placeholder: 'e.g. Healthcare, E-commerce, FinTech...' },
      { key: 'target_users', label: 'Target Users', placeholder: 'Who will use this product?', type: 'textarea' },
    ]
  },
  {
    title: 'Technical',
    color: '#8b5cf6',
    fields: [
      { key: 'core_features', label: 'Core Features', placeholder: 'List the main features required...', type: 'textarea', rows: 3 },
      { key: 'tech_preferences', label: 'Tech Preferences', placeholder: 'e.g. React, Node.js, PostgreSQL...' },
      { key: 'integrations', label: 'Integrations', placeholder: 'External APIs, services, or systems to integrate with...', type: 'textarea' },
      { key: 'non_functional_requirements', label: 'Non-Functional Requirements', placeholder: 'Performance, security, scalability, uptime...', type: 'textarea' },
      { key: 'deployment', label: 'Deployment', placeholder: 'Select deployment...', type: 'select', options: DEPLOYMENTS },
      { key: 'existing_systems', label: 'Existing Systems', placeholder: 'Legacy systems, databases, or tools currently in use...', type: 'textarea' },
    ]
  },
  {
    title: 'Business',
    color: '#06b6d4',
    fields: [
      { key: 'timeline', label: 'Timeline', placeholder: 'e.g. 3 months, Q3 2025...' },
      { key: 'budget_range', label: 'Budget Range', placeholder: 'e.g. $10,000 - $50,000...' },
      { key: 'special_requirements', label: 'Special Requirements', placeholder: 'Any specific or unusual requirements...', type: 'textarea' },
    ]
  }
]

const fieldVariants = {
  hidden: { opacity: 0, x: -10 },
  visible: (i) => ({ opacity: 1, x: 0, transition: { delay: i * 0.03 } })
}

export default function Questionnaire({ projectId, onSubmitSuccess, onProjectUpdate }) {
  const [questionnaire, setQuestionnaire] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const textareaRefs = useRef({})

  // Auto-resize a textarea
  const autoResize = (el) => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.max(el.scrollHeight, el.name === 'core_features' ? 120 : 60) + 'px'
  }

  // Resize all textareas — double rAF ensures DOM has fully settled
  useEffect(() => {
    if (!loading) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          Object.values(textareaRefs.current).forEach(el => {
            if (el) autoResize(el)
          })
        })
      })
    }
  }, [form, loading])

  const fetchQuestionnaire = async () => {
    try {
      setLoading(true)
      const res = await apiClient.get(`/projects/${projectId}/questionnaire`)
      const q = res.data.questionnaire || res.data
      setQuestionnaire(q)
      if (q && q.answers) {
        setForm({ ...EMPTY_FORM, ...q.answers })
      }
    } catch (err) {
      if (err.response?.status === 404) {
        setQuestionnaire(null)
      } else {
        setError('Failed to load questionnaire.')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchQuestionnaire()
  }, [projectId])

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
    // Resize immediately — DOM value is already updated before React re-renders
    const el = textareaRefs.current[name]
    if (el) autoResize(el)
  }

  const handleSaveDraft = async () => {
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      await apiClient.put(`/projects/${projectId}/questionnaire`, { answers: form })
      setSuccess('Draft saved successfully.')
      fetchQuestionnaire()
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save draft.')
    } finally {
      setSaving(false)
    }
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    setError('')
    setSuccess('')
    setShowConfirm(false)
    try {
      await apiClient.put(`/projects/${projectId}/questionnaire`, { answers: form })
      await apiClient.post(`/projects/${projectId}/questionnaire/submit`)
      setSuccess('Questionnaire submitted! SRS generation will begin shortly.')
      fetchQuestionnaire()
      if (onProjectUpdate) onProjectUpdate()
      if (onSubmitSuccess) setTimeout(onSubmitSuccess, 800)
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit questionnaire.')
    } finally {
      setSubmitting(false)
    }
  }

  const isSubmitted = questionnaire?.status === 'submitted'

  // Count filled fields
  const filledCount = Object.values(form).filter(v => v && v.trim()).length
  const totalFields = Object.keys(EMPTY_FORM).length
  const progress = Math.round((filledCount / totalFields) * 100)

  const inputBase = {
    width: '100%',
    backgroundColor: '#0f1117',
    border: '1px solid #1e2533',
    borderRadius: '10px',
    color: isSubmitted ? '#94a8b8' : '#f1f5f9',
    fontSize: '0.875rem',
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    padding: '8px 12px',
    opacity: isSubmitted ? 0.7 : 1,
    cursor: isSubmitted ? 'default' : 'auto',
  }

  const onFocus = (e) => {
    if (!isSubmitted) {
      e.target.style.borderColor = '#F47B20'
      e.target.style.boxShadow = '0 0 0 3px rgba(244,123,32,0.1)'
    }
  }
  const onBlur = (e) => {
    e.target.style.borderColor = '#1e2533'
    e.target.style.boxShadow = 'none'
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4 max-w-2xl">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="skeleton h-16 rounded-xl" />
        ))}
      </div>
    )
  }

  return (
    <motion.div
      className="p-6 max-w-2xl"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-base font-semibold" style={{ color: '#f1f5f9' }}>Project Questionnaire</h2>
          <p className="text-xs mt-0.5" style={{ color: '#475569' }}>
            {isSubmitted
              ? '✓ Submitted — read only'
              : questionnaire?.status === 'draft'
              ? 'Draft saved'
              : 'Fill in the project requirements for AI generation'}
          </p>
        </div>
        {isSubmitted && (
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
            style={{ backgroundColor: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', color: '#22c55e' }}
          >
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            Submitted
          </span>
        )}
      </div>

      {/* Progress bar */}
      {!isSubmitted && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs" style={{ color: '#94a3b8' }}>Progress</span>
            <span className="text-xs font-semibold" style={{ color: '#F59340' }}>{filledCount}/{totalFields} fields</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: '#1e2533' }}>
            <motion.div
              className="h-full rounded-full"
              style={{ background: 'linear-gradient(90deg, #F47B20, #8b5cf6)' }}
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </div>
        </div>
      )}

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
        {success && (
          <motion.div
            className="mb-4 p-3 rounded-xl flex items-center gap-2"
            style={{ backgroundColor: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="#22c55e" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <p className="text-sm" style={{ color: '#86efac' }}>{success}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sections */}
      <div className="space-y-4">
        {SECTIONS.map((section, si) => (
          <motion.div
            key={section.title}
            className="rounded-2xl overflow-hidden"
            style={{ backgroundColor: '#0f1117', border: '1px solid #1e2533' }}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: si * 0.08 }}
          >
            {/* Section header */}
            <div
              className="px-5 py-3 flex items-center gap-2"
              style={{ borderBottom: '1px solid #1e2533', backgroundColor: `${section.color}08` }}
            >
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: section.color }}
              />
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: section.color }}>
                {section.title}
              </span>
            </div>

            <div className="px-5 py-2 space-y-4 pb-5">
              {section.fields.map((field, fi) => (
                <motion.div
                  key={field.key}
                  custom={si * 3 + fi}
                  variants={fieldVariants}
                  initial="hidden"
                  animate="visible"
                >
                  <label
                    className="flex items-center gap-2 text-xs font-semibold mb-1.5"
                    style={{ color: '#94a3b8' }}
                  >
                    {field.label}
                    {isSubmitted && form[field.key] && (
                      <svg className="w-3 h-3" fill="none" stroke="#22c55e" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </label>
                  {field.type === 'select' ? (
                    <select
                      name={field.key}
                      value={form[field.key]}
                      onChange={handleChange}
                      disabled={isSubmitted}
                      style={{ ...inputBase }}
                      onFocus={onFocus}
                      onBlur={onBlur}
                    >
                      <option value="" style={{ backgroundColor: '#0f1117' }}>{field.placeholder}</option>
                      {field.options.map((o) => (
                        <option key={o} value={o} style={{ backgroundColor: '#0f1117' }}>{o}</option>
                      ))}
                    </select>
                  ) : field.type === 'textarea' ? (
                    <textarea
                      ref={(el) => { textareaRefs.current[field.key] = el }}
                      name={field.key}
                      value={form[field.key]}
                      onChange={handleChange}
                      disabled={isSubmitted}
                      rows={3}
                      placeholder={!isSubmitted ? field.placeholder : ''}
                      style={{
                        ...inputBase,
                        resize: 'none',
                        overflowY: 'hidden',
                        transition: 'height 0.15s ease',
                        minHeight: field.key === 'core_features' ? '120px' : '60px',
                        // height NOT set here — autoResize owns it, React re-applies fixed height on every re-render
                      }}
                      onFocus={onFocus}
                      onBlur={onBlur}
                    />
                  ) : (
                    <input
                      type="text"
                      name={field.key}
                      value={form[field.key]}
                      onChange={handleChange}
                      disabled={isSubmitted}
                      placeholder={!isSubmitted ? field.placeholder : ''}
                      style={inputBase}
                      onFocus={onFocus}
                      onBlur={onBlur}
                    />
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Actions */}
      {!isSubmitted && (
        <motion.div
          className="flex items-center gap-3 mt-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <motion.button
            onClick={handleSaveDraft}
            disabled={saving || submitting}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-60"
            style={{ color: '#94a3b8', border: '1px solid #1e2533' }}
            whileHover={{ backgroundColor: '#161b27', color: '#f1f5f9', borderColor: '#2d3748' }}
            whileTap={{ scale: 0.97 }}
          >
            {saving && <span className="w-3.5 h-3.5 rounded-full border border-current/30 border-t-current animate-spin" />}
            {saving ? 'Saving...' : 'Save Draft'}
          </motion.button>
          <motion.button
            onClick={() => setShowConfirm(true)}
            disabled={saving || submitting}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg, #F47B20, #D4680A)', boxShadow: '0 4px 12px rgba(244,123,32,0.3)' }}
            whileHover={{ scale: 1.02, boxShadow: '0 6px 18px rgba(244,123,32,0.4)' }}
            whileTap={{ scale: 0.97 }}
          >
            {submitting && <span className="w-3.5 h-3.5 rounded-full border border-white/30 border-t-white animate-spin" />}
            {submitting ? 'Submitting...' : 'Submit Questionnaire'}
          </motion.button>
        </motion.div>
      )}

      {/* Confirmation Modal */}
      <Modal isOpen={showConfirm} onClose={() => setShowConfirm(false)} title="Submit Questionnaire">
        <div className="space-y-4">
          <div
            className="p-4 rounded-xl flex items-start gap-3"
            style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
          >
            <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="#ef4444" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm font-semibold mb-1" style={{ color: '#fca5a5' }}>This action is irreversible</p>
              <p className="text-xs" style={{ color: '#94a3b8' }}>
                Once submitted, you cannot edit the questionnaire. The AI will begin generating your SRS document.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <motion.button
              onClick={handleSubmit}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
              style={{ backgroundColor: '#ef4444' }}
              whileHover={{ backgroundColor: '#dc2626' }}
              whileTap={{ scale: 0.97 }}
            >
              Yes, Submit
            </motion.button>
            <button
              onClick={() => setShowConfirm(false)}
              className="px-4 py-2 text-sm transition-colors"
              style={{ color: '#94a3b8' }}
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </motion.div>
  )
}
