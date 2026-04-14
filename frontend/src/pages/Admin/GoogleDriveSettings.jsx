import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import apiClient from '../../api/client'
import { useAuth } from '../../contexts/AuthContext'

const SETUP_STEPS = [
  {
    step: 1,
    title: 'Create Google Cloud Project',
    description: 'Go to console.cloud.google.com, create a new project named "SRS Platform"',
  },
  {
    step: 2,
    title: 'Enable Google Drive API',
    description: 'In APIs & Services > Library, search and enable "Google Drive API"',
  },
  {
    step: 3,
    title: 'Enable Google Docs API',
    description: 'In APIs & Services > Library, search and enable "Google Docs API"',
  },
  {
    step: 4,
    title: 'Create Service Account',
    description: 'In APIs & Services > Credentials, click "Create Credentials > Service Account". Name it "SRS Platform Drive"',
  },
  {
    step: 5,
    title: 'Download Service Account Key',
    description: 'Click the service account > Keys tab > Add Key > Create New Key > JSON. Download the file',
  },
  {
    step: 6,
    title: 'Copy Service Account Email',
    description: 'From the Credentials page, copy the service account email (looks like name@project-id.iam.gserviceaccount.com)',
  },
  {
    step: 7,
    title: 'Create Root Folder in Google Drive',
    description: 'Create a new folder in Google Drive called "SRS Platform". Right-click > Share > add the service account email with "Editor" access',
  },
  {
    step: 8,
    title: 'Copy Root Folder ID',
    description: 'Open the folder. The folder ID is the part of the URL after /folders/ (e.g. https://drive.google.com/drive/folders/THIS_PART_IS_THE_ID)',
  },
]

const inputStyle = {
  width: '100%',
  padding: '8px 12px',
  backgroundColor: '#0f1117',
  border: '1px solid #1e2533',
  borderRadius: '10px',
  color: '#f1f5f9',
  fontSize: '0.875rem',
  outline: 'none',
}

export default function GoogleDriveSettings() {
  const { isSuperAdmin } = useAuth()

  const [enabled, setEnabled] = useState(false)
  const [email, setEmail] = useState('')
  const [jsonKey, setJsonKey] = useState('')
  const [rootFolderId, setRootFolderId] = useState('')
  const [hasExistingKey, setHasExistingKey] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState('')
  const [testResult, setTestResult] = useState(null)
  const [error, setError] = useState('')
  const [showInstructions, setShowInstructions] = useState(false)

  const fetchSettings = useCallback(async () => {
    if (!isSuperAdmin()) {
      setLoading(false)
      return
    }
    try {
      const res = await apiClient.get('/admin/settings/google-drive')
      const data = res.data
      setEnabled(data.google_drive_enabled === 'true' || data.google_drive_enabled === true)
      setEmail(data.google_service_account_email || '')
      setRootFolderId(data.google_drive_root_folder_id || '')
      setHasExistingKey(data.has_service_account_key || false)
    } catch {
      setError('Failed to load settings.')
    } finally {
      setLoading(false)
    }
  }, [isSuperAdmin])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSaveSuccess('')
    try {
      await apiClient.put('/admin/settings/google-drive', {
        google_drive_enabled: enabled,
        google_drive_root_folder_id: rootFolderId,
        google_service_account_email: email,
        google_service_account_key: jsonKey.trim() !== '' ? jsonKey : undefined,
      })
      setSaveSuccess('Settings saved successfully!')
      setHasExistingKey(true)
      setJsonKey('')
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save settings.')
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    setTesting(true)
    setError('')
    setTestResult(null)
    try {
      const res = await apiClient.post('/admin/settings/google-drive/test')
      setTestResult({ success: true, message: res.data.message || 'Connection successful!' })
    } catch (err) {
      setTestResult({ success: false, error: err.response?.data?.error || 'Connection failed.' })
    } finally {
      setTesting(false)
    }
  }

  if (!isSuperAdmin()) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-sm" style={{ color: '#94a3b8' }}>Access denied. Super admin required.</p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-1" style={{ color: '#f1f5f9' }}>Google Drive Integration</h1>
        <p className="text-sm" style={{ color: '#64748b' }}>
          Upload SRS versions to Google Drive so clients can open documents directly in Google Docs.
        </p>
      </div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mb-6 px-4 py-3 rounded-xl text-sm"
            style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}
          >
            {error}
          </motion.div>
        )}
        {saveSuccess && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mb-6 px-4 py-3 rounded-xl text-sm"
            style={{ backgroundColor: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ade80' }}
          >
            {saveSuccess}
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#F47B20', borderTopColor: 'transparent' }} />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Enable Toggle */}
          <div
            className="p-5 rounded-xl"
            style={{ backgroundColor: '#0f1628', border: '1px solid #1e2533' }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold" style={{ color: '#f1f5f9' }}>Enable Google Drive</p>
                <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>
                  When enabled, an "Upload to Drive" button will appear for SRS versions.
                </p>
              </div>
              <button
                onClick={() => setEnabled(!enabled)}
                className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
                style={{ backgroundColor: enabled ? '#22c55e' : '#1e2533' }}
              >
                <span
                  className="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
                  style={{ transform: enabled ? 'translateX(26px)' : 'translateX(4px)' }}
                />
              </button>
            </div>
          </div>

          {/* Settings Fields */}
          <div
            className="p-5 rounded-xl space-y-4"
            style={{ backgroundColor: '#0f1628', border: '1px solid #1e2533' }}
          >
            <p className="text-sm font-semibold" style={{ color: '#f1f5f9' }}>Service Account Configuration</p>

            {/* Service Account Email */}
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: '#94a3b8' }}>
                Service Account Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="srs-drive@project.iam.gserviceaccount.com"
                style={inputStyle}
                onFocus={e => { e.target.style.borderColor = '#F47B20'; e.target.style.boxShadow = '0 0 0 3px rgba(244,123,32,0.1)' }}
                onBlur={e => { e.target.style.borderColor = '#1e2533'; e.target.style.boxShadow = 'none' }}
              />
            </div>

            {/* Service Account JSON Key */}
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: '#94a3b8' }}>
                Service Account Key (JSON)
              </label>
              {hasExistingKey && !jsonKey && (
                <p className="text-xs mb-2" style={{ color: '#64748b' }}>
                  A key is already saved. Paste a new JSON key only if you want to replace it.
                </p>
              )}
              <textarea
                value={jsonKey}
                onChange={e => setJsonKey(e.target.value)}
                placeholder={'{\n  "type": "service_account",\n  "project_id": "...",\n  ...\n}'}
                rows={6}
                style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '0.75rem', resize: 'vertical' }}
                onFocus={e => { e.target.style.borderColor = '#F47B20'; e.target.style.boxShadow = '0 0 0 3px rgba(244,123,32,0.1)' }}
                onBlur={e => { e.target.style.borderColor = '#1e2533'; e.target.style.boxShadow = 'none' }}
              />
            </div>

            {/* Root Folder ID */}
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: '#94a3b8' }}>
                Root Folder ID
              </label>
              <input
                type="text"
                value={rootFolderId}
                onChange={e => setRootFolderId(e.target.value)}
                placeholder="1ABC...xyz"
                style={inputStyle}
                onFocus={e => { e.target.style.borderColor = '#F47B20'; e.target.style.boxShadow = '0 0 0 3px rgba(244,123,32,0.1)' }}
                onBlur={e => { e.target.style.borderColor = '#1e2533'; e.target.style.boxShadow = 'none' }}
              />
              <p className="text-xs mt-1" style={{ color: '#475569' }}>
                Open the folder in Google Drive → URL is drive.google.com/drive/folders/<strong style={{ color: '#94a3b8' }}>THIS_PART</strong>
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleTest}
                disabled={testing || !email || !rootFolderId}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: '#1e2533',
                  color: '#94a3b8',
                  border: '1px solid #2d3748',
                }}
              >
                {testing ? (
                  <span className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 border border-t-transparent rounded-full animate-spin" style={{ borderColor: '#94a3b8', borderTopColor: 'transparent' }} />
                    Testing...
                  </span>
                ) : 'Test Connection'}
              </button>

              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                style={{ backgroundColor: '#F47B20', color: '#fff' }}
              >
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>

            {/* Test Result */}
            <AnimatePresence>
              {testResult && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="px-4 py-3 rounded-lg text-sm"
                  style={{
                    backgroundColor: testResult.success ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                    border: `1px solid ${testResult.success ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                    color: testResult.success ? '#4ade80' : '#f87171',
                  }}
                >
                  {testResult.success ? '✅ ' : '❌ '}{testResult.success ? testResult.message : testResult.error}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Setup Instructions */}
          <div
            className="rounded-xl overflow-hidden"
            style={{ backgroundColor: '#0f1628', border: '1px solid #1e2533' }}
          >
            <button
              onClick={() => setShowInstructions(!showInstructions)}
              className="w-full flex items-center justify-between px-5 py-4 text-left"
              style={{ borderBottom: showInstructions ? '1px solid #1e2533' : 'none' }}
            >
              <div>
                <p className="text-sm font-semibold" style={{ color: '#f1f5f9' }}>Setup Instructions</p>
                <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>Step-by-step guide to configure Google Drive</p>
              </div>
              <svg
                className="w-5 h-5 flex-shrink-0 transition-transform"
                style={{ color: '#64748b', transform: showInstructions ? 'rotate(180deg)' : 'rotate(0deg)' }}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            <AnimatePresence>
              {showInstructions && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="px-5 py-4 space-y-4">
                    {SETUP_STEPS.map((step) => (
                      <div key={step.step} className="flex gap-4">
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
                          style={{ backgroundColor: 'rgba(244,123,32,0.15)', color: '#F47B20' }}
                        >
                          {step.step}
                        </div>
                        <div>
                          <p className="text-sm font-semibold mb-0.5" style={{ color: '#f1f5f9' }}>{step.title}</p>
                          <p className="text-xs" style={{ color: '#64748b' }}>{step.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  )
}
