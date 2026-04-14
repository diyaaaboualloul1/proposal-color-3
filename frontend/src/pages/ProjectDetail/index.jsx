import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import apiClient from '../../api/client'
import StatusBadge from '../../components/StatusBadge'
import Overview from './Overview'
import Questionnaire from './Questionnaire'
import SrsViewer from './SrsViewer'
import Chat from './Chat'
import History from './History'

const TABS = [
  { id: 'overview', label: 'Overview', icon: '▤' },
  { id: 'questionnaire', label: 'Questionnaire', icon: '✎' },
  { id: 'srs', label: 'SRS', icon: '◈' },
  { id: 'chat', label: 'Chat', icon: '⌘' },
  { id: 'history', label: 'History', icon: '◷' },
]

function SkeletonHeader() {
  return (
    <div className="px-6 pt-6 pb-5" style={{ borderBottom: '1px solid #1e2533' }}>
      <div className="skeleton h-3 w-32 mb-4 rounded" />
      <div className="skeleton h-7 w-64 mb-2 rounded" />
      <div className="skeleton h-4 w-40 mb-6 rounded" />
      <div className="flex gap-2">
        {[...Array(5)].map((_, i) => <div key={i} className="skeleton h-9 w-24 rounded-full" />)}
      </div>
    </div>
  )
}

export default function ProjectDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [project, setProject] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'overview')

  const fetchProject = async (silent = false) => {
    try {
      if (!silent) setLoading(true)
      const res = await apiClient.get(`/projects/${id}`)
      setProject(res.data.project || res.data)
    } catch (err) {
      if (err.response?.status === 404) setError('Project not found.')
      else setError('Failed to load project.')
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    fetchProject()
  }, [id])

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <SkeletonHeader />
        <div className="p-6">
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="skeleton h-14 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
            style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}
          >
            <svg className="w-7 h-7" fill="none" stroke="#ef4444" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-sm mb-3" style={{ color: '#ef4444' }}>{error}</p>
          <button
            onClick={() => navigate('/')}
            className="text-xs hover:underline"
            style={{ color: '#F59340' }}
          >
            ← Back to Projects
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Project Header */}
      <motion.div
        className="px-6 pt-5 pb-0"
        style={{ borderBottom: '1px solid #1e2533' }}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={() => navigate('/')}
            className="text-xs font-medium transition-colors"
            style={{ color: '#475569' }}
            onMouseEnter={e => e.target.style.color = '#94a3b8'}
            onMouseLeave={e => e.target.style.color = '#475569'}
          >
            Projects
          </button>
          <svg className="w-3 h-3" style={{ color: '#334155' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-xs font-medium" style={{ color: '#94a3b8' }}>{project.name}</span>
        </div>

        {/* Title & status */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-xl font-bold" style={{ color: '#f1f5f9' }}>{project.name}</h1>
              <StatusBadge status={project.status} />
            </div>
            <p className="text-sm" style={{ color: '#94a3b8' }}>{project.client_name}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 relative">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="relative px-4 py-2.5 text-sm font-medium transition-colors"
              style={{ color: activeTab === tab.id ? '#f1f5f9' : '#94a3b8' }}
              onMouseEnter={e => { if (activeTab !== tab.id) e.currentTarget.style.color = '#f1f5f9' }}
              onMouseLeave={e => { if (activeTab !== tab.id) e.currentTarget.style.color = '#94a3b8' }}
            >
              {tab.label}
              {activeTab === tab.id && (
                <motion.div
                  className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full"
                  style={{ background: 'linear-gradient(90deg, #F47B20, #8b5cf6)' }}
                  layoutId="tab-indicator"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="h-full"
          >
            {activeTab === 'overview' && (
              <Overview project={project} onUpdate={() => fetchProject(true)} />
            )}
            {activeTab === 'questionnaire' && (
              <Questionnaire projectId={id} project={project} onSubmitSuccess={() => setActiveTab('srs')} onProjectUpdate={() => fetchProject(true)} />
            )}
            {activeTab === 'srs' && (
              <SrsViewer projectId={id} project={project} onProjectUpdate={() => fetchProject(true)} />
            )}
            {activeTab === 'chat' && (
              <Chat projectId={id} project={project} onVersionCreated={() => fetchProject(true)} />
            )}
            {activeTab === 'history' && (
              <History projectId={id} project={project} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
