import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import apiClient from '../api/client'
import Modal from '../components/Modal'
import { useAuth } from '../contexts/AuthContext'

const ROLE_OPTIONS = ['admin', 'super_admin']

// Defined outside component to prevent remount on every render (fixes focus loss bug)
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
const onFocus = e => { e.target.style.borderColor = '#F47B20'; e.target.style.boxShadow = '0 0 0 3px rgba(244,123,32,0.1)' }
const onBlur  = e => { e.target.style.borderColor = '#1e2533'; e.target.style.boxShadow = 'none' }
function FormInput({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold mb-1.5" style={{ color: '#94a3b8' }}>{label}</label>
      {children}
    </div>
  )
}

const EMPTY_USER = {
  name: '',
  email: '',
  password: '',
  role: 'admin',
  is_active: true
}

const AVATAR_COLORS = [
  '#F47B20', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899',
]

function getAvatarColor(name) {
  if (!name) return AVATAR_COLORS[0]
  const idx = name.charCodeAt(0) % AVATAR_COLORS.length
  return AVATAR_COLORS[idx]
}

const rowVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: (i) => ({ opacity: 1, y: 0, transition: { delay: i * 0.04 } })
}

export default function Users() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showResetModal, setShowResetModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null) // null = bulk, user obj = single
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [selectedUser, setSelectedUser] = useState(null)
  const [newUser, setNewUser] = useState(EMPTY_USER)
  const [editForm, setEditForm] = useState({})
  const [newPassword, setNewPassword] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState('')
  const [actionSuccess, setActionSuccess] = useState('')
  const { user: currentUser } = useAuth()

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true)
      const res = await apiClient.get('/users')
      setUsers(res.data.users || res.data || [])
    } catch {
      setError('Failed to load users.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const handleAddUser = async (e) => {
    e.preventDefault()
    setActionLoading(true)
    setActionError('')
    try {
      await apiClient.post('/users', newUser)
      setShowAddModal(false)
      setNewUser(EMPTY_USER)
      fetchUsers()
    } catch (err) {
      setActionError(err.response?.data?.message || 'Failed to create user.')
    } finally {
      setActionLoading(false)
    }
  }

  const openEdit = (user) => {
    setSelectedUser(user)
    setEditForm({ name: user.name, email: user.email, is_active: user.is_active })
    setActionError('')
    setShowEditModal(true)
  }

  const handleEditUser = async (e) => {
    e.preventDefault()
    setActionLoading(true)
    setActionError('')
    try {
      await apiClient.put(`/users/${selectedUser.id}`, editForm)
      setShowEditModal(false)
      fetchUsers()
    } catch (err) {
      setActionError(err.response?.data?.message || 'Failed to update user.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleDeactivate = async (userId) => {
    if (!confirm('Deactivate this user?')) return
    try {
      await apiClient.put(`/users/${userId}`, { is_active: false })
      fetchUsers()
    } catch {
      setError('Failed to deactivate user.')
    }
  }

  const openDeleteSingle = (user) => {
    setDeleteTarget(user)
    setActionError('')
    setShowDeleteModal(true)
  }

  const openDeleteBulk = () => {
    setDeleteTarget(null)
    setActionError('')
    setShowDeleteModal(true)
  }

  const handleConfirmDelete = async () => {
    setActionLoading(true)
    setActionError('')
    try {
      if (deleteTarget) {
        await apiClient.delete(`/users/${deleteTarget.id}`)
        setSelectedIds(prev => { const s = new Set(prev); s.delete(deleteTarget.id); return s })
      } else {
        await apiClient.post('/users/bulk-delete', { ids: [...selectedIds] })
        setSelectedIds(new Set())
      }
      setShowDeleteModal(false)
      fetchUsers()
    } catch (err) {
      setActionError(err.response?.data?.error || 'Failed to delete user(s).')
    } finally {
      setActionLoading(false)
    }
  }

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })
  }

  const toggleSelectAll = () => {
    const deletable = users.filter(u => u.id !== currentUser?.id)
    if (selectedIds.size === deletable.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(deletable.map(u => u.id)))
    }
  }

  const openReset = (user) => {
    setSelectedUser(user)
    setNewPassword('')
    setActionError('')
    setActionSuccess('')
    setShowResetModal(true)
  }

  const handleResetPassword = async (e) => {
    e.preventDefault()
    setActionLoading(true)
    setActionError('')
    setActionSuccess('')
    try {
      await apiClient.post(`/users/${selectedUser.id}/reset-password`, { password: newPassword })
      setActionSuccess('Password reset successfully.')
      setNewPassword('')
    } catch (err) {
      setActionError(err.response?.data?.message || 'Failed to reset password.')
    } finally {
      setActionLoading(false)
    }
  }

  const formatDate = (d) => {
    if (!d) return 'Never'
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  // inputStyle, onFocus, onBlur, FormInput moved outside component — see bottom of file

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <motion.div
        className="flex items-center justify-between mb-6"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold" style={{ color: '#f1f5f9' }}>Team Members</h1>
            {!loading && (
              <motion.span
                className="px-2.5 py-0.5 rounded-full text-xs font-semibold"
                style={{ backgroundColor: 'rgba(139,92,246,0.15)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.25)' }}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 400, delay: 0.2 }}
              >
                {users.length}
              </motion.span>
            )}
          </div>
          <p className="text-sm mt-0.5" style={{ color: '#475569' }}>Manage team members and access</p>
        </div>
        <div className="flex items-center gap-2">
          <AnimatePresence>
            {selectedIds.size > 0 && (
              <motion.button
                initial={{ opacity: 0, scale: 0.85, x: 10 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.85, x: 10 }}
                onClick={openDeleteBulk}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', color: '#ef4444' }}
                whileHover={{ backgroundColor: 'rgba(239,68,68,0.2)' }}
                whileTap={{ scale: 0.97 }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete {selectedIds.size} selected
              </motion.button>
            )}
          </AnimatePresence>
          <motion.button
            onClick={() => { setNewUser(EMPTY_USER); setActionError(''); setShowAddModal(true) }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold"
            style={{ background: 'linear-gradient(135deg, #F47B20, #D4680A)', boxShadow: '0 4px 14px rgba(244,123,32,0.3)' }}
            whileHover={{ scale: 1.02, boxShadow: '0 6px 20px rgba(244,123,32,0.4)' }}
            whileTap={{ scale: 0.97 }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add User
          </motion.button>
        </div>
      </motion.div>

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

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <div key={i} className="skeleton h-16 rounded-xl" />)}
        </div>
      ) : (
        <motion.div
          className="rounded-2xl overflow-hidden"
          style={{ border: '1px solid #1e2533' }}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: '#0f1117', borderBottom: '1px solid #1e2533' }}>
                <th className="pl-4 pr-2 py-3.5 w-10">
                  <input
                    type="checkbox"
                    className="rounded cursor-pointer"
                    style={{ accentColor: '#F47B20' }}
                    checked={selectedIds.size > 0 && selectedIds.size === users.filter(u => u.id !== currentUser?.id).length}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: '#475569' }}>Member</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: '#475569' }}>Email</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: '#475569' }}>Role</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: '#475569' }}>Status</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: '#475569' }}>Last Login</th>
                <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: '#475569' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {users.map((u, idx) => {
                  const avatarColor = getAvatarColor(u.name)
                  return (
                    <motion.tr
                      key={u.id}
                      custom={idx}
                      variants={rowVariants}
                      initial="hidden"
                      animate="visible"
                      className="border-b transition-colors"
                      style={{
                        borderColor: '#1e2533',
                        backgroundColor: selectedIds.has(u.id) ? 'rgba(239,68,68,0.04)' : undefined
                      }}
                      whileHover={{ backgroundColor: selectedIds.has(u.id) ? 'rgba(239,68,68,0.07)' : 'rgba(255,255,255,0.015)' }}
                    >
                      <td className="pl-4 pr-2 py-4 w-10">
                        {u.id !== currentUser?.id && (
                          <input
                            type="checkbox"
                            className="rounded cursor-pointer"
                            style={{ accentColor: '#ef4444' }}
                            checked={selectedIds.has(u.id)}
                            onChange={() => toggleSelect(u.id)}
                          />
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-bold"
                            style={{
                              backgroundColor: `${avatarColor}25`,
                              border: `1px solid ${avatarColor}40`,
                              color: avatarColor
                            }}
                          >
                            {u.name?.charAt(0)?.toUpperCase()}
                          </div>
                          <span className="text-sm font-medium" style={{ color: '#f1f5f9' }}>{u.name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-xs" style={{ color: '#94a3b8' }}>{u.email}</td>
                      <td className="px-5 py-4">
                        <span
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
                          style={
                            u.role === 'super_admin'
                              ? { backgroundColor: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)', color: '#a78bfa' }
                              : { backgroundColor: 'rgba(244,123,32,0.12)', border: '1px solid rgba(244,123,32,0.25)', color: '#F59340' }
                          }
                        >
                          {u.role === 'super_admin' ? '✦ Super Admin' : 'Admin'}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                          style={
                            u.is_active
                              ? { backgroundColor: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', color: '#22c55e' }
                              : { backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444' }
                          }
                        >
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: u.is_active ? '#22c55e' : '#ef4444' }} />
                          {u.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-xs" style={{ color: '#475569' }}>{formatDate(u.last_login)}</td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-1.5">
                          <motion.button
                            onClick={() => openEdit(u)}
                            className="px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors"
                            style={{ color: '#94a3b8', border: '1px solid #1e2533' }}
                            whileHover={{ backgroundColor: '#161b27', color: '#f1f5f9', borderColor: '#2d3748' }}
                            whileTap={{ scale: 0.95 }}
                          >
                            Edit
                          </motion.button>
                          <motion.button
                            onClick={() => openReset(u)}
                            className="px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors"
                            style={{ color: '#94a3b8', border: '1px solid #1e2533' }}
                            whileHover={{ backgroundColor: '#161b27', color: '#f1f5f9', borderColor: '#2d3748' }}
                            whileTap={{ scale: 0.95 }}
                          >
                            Reset PW
                          </motion.button>
                          {u.is_active && u.role !== 'super_admin' && (
                            <motion.button
                              onClick={() => handleDeactivate(u.id)}
                              className="px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors"
                              style={{ color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}
                              whileHover={{ backgroundColor: 'rgba(239,68,68,0.08)' }}
                              whileTap={{ scale: 0.95 }}
                            >
                              Deactivate
                            </motion.button>
                          )}
                          {u.id !== currentUser?.id && (
                            <motion.button
                              onClick={() => openDeleteSingle(u)}
                              className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors"
                              style={{ color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}
                              whileHover={{ backgroundColor: 'rgba(239,68,68,0.12)', borderColor: 'rgba(239,68,68,0.4)' }}
                              whileTap={{ scale: 0.9 }}
                              title="Delete user"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </motion.button>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  )
                })}
              </AnimatePresence>
            </tbody>
          </table>
        </motion.div>
      )}

      {/* Add User Modal */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Add New Member">
        <form onSubmit={handleAddUser} className="space-y-4">
          <AnimatePresence>
            {actionError && (
              <motion.p
                className="text-sm px-3 py-2 rounded-xl"
                style={{ color: '#fca5a5', backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              >
                {actionError}
              </motion.p>
            )}
          </AnimatePresence>
          <FormInput label="Name">
            <input type="text" required value={newUser.name} onChange={e => setNewUser(p => ({...p, name: e.target.value}))}
              style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
          </FormInput>
          <FormInput label="Email">
            <input type="email" required value={newUser.email} onChange={e => setNewUser(p => ({...p, email: e.target.value}))}
              style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
          </FormInput>
          <FormInput label="Password">
            <input type="password" required value={newUser.password} onChange={e => setNewUser(p => ({...p, password: e.target.value}))}
              style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
          </FormInput>
          <FormInput label="Role">
            <select value={newUser.role} onChange={e => setNewUser(p => ({...p, role: e.target.value}))}
              style={inputStyle} onFocus={onFocus} onBlur={onBlur}>
              {ROLE_OPTIONS.map(r => <option key={r} value={r} style={{ backgroundColor: '#0f1117' }}>
                {r === 'super_admin' ? 'Super Admin' : 'Admin'}
              </option>)}
            </select>
          </FormInput>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={newUser.is_active} onChange={e => setNewUser(p => ({...p, is_active: e.target.checked}))} className="rounded" />
            <span className="text-sm" style={{ color: '#94a3b8' }}>Active</span>
          </label>
          <div className="flex items-center gap-3 pt-2">
            <motion.button
              type="submit"
              disabled={actionLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg, #F47B20, #D4680A)' }}
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
            >
              {actionLoading && <span className="w-3.5 h-3.5 rounded-full border border-white/30 border-t-white animate-spin" />}
              {actionLoading ? 'Creating...' : 'Create Member'}
            </motion.button>
            <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 text-sm" style={{ color: '#94a3b8' }}>Cancel</button>
          </div>
        </form>
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="Edit Member">
        <form onSubmit={handleEditUser} className="space-y-4">
          <AnimatePresence>
            {actionError && (
              <motion.p className="text-sm px-3 py-2 rounded-xl" style={{ color: '#fca5a5', backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {actionError}
              </motion.p>
            )}
          </AnimatePresence>
          <FormInput label="Name">
            <input type="text" required value={editForm.name || ''} onChange={e => setEditForm(p => ({...p, name: e.target.value}))}
              style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
          </FormInput>
          <FormInput label="Email">
            <input type="email" required value={editForm.email || ''} onChange={e => setEditForm(p => ({...p, email: e.target.value}))}
              style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
          </FormInput>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={editForm.is_active || false} onChange={e => setEditForm(p => ({...p, is_active: e.target.checked}))} />
            <span className="text-sm" style={{ color: '#94a3b8' }}>Active</span>
          </label>
          <div className="flex items-center gap-3 pt-2">
            <motion.button type="submit" disabled={actionLoading} className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg, #F47B20, #D4680A)' }} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
              {actionLoading && <span className="w-3.5 h-3.5 rounded-full border border-white/30 border-t-white animate-spin" />}
              Save Changes
            </motion.button>
            <button type="button" onClick={() => setShowEditModal(false)} className="px-4 py-2 text-sm" style={{ color: '#94a3b8' }}>Cancel</button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={showDeleteModal} onClose={() => setShowDeleteModal(false)} title={deleteTarget ? `Delete "${deleteTarget.name}"` : `Delete ${selectedIds.size} Users`}>
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-xl" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <svg className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#ef4444' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm font-semibold mb-0.5" style={{ color: '#f1f5f9' }}>This is permanent</p>
              <p className="text-xs" style={{ color: '#94a3b8' }}>
                {deleteTarget
                  ? `"${deleteTarget.name}" will be permanently deleted. Their projects will remain but will no longer be associated with an active user.`
                  : `${selectedIds.size} users will be permanently deleted. This cannot be undone.`
                }
              </p>
            </div>
          </div>
          <AnimatePresence>
            {actionError && (
              <motion.p className="text-sm px-3 py-2 rounded-xl" style={{ color: '#fca5a5', backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {actionError}
              </motion.p>
            )}
          </AnimatePresence>
          <div className="flex gap-2 pt-1">
            <motion.button
              onClick={handleConfirmDelete}
              disabled={actionLoading}
              className="flex items-center gap-2 flex-1 justify-center py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60"
              style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444' }}
              whileHover={{ backgroundColor: 'rgba(239,68,68,0.25)' }}
              whileTap={{ scale: 0.97 }}
            >
              {actionLoading && <span className="w-3.5 h-3.5 rounded-full border border-red-400/30 border-t-red-400 animate-spin" />}
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              {actionLoading ? 'Deleting...' : deleteTarget ? 'Delete User' : `Delete ${selectedIds.size} Users`}
            </motion.button>
            <motion.button
              type="button"
              onClick={() => setShowDeleteModal(false)}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #1e2533', color: '#94a3b8' }}
              whileHover={{ backgroundColor: 'rgba(255,255,255,0.07)' }}
              whileTap={{ scale: 0.97 }}
            >
              Cancel
            </motion.button>
          </div>
        </div>
      </Modal>

      {/* Reset Password Modal */}
      <Modal isOpen={showResetModal} onClose={() => setShowResetModal(false)} title={`Reset Password — ${selectedUser?.name}`}>
        <form onSubmit={handleResetPassword} className="space-y-4">
          <AnimatePresence>
            {actionError && (
              <motion.p className="text-sm px-3 py-2 rounded-xl" style={{ color: '#fca5a5', backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {actionError}
              </motion.p>
            )}
            {actionSuccess && (
              <motion.p className="text-sm px-3 py-2 rounded-xl flex items-center gap-2" style={{ color: '#86efac', backgroundColor: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                {actionSuccess}
              </motion.p>
            )}
          </AnimatePresence>
          <FormInput label="New Password">
            <input type="password" required value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Min 8 characters"
              style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
          </FormInput>
          <div className="flex items-center gap-3 pt-2">
            <motion.button type="submit" disabled={actionLoading} className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg, #F47B20, #D4680A)' }} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
              {actionLoading && <span className="w-3.5 h-3.5 rounded-full border border-white/30 border-t-white animate-spin" />}
              Reset Password
            </motion.button>
            <button type="button" onClick={() => setShowResetModal(false)} className="px-4 py-2 text-sm" style={{ color: '#94a3b8' }}>Close</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
