import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import NewProject from './pages/NewProject'
import ProjectDetail from './pages/ProjectDetail/index'
import Users from './pages/Users'
import Activity from './pages/Activity'
import Storage from './pages/Storage'
import ShareView from './pages/ShareView'
import Queue from './pages/Queue'
import Proposals from './pages/Proposals'
import StandaloneProposal from './pages/StandaloneProposal'
import GoogleDriveSettings from './pages/Admin/GoogleDriveSettings'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<Login />} />
          <Route path="/share/:token" element={<ShareView />} />

          {/* Protected */}
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Dashboard />} />
            <Route path="/projects/new" element={<NewProject />} />
            <Route path="/projects/:id" element={<ProjectDetail />} />
            <Route path="/queue" element={<Queue />} />
            <Route path="/proposals" element={<Proposals />} />
            <Route path="/proposals/:id" element={<StandaloneProposal />} />
            <Route path="/activity" element={<Activity />} />
            <Route
              path="/users"
              element={
                <ProtectedRoute adminOnly>
                  <Users />
                </ProtectedRoute>
              }
            />
            <Route
              path="/storage"
              element={
                <ProtectedRoute adminOnly>
                  <Storage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/google-drive"
              element={
                <ProtectedRoute adminOnly>
                  <GoogleDriveSettings />
                </ProtectedRoute>
              }
            />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
