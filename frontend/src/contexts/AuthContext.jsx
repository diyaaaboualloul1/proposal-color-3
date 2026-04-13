import { createContext, useContext, useState, useEffect } from 'react'
import apiClient from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const storedToken = localStorage.getItem('srs_token')
    const storedUser = localStorage.getItem('srs_user')
    if (storedToken && storedUser) {
      try {
        setToken(storedToken)
        setUser(JSON.parse(storedUser))
      } catch {
        localStorage.removeItem('srs_token')
        localStorage.removeItem('srs_user')
      }
    }
    setLoading(false)
  }, [])

  const login = async (email, password) => {
    const response = await apiClient.post('/auth/login', { email, password })
    const { token: newToken, user: newUser } = response.data
    localStorage.setItem('srs_token', newToken)
    localStorage.setItem('srs_user', JSON.stringify(newUser))
    setToken(newToken)
    setUser(newUser)
    return newUser
  }

  const logout = () => {
    localStorage.removeItem('srs_token')
    localStorage.removeItem('srs_user')
    setToken(null)
    setUser(null)
  }

  const isSuperAdmin = () => user?.role === 'super_admin'

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, isSuperAdmin }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
