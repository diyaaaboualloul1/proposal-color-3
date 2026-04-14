import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import apiClient from '../../api/client'
import { useAuth } from '../../contexts/AuthContext'

const SETUP_STEPS = [
  {
    step: 1,
    title: 'Create OAuth 2.0 Credentials',
    description: 'Go to console.cloud.google.com → APIs & Services → Credentials → Create Credentials → OAuth client ID. Application type: Web application. Name: "SRS Platform". Add Authorized redirect URI: http://142.132.189.59:6001/api/admin/settings/google-drive/oauth/callback',
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
    title: 'Enter Client ID and Secret',
    description: 'Copy the Client ID and Client Secret from the OAuth client you just created. Paste them into the fields above and click Save Settings.',
  },
  {
    step: 5,
    title: 'Connect with Google',
    description: 'Click the "Connect with Google" button. You will be redirected to Google\'s consent screen. Sign in with the Google account you want to use and approve the permissions.',
  },
  {
    step: 6,
    title: 'Create Root Folder in Google Drive',
    description: 'In Google Drive (drive.google.com), create a new folder named "SRS Platform". Open the folder and copy the folder ID from the URL (the part after /folders/). Paste it into the Root Folder ID field above.',
  },
  {
    step: 7,
    title: 'Test the Connection',
    description: 'Click "Test Connection" to verify everything is working.',
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
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [redirectUri, setRedirectUri] = useState('')
  const [rootFolderId, setRootFolderId] = useState('')
  const [isConnected, setIsConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState('')
  const [testResult, setTestResult] = useState(null)
  const [error, setError] = useState('')
  const [showInstructions, setShowInstructions] = useState(true)

  const fetchSettings = useCallback(async () => {
    if (!isSuperAdmin()) {
      setLoading(false)
      return
    }
    try {
      const res = await apiClient.get('/admin/settings/google-drive')
      const data = res.data
      setEnabled(data.google_drive_enabled === 'true' || data.google_drive_enabled === true)
      setClientId(data.google_oauth_client_id || '')
      setRedirectUri(data.google_oauth_redirect_uri || 'http://142.132.189.59:6001/api/admin/settings/google-drive/oauth/callback')
      setRootFolderId(data.google_drive_root_folder_id || '')
      setIsConnected(data.google_oauth_connected || false)
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
        google_oauth_client_id: clientId.trim() || undefined,
        google_oauth_client_secret: clientSecret.trim() || undefined,
        google_oauth_redirect_uri: redirectUri.trim() || undefined,
      })
      setSaveSuccess('Settings saved successfully!')
      setClientSecret('')
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save settings.')
    } finally {
      setSaving(false)
    }
  }

  const handleConnect = async () => {
    setConnecting(true)
    setError('')
    try {
      const res = await apiClient.get('/admin/settings/google-drive/oauth-url')
      window.location.href = res.data.authUrl
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to get authorization URL.')
      setConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    setDisconnecting(true)
    setError('')
    try {
      await apiClient.post('/admin/settings/google-drive/oauth/disconnect')
      setIsConnected(false)
      setSaveSuccess('Google account disconnected.')
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to disconnect.')
    } finally {
      setDisconnecting(false)
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

          {/* OAuth Configuration */}
          <div
            className="p-5 rounded-xl space-y-4"
            style={{ backgroundColor: '#0f1628', border: '1px solid #1e2533' }}
          >
            <p className="text-sm font-semibold" style={{ color: '#f1f5f9' }}>OAuth 2.0 Configuration</p>

            {/* Connection Status */}
            <div className="flex items-center gap-3 px-4 py-3 rounded-lg" style={{ backgroundColor: isConnected ? 'rgba(34,197,94,0.1)' : 'rgba(244,123,32,0.1)', border: `1px solid ${isConnected ? 'rgba(34,197,94,0.3)' : 'rgba(244,123,32,0.3)'}` }}>
              <span style={{ fontSize: '1.2rem' }}>{isConnected ? '✅' : '⚠️'}</span>
              <div>
                <p className="text-sm font-semibold" style={{ color: isConnected ? '#4ade80' : '#F47B20' }}>
                  {isConnected ? 'Connected to Google' : 'Not connected'}
                </p>
                <p className="text-xs" style={{ color: '#94a3b8' }}>
                  {isConnected ? 'Your Google account is linked. Uploads will use your 15 GB quota.' : 'Connect your Google account to enable uploads.'}
                </p>
              </div>
            </div>

            {/* OAuth Client ID */}
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: '#94a3b8' }}>
                OAuth Client ID
              </label>
              <input
                type="text"
                value={clientId}
                onChange={e => setClientId(e.target.value)}
                placeholder="123456-abc.apps.googleusercontent.com"
                style={inputStyle}
                onFocus={e => { e.target.style.borderColor = '#F47B20'; e.target.style.boxShadow = '0 0 0 3px rgba(244,123,32,0.1)' }}
                onBlur={e => { e.target.style.borderColor = '#1e2533'; e.target.style.boxShadow = 'none' }}
              />
            </div>

            {/* OAuth Client Secret */}
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: '#94a3b8' }}>
                OAuth Client Secret
              </label>
              <input
                type="password"
                value={clientSecret}
                onChange={e => setClientSecret(e.target.value)}
                placeholder="GOCSPX-..."
                style={inputStyle}
                onFocus={e => { e.target.style.borderColor = '#F47B20'; e.target.style.boxShadow = '0 0 0 3px rgba(244,123,32,0.1)' }}
                onBlur={e => { e.target.style.borderColor = '#1e2533'; e.target.style.boxShadow = 'none' }}
              />
            </div>

            {/* Redirect URI */}
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: '#94a3b8' }}>
                Redirect URI
              </label>
              <input
                type="text"
                value={redirectUri}
                onChange={e => setRedirectUri(e.target.value)}
                placeholder="http://142.132.189.59:6001/api/admin/settings/google-drive/oauth/callback"
                style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '0.75rem' }}
                onFocus={e => { e.target.style.borderColor = '#F47B20'; e.target.style.boxShadow = '0 0 0 3px rgba(244,123,32,0.1)' }}
                onBlur={e => { e.target.style.borderColor = '#1e2533'; e.target.style.boxShadow = 'none' }}
              />
              <p className="text-xs mt-1" style={{ color: '#475569' }}>
                Must match the Authorized redirect URI in Google Cloud Console exactly.
              </p>
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
            <div className="flex flex-wrap gap-3 pt-2">
              <button
                onClick={handleTest}
                disabled={testing || !rootFolderId}
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

              {!isConnected ? (
                <button
                  onClick={handleConnect}
                  disabled={connecting || !clientId || !clientSecret}
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ backgroundColor: '#4285F4', color: '#fff' }}
                >
                  {connecting ? (
                    <span className="flex items-center gap-2">
                      <span className="w-3.5 h-3.5 border border-t-transparent rounded-full animate-spin" style={{ borderColor: '#fff', borderTopColor: 'transparent' }} />
                      Redirecting...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                      </svg>
                      Connect with Google
                    </span>
                  )}
                </button>
              ) : (
                <button
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ backgroundColor: '#1e2533', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}
                >
                  {disconnecting ? 'Disconnecting...' : 'Disconnect'}
                </button>
              )}
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
