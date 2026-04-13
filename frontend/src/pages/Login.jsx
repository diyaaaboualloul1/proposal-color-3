import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../contexts/AuthContext'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLocked, setIsLocked] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setIsLocked(false)
    setLoading(true)

    try {
      await login(email, password)
      navigate('/')
    } catch (err) {
      if (err.response?.status === 423) {
        setIsLocked(true)
      } else {
        setError(err.response?.data?.message || 'Invalid email or password.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden grid-pattern"
      style={{ background: 'linear-gradient(135deg, #030712 0%, #0f172a 100%)' }}
    >
      {/* Floating orbs */}
      <div
        className="orb-1 absolute top-1/4 left-1/4 w-80 h-80 rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(244,123,32,0.12) 0%, transparent 70%)',
          filter: 'blur(40px)'
        }}
      />
      <div
        className="orb-2 absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(139,92,246,0.1) 0%, transparent 70%)',
          filter: 'blur(40px)'
        }}
      />
      <div
        className="orb-3 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(96,165,250,0.06) 0%, transparent 70%)',
          filter: 'blur(30px)'
        }}
      />

      <motion.div
        className="w-full max-w-sm relative z-10"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        {/* Logo */}
        <motion.div
          className="text-center mb-8"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
        >
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-2xl overflow-hidden mb-4" style={{ boxShadow: '0 0 24px rgba(244,123,32,0.4)', border: '1px solid rgba(244,123,32,0.3)' }}>
              <img src="/logo.jpg" alt="Fifty Studios" className="w-full h-full object-cover" />
            </div>
            <h1 className="text-2xl font-bold" style={{ color: '#f1f5f9' }}>SRS Platform</h1>
            <p className="text-sm mt-1" style={{ color: '#94a3b8' }}>Fifty Studios · Internal Tool</p>
          </div>
        </motion.div>

        {/* Card */}
        <motion.div
          className="rounded-2xl p-6"
          style={{
            backgroundColor: 'rgba(15,17,23,0.8)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(30,37,51,0.8)',
            boxShadow: '0 25px 50px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)'
          }}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15, duration: 0.4 }}
        >
          <h2 className="text-base font-semibold mb-5" style={{ color: '#f1f5f9' }}>Sign in to your account</h2>

          <AnimatePresence>
            {(error || isLocked) && (
              <motion.div
                className="mb-4 p-3 rounded-xl flex items-start gap-2"
                style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}
                initial={{ opacity: 0, y: -8, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -8, height: 0 }}
                transition={{ duration: 0.2 }}
              >
                <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="#ef4444" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <p className="text-sm" style={{ color: '#fca5a5' }}>
                  {isLocked
                    ? 'Account is locked due to too many failed attempts. Please contact an administrator.'
                    : error}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#94a3b8' }}>Email</label>
              <motion.input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@fiftystudios.com"
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none transition-all duration-200"
                style={{
                  backgroundColor: '#0f1117',
                  border: '1px solid #1e2533',
                  color: '#f1f5f9',
                }}
                onFocus={e => {
                  e.target.style.borderColor = '#F47B20'
                  e.target.style.boxShadow = '0 0 0 3px rgba(244,123,32,0.1)'
                }}
                onBlur={e => {
                  e.target.style.borderColor = '#1e2533'
                  e.target.style.boxShadow = 'none'
                }}
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#94a3b8' }}>Password</label>
              <div className="relative">
                <motion.input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full px-3 py-2.5 pr-10 rounded-xl text-sm outline-none transition-all duration-200"
                  style={{
                    backgroundColor: '#0f1117',
                    border: '1px solid #1e2533',
                    color: '#f1f5f9',
                  }}
                  onFocus={e => {
                    e.target.style.borderColor = '#F47B20'
                    e.target.style.boxShadow = '0 0 0 3px rgba(244,123,32,0.1)'
                  }}
                  onBlur={e => {
                    e.target.style.borderColor = '#1e2533'
                    e.target.style.boxShadow = 'none'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: '#475569' }}
                >
                  {showPass ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <motion.button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed relative overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, #F47B20, #D4680A)',
                boxShadow: '0 4px 15px rgba(244,123,32,0.3)'
              }}
              whileHover={{ scale: 1.01, boxShadow: '0 6px 20px rgba(244,123,32,0.4)' }}
              whileTap={{ scale: 0.98 }}
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign in
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </>
              )}
            </motion.button>
          </form>
        </motion.div>
      </motion.div>
    </div>
  )
}
