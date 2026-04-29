import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../contexts/AuthContext'

const NAV_ITEMS = [
  {
    to: '/',
    exact: true,
    icon: (
      <svg className="w-4.5 h-4.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7a2 2 0 012-2h4a2 2 0 012 2v4a2 2 0 01-2 2H5a2 2 0 01-2-2V7zM13 7a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V7zM13 15a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2zM3 15a2 2 0 012-2h4a2 2 0 012 2v2a2 2 0 01-2 2H5a2 2 0 01-2-2v-2z" />
      </svg>
    ),
    label: 'Projects'
  },
  {
    to: '/queue',
    icon: (
      <svg className="w-4.5 h-4.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 10h16M4 14h10M4 18h6" />
      </svg>
    ),
    label: 'Queue'
  },
  {
    to: '/activity',
    icon: (
      <svg className="w-4.5 h-4.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
    label: 'Activity'
  },
  {
    to: '/proposals',
    icon: (
      <svg className="w-4.5 h-4.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    label: 'Proposals'
  }
]

const ADMIN_NAV_ITEMS = [
  {
    to: '/users',
    icon: (
      <svg className="w-4.5 h-4.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
    label: 'Users'
  },
  {
    to: '/storage',
    icon: (
      <svg className="w-4.5 h-4.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
      </svg>
    ),
    label: 'Storage'
  },
  {
    to: '/admin/google-drive',
    icon: (
      <svg className="w-4.5 h-4.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
      </svg>
    ),
    label: 'Google Drive'
  }
]

const ROLE_COLOR = {
  super_admin: '#8b5cf6',
  admin: '#F47B20',
}

function getInitialCollapsed() {
  const stored = localStorage.getItem('srs_sidebar_collapsed')
  if (stored !== null) return stored === 'true'
  // Default: collapsed on tablet (<1024px), expanded on desktop
  return window.innerWidth < 1024
}

export default function Sidebar({ mobileOpen, onClose }) {
  const { user, logout, isSuperAdmin } = useAuth()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(getInitialCollapsed)

  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('srs_sidebar_collapsed', String(next))
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const handleNavClick = () => {
    // Close mobile overlay when nav item clicked
    if (onClose) onClose()
  }

  const initials = user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U'
  const roleColor = ROLE_COLOR[user?.role] || '#F47B20'

  const sidebarContent = (isMobile = false) => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div
        className="flex items-center px-4 py-5 flex-shrink-0"
        style={{ borderBottom: '1px solid #1e2533', minHeight: '64px' }}
      >
        <div
          className="w-9 h-9 rounded-xl overflow-hidden flex-shrink-0"
          style={{ boxShadow: '0 0 12px rgba(244,123,32,0.3)' }}
        >
          <img src="/logo.jpg" alt="Fifty Studios" className="w-full h-full object-cover" />
        </div>
        <AnimatePresence initial={false}>
          {(!collapsed || isMobile) && (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden ml-3"
            >
              <p className="text-sm font-bold whitespace-nowrap" style={{ color: '#f1f5f9' }}>SRS Platform</p>
              <p className="text-xs whitespace-nowrap" style={{ color: '#475569' }}>Fifty Studios</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.exact}
            title={collapsed && !isMobile ? item.label : undefined}
            onClick={handleNavClick}
            className={({ isActive }) =>
              `relative flex items-center rounded-lg text-sm font-medium transition-all duration-150 group ${
                collapsed && !isMobile ? 'justify-center px-0 py-2.5 mx-1' : 'gap-3 px-3 py-2.5'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.div
                    layoutId="sidebar-active"
                    className="absolute inset-0 rounded-lg"
                    style={{ background: 'rgba(244,123,32,0.12)', border: '1px solid rgba(244,123,32,0.2)' }}
                    transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                  />
                )}
                <span
                  className="relative transition-colors"
                  style={{ color: isActive ? '#F59340' : '#475569' }}
                >
                  {item.icon}
                </span>
                <AnimatePresence initial={false}>
                  {(!collapsed || isMobile) && (
                    <motion.span
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: 'auto' }}
                      exit={{ opacity: 0, width: 0 }}
                      transition={{ duration: 0.15 }}
                      className="relative overflow-hidden whitespace-nowrap transition-colors"
                      style={{ color: isActive ? '#f1f5f9' : '#94a3b8' }}
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
                {isActive && (
                  <motion.div
                    layoutId="sidebar-indicator"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full"
                    style={{ background: 'linear-gradient(to bottom, #F47B20, #8b5cf6)' }}
                    transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                  />
                )}
              </>
            )}
          </NavLink>
        ))}

        {isSuperAdmin() && (
          <>
            <AnimatePresence initial={false}>
              {(!collapsed || isMobile) && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="pt-4 pb-1.5 px-3"
                >
                  <span className="text-xs font-semibold uppercase tracking-widest whitespace-nowrap" style={{ color: '#334155' }}>
                    Admin
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
            {collapsed && !isMobile && <div className="pt-3 pb-1 px-3"><div style={{ borderTop: '1px solid #1e2533' }} /></div>}
            {ADMIN_NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                title={collapsed && !isMobile ? item.label : undefined}
                onClick={handleNavClick}
                className={({ isActive }) =>
                  `relative flex items-center rounded-lg text-sm font-medium transition-all duration-150 group ${
                    collapsed && !isMobile ? 'justify-center px-0 py-2.5 mx-1' : 'gap-3 px-3 py-2.5'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <motion.div
                        className="absolute inset-0 rounded-lg"
                        style={{ background: 'rgba(244,123,32,0.12)', border: '1px solid rgba(244,123,32,0.2)' }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                      />
                    )}
                    <span
                      className="relative transition-colors"
                      style={{ color: isActive ? '#F59340' : '#475569' }}
                    >
                      {item.icon}
                    </span>
                    <AnimatePresence initial={false}>
                      {(!collapsed || isMobile) && (
                        <motion.span
                          initial={{ opacity: 0, width: 0 }}
                          animate={{ opacity: 1, width: 'auto' }}
                          exit={{ opacity: 0, width: 0 }}
                          transition={{ duration: 0.15 }}
                          className="relative overflow-hidden whitespace-nowrap transition-colors"
                          style={{ color: isActive ? '#f1f5f9' : '#94a3b8' }}
                        >
                          {item.label}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </>
                )}
              </NavLink>
            ))}
          </>
        )}
      </nav>

      {/* Collapse Toggle — only show on desktop sidebar */}
      {!isMobile && (
        <div style={{ borderTop: '1px solid #1e2533' }}>
          <motion.button
            onClick={toggle}
            className="flex items-center justify-center w-full py-2 transition-colors"
            style={{ color: '#334155' }}
            whileHover={{ color: '#f1f5f9' }}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d={collapsed ? 'M9 5l7 7-7 7' : 'M15 19l-7-7 7-7'}
              />
            </svg>
          </motion.button>
        </div>
      )}

      {/* User profile */}
      <div className="px-3 py-3 flex-shrink-0" style={{ borderTop: isMobile ? '1px solid #1e2533' : undefined }}>
        <div
          className={`flex items-center rounded-lg hover:bg-white/5 transition-colors group ${
            collapsed && !isMobile ? 'justify-center px-1 py-2' : 'gap-2.5 px-2 py-2'
          }`}
          title={collapsed && !isMobile ? `${user?.name} — ${user?.role?.replace('_', ' ')}` : undefined}
        >
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-bold"
            style={{ background: `linear-gradient(135deg, ${roleColor}88, ${roleColor}44)`, border: `1px solid ${roleColor}44` }}
          >
            {initials}
          </div>
          <AnimatePresence initial={false}>
            {(!collapsed || isMobile) && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.15 }}
                className="flex-1 min-w-0 overflow-hidden flex items-center gap-1"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate whitespace-nowrap" style={{ color: '#f1f5f9' }}>{user?.name}</div>
                  <div className="text-xs truncate capitalize whitespace-nowrap" style={{ color: '#475569' }}>
                    {user?.role?.replace('_', ' ')}
                  </div>
                </div>
                <motion.button
                  onClick={handleLogout}
                  title="Sign out"
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded flex-shrink-0"
                  style={{ color: '#475569' }}
                  whileHover={{ color: '#f1f5f9' }}
                  whileTap={{ scale: 0.9 }}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
          {collapsed && !isMobile && (
            <motion.button
              onClick={handleLogout}
              title="Sign out"
              className="hidden group-hover:flex absolute items-center justify-center p-1 rounded"
              style={{ color: '#475569' }}
              whileHover={{ color: '#f1f5f9' }}
              whileTap={{ scale: 0.9 }}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </motion.button>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <motion.aside
        initial={{ x: -20, opacity: 0 }}
        animate={{ x: 0, opacity: 1, width: collapsed ? 56 : 224 }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
        className="hidden md:flex flex-col flex-shrink-0 h-screen sticky top-0 overflow-hidden"
        style={{ backgroundColor: '#0a0e1a', borderRight: '1px solid #1e2533' }}
      >
        {sidebarContent(false)}
      </motion.aside>

      {/* Mobile overlay backdrop */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="md:hidden fixed inset-0 z-40 bg-black/50"
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.aside
            initial={{ x: -224 }}
            animate={{ x: 0 }}
            exit={{ x: -224 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="md:hidden fixed top-0 left-0 z-50 flex flex-col h-full overflow-hidden"
            style={{ width: 224, backgroundColor: '#0a0e1a', borderRight: '1px solid #1e2533' }}
          >
            {sidebarContent(true)}
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  )
}
