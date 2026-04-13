import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import apiClient from '../api/client'
import StatusBadge from '../components/StatusBadge'
import GenerationBadge from '../components/GenerationBadge'
import Modal from '../components/Modal'
import { useAuth } from '../contexts/AuthContext'

const STATUS_OPTIONS = ['all', 'active', 'completed', 'archived']

const IMPORT_TEMPLATE = JSON.stringify({
  name: "My Project",
  client_name: "Client Name",
  client_contact: "client@example.com",
  description: "Project description",
  answers: {
    project_type: "Web App",
    industry: "",
    target_users: "",
    core_features: "",
    tech_preferences: "React, Node.js, PostgreSQL",
    integrations: "None",
    non_functional: "Mobile responsive, fast load time",
    deployment: "Cloud",
    existing_systems: "None",
    timeline: "",
    budget_range: "",
    special_requirements: ""
  }
}, null, 2)

const DEMO_PRESETS = [
  {
    id: 'barber',
    emoji: '✂️',
    label: 'Barber Shop',
    tag: 'Website',
    color: '#F47B20',
    data: { name: 'BarberCo - Barber Shop Website', client_name: 'BarberCo', client_contact: 'info@barberco.com', description: 'A modern website for a small barber shop with online booking and service showcase.', answers: { project_type: 'Website / Web Application', industry: 'Beauty & Personal Care — Barber Shop', target_users: 'Local customers looking to book haircuts and grooming services online. Age range 18–50, mobile-first users.', core_features: '1. Online appointment booking (select service, barber, date/time)\n2. Services & pricing page\n3. Barber team profiles\n4. Photo gallery (before/after, shop interior)\n5. Contact page with map & phone number\n6. Homepage with hero banner and call-to-action', tech_preferences: 'React.js frontend, Node.js + Express backend, PostgreSQL database. Mobile-responsive design.', integrations: 'Google Maps embed for location. Optional: WhatsApp click-to-chat button. Email notifications for booking confirmations.', non_functional: 'Fast load time (under 2s). Mobile-first responsive design. SEO optimized. Clean modern UI with dark/barber aesthetic.', timeline: '4–6 weeks for full MVP', budget_range: '$1,500 to $3,000 USD', special_requirements: 'Arabic + English bilingual support (RTL for Arabic). Owner dashboard to manage bookings and availability.', existing_systems: 'None — greenfield project', deployment: 'VPS (Ubuntu), Nginx reverse proxy, PM2 process manager' } }
  },
  {
    id: 'fashion',
    emoji: '👗',
    label: 'Fashion Store',
    tag: 'Mobile App',
    color: '#8b5cf6',
    data: { name: 'StyleHub - Fashion Store App', client_name: 'StyleHub', client_contact: 'hello@stylehub.com', description: 'A mobile-first fashion eCommerce app powered by WooCommerce with full shopping experience.', answers: { project_type: 'Mobile App + Web (WooCommerce-powered)', industry: 'Fashion & Retail — Clothing Store', target_users: 'Fashion-conscious shoppers aged 18–40, mobile-first, browsing and buying clothes online. Both men and women.', core_features: '1. Product catalog with categories (men, women, kids, sale)\n2. Product pages with size guide, color variants, zoom gallery\n3. Shopping cart and wishlist\n4. Secure checkout (credit card, Apple Pay, Google Pay)\n5. Order tracking and history\n6. User accounts and saved addresses\n7. Push notifications for offers and order updates\n8. WooCommerce backend for inventory management\n9. Promo codes and discount system\n10. Reviews and ratings', tech_preferences: 'React Native (iOS + Android), WooCommerce REST API backend, Node.js middleware, PostgreSQL for user data', integrations: 'WooCommerce, Stripe, Firebase push notifications, Google Analytics, Instagram Shopping feed', non_functional: 'Fast image loading with lazy load and CDN. Offline browsing mode for catalog. App size under 30MB. GDPR compliant.', timeline: '10–14 weeks for MVP', budget_range: '$15,000 – $25,000 USD', special_requirements: 'Arabic + English bilingual (RTL). Loyalty points system. Size recommendation based on past orders.', existing_systems: 'Existing WooCommerce store — app must sync with it in real-time', deployment: 'React Native build deployed to App Store + Google Play. Backend on VPS with PM2 + Nginx.' } }
  },
  {
    id: 'pos',
    emoji: '🛒',
    label: 'Supermarket POS',
    tag: 'Web App',
    color: '#10b981',
    data: { name: 'MarketPro - Supermarket POS & Management', client_name: 'MarketPro', client_contact: 'ops@marketpro.com', description: 'A full-featured Point of Sale web system for a supermarket chain with inventory, cashier UI, and reporting.', answers: { project_type: 'Web Application (POS + Management Dashboard)', industry: 'Retail — Supermarket / Grocery', target_users: 'Cashiers at checkout counters (simple fast UI), store managers (inventory + reports), and super admin (multi-branch control). Non-technical staff.', core_features: '1. Cashier POS screen — barcode scan, product search, cart, receipt print\n2. Product & category management (CRUD)\n3. Inventory tracking with low-stock alerts\n4. Multi-branch support — each branch has its own stock\n5. Customer loyalty card system\n6. Daily/weekly/monthly sales reports with charts\n7. Employee management (cashier accounts, shift logs)\n8. Supplier management and purchase orders\n9. Returns and refunds workflow\n10. Offline mode — POS works without internet, syncs when back online', tech_preferences: 'React.js frontend (optimized for touch/tablet), Node.js + Express backend, PostgreSQL database, WebSocket for real-time stock updates', integrations: 'Barcode scanner (USB HID), thermal receipt printer, cash drawer trigger, SMS alerts via Twilio', non_functional: 'Sub-100ms response on POS screen. Offline-first with local IndexedDB sync. Multi-currency support. Role-based access control.', timeline: '12–16 weeks', budget_range: '$20,000 – $35,000 USD', special_requirements: 'Arabic RTL interface for all screens. VAT calculation (15% GCC standard). Printable Arabic receipts. Multi-branch dashboard.', existing_systems: 'None — greenfield. Will replace manual paper-based system.', deployment: 'On-premise server per branch + cloud HQ dashboard. Ubuntu + Nginx + PM2. Nightly automated DB backups.' } }
  },
  {
    id: 'portfolio',
    emoji: '🎨',
    label: 'Dev Portfolio',
    tag: 'Website',
    color: '#06b6d4',
    data: { name: 'DevFolio - Personal Portfolio Website', client_name: 'DevFolio', client_contact: 'contact@devfolio.me', description: 'A modern, animated personal portfolio website for a full-stack developer showcasing projects, skills, and contact.', answers: { project_type: 'Static Website / Portfolio', industry: 'Personal Branding — Software Developer', target_users: 'Potential employers, tech recruiters, and clients looking to hire or collaborate. Desktop and mobile visitors.', core_features: '1. Hero section with animated intro and personal tagline\n2. About section with photo, bio, and skills grid\n3. Projects showcase with live demo + GitHub links\n4. Experience timeline (work history + education)\n5. Skills section with animated progress bars or tech icons\n6. Blog / articles section (MDX-powered)\n7. Contact form with email delivery (Nodemailer)\n8. Dark/light mode toggle\n9. Resume PDF download button\n10. SEO optimized with Open Graph meta tags', tech_preferences: 'Next.js 14 (App Router), Tailwind CSS, Framer Motion for animations, MDX for blog, deployed on Vercel', integrations: 'GitHub API (auto-pull pinned repos), Nodemailer for contact form, Google Analytics, Cal.com embed for booking calls', non_functional: 'Lighthouse score 95+. First contentful paint under 1s. Fully responsive. Accessible (WCAG 2.1 AA).', timeline: '3–4 weeks', budget_range: '$800 – $2,000 USD', special_requirements: 'Smooth page transitions. Custom cursor effect. Gradient animated background on hero. Scroll-triggered animations throughout.', existing_systems: 'None — brand new from scratch', deployment: 'Vercel (free tier). Custom domain. Auto-deploy on GitHub push.' } }
  },
  {
    id: 'saas',
    emoji: '⚡',
    label: 'SaaS Dashboard',
    tag: 'Web App',
    color: '#f59e0b',
    data: { name: 'DataPulse - Analytics SaaS Dashboard', client_name: 'DataPulse', client_contact: 'hello@datapulse.io', description: 'A multi-tenant SaaS analytics dashboard for businesses to track KPIs, revenue, and user behavior.', answers: { project_type: 'SaaS Web Application (Multi-tenant)', industry: 'Technology — Business Intelligence / Analytics', target_users: 'Small to mid-size business owners and their teams who want to track performance metrics without needing data engineers. Tech-savvy but not developers.', core_features: '1. Multi-tenant account system (each company has isolated data)\n2. KPI dashboard with customizable widgets\n3. Revenue charts, user growth, conversion funnel\n4. Data source integrations (Google Analytics, Stripe, Shopify)\n5. Automated weekly email reports\n6. Team members with role-based access\n7. Custom date range filtering\n8. CSV and PDF export\n9. Notification center (anomaly alerts, goal reached)\n10. Subscription billing with Stripe', tech_preferences: 'Next.js 14, TypeScript, Tailwind CSS, Node.js + Express API, PostgreSQL, Redis for caching, Chart.js / Recharts', integrations: 'Google Analytics API, Stripe (billing + data), Shopify API, Slack webhooks for alerts, SendGrid for emails', non_functional: 'Dashboard loads under 1s with caching. 99.9% uptime SLA. SOC 2 compliance ready. Multi-region deployment.', timeline: '16–20 weeks for full v1', budget_range: '$40,000 – $70,000 USD', special_requirements: 'White-label option for agencies. AI-powered trend analysis and anomaly detection. Mobile app companion (React Native).', existing_systems: 'None — greenfield SaaS product', deployment: 'AWS (EC2 + RDS + ElastiCache + S3). CloudFront CDN. GitHub Actions CI/CD.' } }
  },
  {
    id: 'delivery',
    emoji: '🚚',
    label: 'Delivery App',
    tag: 'Mobile App',
    color: '#ef4444',
    data: { name: 'SwiftDeliver - On-Demand Delivery App', client_name: 'SwiftDeliver', client_contact: 'ops@swiftdeliver.com', description: 'An on-demand delivery platform connecting customers, restaurants/stores, and delivery drivers in real-time.', answers: { project_type: 'Mobile App (iOS + Android) + Web Admin Panel', industry: 'Logistics & Delivery — On-Demand', target_users: '3 user types: (1) Customers ordering delivery, (2) Restaurants/stores managing orders, (3) Delivery drivers accepting and fulfilling orders. All mobile-first.', core_features: '1. Customer app: browse merchants, place orders, real-time tracking\n2. Driver app: accept orders, navigation, earnings dashboard\n3. Merchant dashboard: manage menu, orders, availability\n4. Admin panel: manage all users, commissions, analytics\n5. Real-time order tracking with live map\n6. Push notifications for order status\n7. In-app chat between customer and driver\n8. Multiple payment methods (card, wallet, cash)\n9. Ratings and reviews system\n10. Surge pricing and promo codes', tech_preferences: 'React Native for customer + driver apps, React.js for merchant + admin web, Node.js + Express backend, PostgreSQL, Redis, Socket.io for real-time', integrations: 'Google Maps API (routing + ETA), Stripe + Apple/Google Pay, Firebase (push notifications), Twilio (SMS OTP)', non_functional: 'Real-time tracking updates every 5 seconds. Handle 10,000 concurrent orders. App Store compliant. Arabic RTL support.', timeline: '20–24 weeks for full MVP', budget_range: '$60,000 – $100,000 USD', special_requirements: 'Arabic + English bilingual (RTL). Kuwait/GCC market focused. Driver payout system with weekly settlements.', existing_systems: 'None — new startup product', deployment: 'AWS (ECS + RDS + ElastiCache). Auto-scaling. Multi-AZ for high availability.' } }
  },
]

const STATUS_BORDER = {
  active: 'linear-gradient(90deg, #22c55e, #16a34a)',
  completed: 'linear-gradient(90deg, #F47B20, #D4680A)',
  archived: 'linear-gradient(90deg, #475569, #334155)',
}

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.05, duration: 0.3, ease: 'easeOut' }
  })
}

// Skeleton card
function SkeletonCard() {
  return (
    <div className="rounded-2xl p-5" style={{ backgroundColor: '#0f1117', border: '1px solid #1e2533' }}>
      <div className="skeleton h-4 w-3/4 mb-3" />
      <div className="skeleton h-3 w-1/2 mb-4" />
      <div className="flex items-center justify-between pt-3" style={{ borderTop: '1px solid #1e2533' }}>
        <div className="skeleton h-5 w-20 rounded-full" />
        <div className="skeleton h-3 w-16" />
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedIds, setSelectedIds] = useState([])
  const [showBulkConfirm, setShowBulkConfirm] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [importJson, setImportJson] = useState(IMPORT_TEMPLATE)
  const [importError, setImportError] = useState('')
  const [importing, setImporting] = useState(false)
  const [activePreset, setActivePreset] = useState(null)
  const [copiedTemplate, setCopiedTemplate] = useState(false)
  const [successToast, setSuccessToast] = useState(false)
  const [queueStatus, setQueueStatus] = useState(null)
  const navigate = useNavigate()
  const { user } = useAuth()

  const fetchProjects = useCallback(async () => {
    try {
      setLoading(true)
      const res = await apiClient.get('/projects')
      setProjects(res.data.projects || res.data || [])
    } catch (err) {
      setError('Failed to load projects.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Silent refresh (no loading spinner) for polling
  const refreshProjects = useCallback(async () => {
    try {
      const res = await apiClient.get('/projects')
      setProjects(res.data.projects || res.data || [])
    } catch {}
  }, [])

  // Fetch global queue status
  const fetchQueueStatus = useCallback(async () => {
    try {
      const res = await apiClient.get('/queue/status')
      setQueueStatus(res.data)
    } catch {
      setQueueStatus(null)
    }
  }, [])

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  // Poll queue status every 8 seconds
  useEffect(() => {
    fetchQueueStatus()
    const interval = setInterval(() => {
      refreshProjects()
      fetchQueueStatus()
    }, 8000)
    return () => clearInterval(interval)
  }, [refreshProjects, fetchQueueStatus])

  const toggleSelect = (e, id) => {
    e.stopPropagation()
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const handleBulkDelete = async () => {
    setBulkDeleting(true)
    try {
      await apiClient.post('/projects/bulk-delete', { ids: selectedIds })
      setSelectedIds([])
      setShowBulkConfirm(false)
      fetchProjects()
    } catch {
      setError('Failed to delete selected projects.')
      setShowBulkConfirm(false)
    } finally {
      setBulkDeleting(false)
    }
  }

  const copyToClipboard = (text) => {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text)
    } else {
      const el = document.createElement('textarea')
      el.value = text
      el.style.position = 'fixed'
      el.style.opacity = '0'
      document.body.appendChild(el)
      el.focus()
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
  }

  const handleCopyTemplate = () => {
    copyToClipboard(importJson)
    setCopiedTemplate(true)
    setTimeout(() => setCopiedTemplate(false), 2000)
  }

  const handleImport = async () => {
    setImportError('')
    let parsed
    try {
      parsed = JSON.parse(importJson)
    } catch {
      setImportError('Invalid JSON format')
      return
    }
    setImporting(true)
    try {
      const res = await apiClient.post('/projects/import', parsed)
      const projectId = res.data?.project?.id
      setShowImport(false)
      setImportJson(IMPORT_TEMPLATE)
      setImportError('')
      fetchProjects()
      if (projectId) {
        navigate(`/projects/${projectId}?tab=srs`)
      } else {
        setSuccessToast(true)
        setTimeout(() => setSuccessToast(false), 4000)
      }
    } catch (err) {
      const msg = err?.response?.data?.error || err?.response?.data?.message || 'Import failed. Please try again.'
      setImportError(msg)
    } finally {
      setImporting(false)
    }
  }

  const filtered = projects.filter((p) => {
    const matchesSearch =
      p.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.client_name?.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = statusFilter === 'all' || p.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const formatDate = (d) => {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const generatingProjects = projects.filter(p => p.generation_status === 'generating')
  const failedProjects = projects.filter(p => p.generation_status === 'failed')

  return (
    <div className="p-6 max-w-6xl mx-auto">

      {/* Queue Status Banner */}
      {(queueStatus?.isProcessing || (queueStatus?.queue && queueStatus.queue.length > 0) || failedProjects.length > 0) && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-5 rounded-2xl overflow-hidden"
          style={{ border: '1px solid rgba(244,123,32,0.2)', background: 'rgba(244,123,32,0.05)' }}
        >
          <div className="px-4 py-3 flex items-center gap-3 flex-wrap">
            {/* Icon */}
            <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(244,123,32,0.15)' }}>
              <svg className="w-4 h-4" fill="none" stroke="#F47B20" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold" style={{ color: '#f1f5f9' }}>
                Generation Queue
              </p>
              <div className="flex flex-wrap gap-3 mt-1">
                {/* Current job */}
                {queueStatus?.currentJob && (
                  <span className="flex items-center gap-1.5 text-xs" style={{ color: '#94a3b8' }}>
                    <span className="flex gap-0.5">
                      {[0,1,2].map(i => (
                        <span key={i} className="typing-dot w-1 h-1 rounded-full inline-block"
                          style={{ backgroundColor: queueStatus.currentJob.type === 'editing' ? '#8b5cf6' : '#F47B20', animationDelay: `${i * 0.15}s` }} />
                      ))}
                    </span>
                    <span style={{ color: '#f1f5f9', fontWeight: 600 }}>{queueStatus.currentJob.projectName}</span>
                    {/* Type badge */}
                    <span className="px-1.5 py-0.5 rounded text-xs font-medium" style={
                      queueStatus.currentJob.type === 'editing'
                        ? { background: 'rgba(139,92,246,0.15)', color: '#8b5cf6', border: '1px solid rgba(139,92,246,0.3)' }
                        : { background: 'rgba(244,123,32,0.15)', color: '#F59340', border: '1px solid rgba(244,123,32,0.3)' }
                    }>
                      {queueStatus.currentJob.type === 'editing' ? '✏️ Editing' : '🔄 Generating'}
                    </span>
                    <span style={{ color: '#475569' }}>
                      {queueStatus.currentJob.type === 'editing' ? '— editing now' : '— generating now'}
                    </span>
                  </span>
                )}
                {/* Queued items */}
                {queueStatus?.queue?.map((item) => (
                  <span key={item.projectId} className="flex items-center gap-1.5 text-xs" style={{ color: '#94a3b8' }}>
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#475569' }} />
                    <span style={{ color: '#f1f5f9', fontWeight: 600 }}>{item.projectName}</span>
                    {/* Type badge */}
                    <span className="px-1.5 py-0.5 rounded text-xs font-medium" style={
                      item.type === 'editing'
                        ? { background: 'rgba(139,92,246,0.15)', color: '#8b5cf6', border: '1px solid rgba(139,92,246,0.3)' }
                        : { background: 'rgba(244,123,32,0.15)', color: '#F59340', border: '1px solid rgba(244,123,32,0.3)' }
                    }>
                      {item.type === 'editing' ? '✏️ Editing' : '🔄 Generating'}
                    </span>
                    <span style={{ color: '#475569' }}>— waiting...</span>
                  </span>
                ))}
              </div>
            </div>

            {/* Queue stats */}
            <div className="flex items-center gap-4 text-xs flex-shrink-0">
              {queueStatus && (
                <>
                  <div className="text-center">
                    <p style={{ color: '#F47B20', fontWeight: 700, fontSize: 16 }}>{queueStatus.queueLength ?? 0}</p>
                    <p style={{ color: '#475569' }}>In Queue</p>
                  </div>
                  <div className="text-center">
                    <p style={{ color: '#22c55e', fontWeight: 700, fontSize: 16 }}>
                      {projects.filter(p => p.generation_status === 'ready').length}
                    </p>
                    <p style={{ color: '#475569' }}>Ready</p>
                  </div>
                </>
              )}
              {failedProjects.length > 0 && (
                <div className="text-center">
                  <p style={{ color: '#ef4444', fontWeight: 700, fontSize: 16 }}>{failedProjects.length}</p>
                  <p style={{ color: '#475569' }}>Failed</p>
                </div>
              )}
              <span className="px-2 py-0.5 rounded-full text-xs" style={{
                background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)'
              }}>
                Auto-refreshing
              </span>
            </div>
          </div>

          {/* Failed projects list */}
          {failedProjects.length > 0 && (
            <div className="px-4 pb-3 flex flex-wrap gap-2">
              {failedProjects.map(p => (
                <span key={p.id} className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full"
                  style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#ef4444' }} />
                  {p.name} — Failed
                </span>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* Header */}
      <motion.div
        className="flex items-center gap-4 mb-6"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex-shrink-0">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold" style={{ color: '#f1f5f9' }}>Projects</h1>
            {!loading && (
              <motion.span
                className="px-2.5 py-0.5 rounded-full text-xs font-semibold"
                style={{ backgroundColor: 'rgba(244,123,32,0.15)', color: '#F59340', border: '1px solid rgba(244,123,32,0.25)' }}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 400, delay: 0.2 }}
              >
                {projects.length}
              </motion.span>
            )}
          </div>
          <p className="text-sm mt-0.5" style={{ color: '#475569' }}>
            {user?.role === 'super_admin' ? 'All projects' : 'Your projects'}
          </p>
        </div>

        {/* Search bar — between title and action buttons */}
        <div className="relative flex-1 max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#475569' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search projects..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-xl outline-none transition-all"
            style={{
              backgroundColor: '#0f1117',
              border: '1px solid #1e2533',
              color: '#f1f5f9',
            }}
            onFocus={e => { e.target.style.borderColor = '#F47B20'; e.target.style.boxShadow = '0 0 0 3px rgba(244,123,32,0.08)' }}
            onBlur={e => { e.target.style.borderColor = '#1e2533'; e.target.style.boxShadow = 'none' }}
          />
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
          <motion.button
            onClick={() => { setImportJson(IMPORT_TEMPLATE); setImportError(''); setShowImport(true) }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
            style={{
              backgroundColor: 'transparent',
              border: '1px solid #1e2533',
              color: '#94a3b8',
            }}
            whileHover={{ borderColor: '#F47B20', color: '#F59340', backgroundColor: 'rgba(244,123,32,0.06)' }}
            whileTap={{ scale: 0.97 }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Import
          </motion.button>
          <motion.button
            onClick={() => navigate('/projects/new')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold"
            style={{
              background: 'linear-gradient(135deg, #F47B20, #D4680A)',
              boxShadow: '0 4px 14px rgba(244,123,32,0.3)'
            }}
            whileHover={{ scale: 1.02, boxShadow: '0 6px 20px rgba(244,123,32,0.4)' }}
            whileTap={{ scale: 0.97 }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Project
          </motion.button>
        </div>
      </motion.div>

      {/* Filters — status tabs only */}
      <motion.div
        className="flex items-center gap-1.5 mb-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        {STATUS_OPTIONS.map((s) => (
          <motion.button
            key={s}
            onClick={() => setStatusFilter(s)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all"
            style={
              statusFilter === s
                ? { backgroundColor: 'rgba(244,123,32,0.15)', color: '#F59340', border: '1px solid rgba(244,123,32,0.3)' }
                : { color: '#94a3b8', border: '1px solid transparent' }
            }
            whileHover={statusFilter !== s ? { backgroundColor: 'rgba(255,255,255,0.04)', color: '#f1f5f9' } : {}}
            whileTap={{ scale: 0.95 }}
          >
            {s}
          </motion.button>
        ))}
      </motion.div>

      {/* Selection toolbar */}
      <AnimatePresence>
        {selectedIds.length > 0 && (
          <motion.div
            className="flex items-center gap-3 mb-4 px-4 py-3 rounded-xl"
            style={{ backgroundColor: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <span className="text-sm font-medium" style={{ color: '#fca5a5' }}>{selectedIds.length} selected</span>
            <div className="flex-1" />
            <button
              onClick={() => setSelectedIds([])}
              className="text-xs hover:underline"
              style={{ color: '#94a3b8' }}
            >
              Clear selection
            </button>
            <motion.button
              onClick={() => setShowBulkConfirm(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
              style={{ backgroundColor: '#ef4444' }}
              whileHover={{ backgroundColor: '#dc2626' }}
              whileTap={{ scale: 0.97 }}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete Selected
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bulk delete confirm modal */}
      <AnimatePresence>
        {showBulkConfirm && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !bulkDeleting && setShowBulkConfirm(false)}
          >
            <motion.div
              className="w-full max-w-sm rounded-2xl p-6"
              style={{ backgroundColor: '#0f1117', border: '1px solid #1e2533' }}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
            >
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
                style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}
              >
                <svg className="w-6 h-6" style={{ color: '#ef4444' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <h3 className="text-base font-semibold mb-1" style={{ color: '#f1f5f9' }}>
                Delete {selectedIds.length} project{selectedIds.length > 1 ? 's' : ''}?
              </h3>
              <p className="text-sm mb-5" style={{ color: '#64748b' }}>This cannot be undone. All SRS versions and data will be permanently removed.</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowBulkConfirm(false)}
                  disabled={bulkDeleting}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                  style={{ backgroundColor: '#161b27', color: '#94a3b8', border: '1px solid #1e2533' }}
                >
                  Cancel
                </button>
                <motion.button
                  onClick={handleBulkDelete}
                  disabled={bulkDeleting}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
                  style={{ backgroundColor: '#ef4444' }}
                  whileHover={{ backgroundColor: '#dc2626' }}
                  whileTap={{ scale: 0.97 }}
                >
                  {bulkDeleting && <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />}
                  {bulkDeleting ? 'Deleting...' : 'Delete All'}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success Toast */}
      <AnimatePresence>
        {successToast && (
          <motion.div
            className="fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl"
            style={{
              backgroundColor: '#0f1117',
              border: '1px solid rgba(34,197,94,0.35)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(34,197,94,0.1)'
            }}
            initial={{ opacity: 0, x: 60 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 60 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          >
            <span className="text-base">✅</span>
            <span className="text-sm font-medium" style={{ color: '#f1f5f9' }}>
              Project imported! SRS generation started.
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Import Modal */}
      <Modal
        isOpen={showImport}
        onClose={() => !importing && setShowImport(false)}
        title="Import Project"
        maxWidth="max-w-2xl"
      >
        <div className="space-y-4">

          {/* Demo presets */}
          <div>
            <p className="text-xs font-semibold mb-2.5" style={{ color: '#475569' }}>
              🧪 Demo presets — click to load
            </p>
            <div className="grid grid-cols-3 gap-2">
              {DEMO_PRESETS.map((preset, i) => (
                <motion.button
                  key={preset.id}
                  onClick={() => {
                    setActivePreset(preset.id)
                    setImportJson(JSON.stringify(preset.data, null, 2))
                    setImportError('')
                  }}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-left transition-all"
                  style={{
                    background: activePreset === preset.id ? `${preset.color}12` : '#0f1117',
                    border: `1px solid ${activePreset === preset.id ? preset.color + '50' : '#1e2533'}`,
                    boxShadow: activePreset === preset.id ? `0 0 0 1px ${preset.color}30` : 'none',
                  }}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  whileHover={{ borderColor: preset.color + '40', backgroundColor: preset.color + '08' }}
                  whileTap={{ scale: 0.97 }}
                >
                  <span style={{ fontSize: 16 }}>{preset.emoji}</span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate" style={{ color: activePreset === preset.id ? preset.color : '#f1f5f9' }}>
                      {preset.label}
                    </p>
                    <p className="text-[10px]" style={{ color: '#334155' }}>{preset.tag}</p>
                  </div>
                  {activePreset === preset.id && (
                    <motion.div
                      className="ml-auto flex-shrink-0"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 400 }}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke={preset.color} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    </motion.div>
                  )}
                </motion.button>
              ))}
            </div>
          </div>

          <div style={{ height: 1, background: '#1e2533' }} />

          {/* JSON Editor */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs" style={{ color: '#475569' }}>
                {activePreset
                  ? <span>Loaded: <span style={{ color: DEMO_PRESETS.find(p => p.id === activePreset)?.color }}>
                      {DEMO_PRESETS.find(p => p.id === activePreset)?.emoji} {DEMO_PRESETS.find(p => p.id === activePreset)?.label}
                    </span> — edit if needed</span>
                  : 'Paste or edit JSON below'}
              </p>
              <div className="flex items-center gap-2">
                {activePreset && (
                  <motion.button
                    onClick={() => { setActivePreset(null); setImportJson(IMPORT_TEMPLATE); setImportError('') }}
                    className="text-xs px-2.5 py-1 rounded-lg"
                    style={{ color: '#475569', border: '1px solid #1e2533' }}
                    whileHover={{ color: '#94a3b8' }}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  >
                    ✕ Clear
                  </motion.button>
                )}
                <button
                  onClick={handleCopyTemplate}
                  className="text-xs px-3 py-1.5 rounded-lg transition-all"
                  style={{ color: '#14b8a6', border: '1px solid rgba(20,184,166,0.3)', backgroundColor: 'transparent', cursor: 'pointer' }}
                  onMouseEnter={e => { e.target.style.backgroundColor = 'rgba(20,184,166,0.08)' }}
                  onMouseLeave={e => { e.target.style.backgroundColor = 'transparent' }}
                >
                  {copiedTemplate ? '✓ Copied!' : '📋 Copy'}
                </button>
              </div>
            </div>
            <textarea
              value={importJson}
              onChange={e => { setImportJson(e.target.value); setImportError(''); setActivePreset(null) }}
              rows={14}
              spellCheck={false}
              className="w-full text-xs font-mono p-4 rounded-xl outline-none resize-none transition-all"
              style={{
                backgroundColor: '#080b12',
                border: importError ? '1px solid rgba(239,68,68,0.5)' : '1px solid #1e2533',
                color: '#f1f5f9',
                lineHeight: '1.6',
              }}
              onFocus={e => { if (!importError) { e.target.style.borderColor = '#F47B20'; e.target.style.boxShadow = '0 0 0 3px rgba(244,123,32,0.08)' }}}
              onBlur={e => { if (!importError) { e.target.style.borderColor = '#1e2533'; e.target.style.boxShadow = 'none' }}}
            />
          </div>

          <AnimatePresence>
            {importError && (
              <motion.div
                className="flex items-center gap-2.5 px-4 py-3 rounded-xl"
                style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}
                initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              >
                <svg className="w-4 h-4 flex-shrink-0" style={{ color: '#ef4444' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm" style={{ color: '#fca5a5' }}>{importError}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex gap-3 pt-1">
            <button
              onClick={() => { setShowImport(false); setActivePreset(null) }}
              disabled={importing}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
              style={{ backgroundColor: '#161b27', color: '#94a3b8', border: '1px solid #1e2533' }}
            >
              Cancel
            </button>
            <motion.button
              onClick={handleImport}
              disabled={importing}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg, #F47B20, #D4680A)', boxShadow: '0 4px 14px rgba(244,123,32,0.3)' }}
              whileHover={{ boxShadow: '0 6px 20px rgba(244,123,32,0.4)' }}
              whileTap={{ scale: 0.97 }}
            >
              {importing && <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />}
              {importing ? 'Importing...' : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Import{activePreset ? ` ${DEMO_PRESETS.find(p => p.id === activePreset)?.emoji}` : ''}
                </>
              )}
            </motion.button>
          </div>
        </div>
      </Modal>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : error ? (
        <div className="text-center py-20">
          <p className="text-sm mb-3" style={{ color: '#ef4444' }}>{error}</p>
          <button onClick={fetchProjects} className="text-xs hover:underline" style={{ color: '#F59340' }}>Retry</button>
        </div>
      ) : filtered.length === 0 && projects.length === 0 ? (
        /* No projects at all */
        <motion.div
          className="text-center py-24"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-5"
            style={{ backgroundColor: 'rgba(244,123,32,0.08)', border: '1px solid rgba(244,123,32,0.15)' }}>
            <svg className="w-8 h-8" style={{ color: '#475569' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <h3 className="text-base font-semibold mb-1.5" style={{ color: '#94a3b8' }}>No projects yet</h3>
          <p className="text-sm mb-5" style={{ color: '#475569' }}>Create your first project to get started</p>
          <motion.button
            onClick={() => navigate('/projects/new')}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, #F47B20, #D4680A)' }}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
          >
            Create Project
          </motion.button>
        </motion.div>
      ) : filtered.length === 0 ? (
        /* No results from search/filter */
        <motion.div
          className="text-center py-24"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-5"
            style={{ backgroundColor: 'rgba(71,85,105,0.08)', border: '1px solid rgba(71,85,105,0.2)' }}>
            <svg className="w-8 h-8" style={{ color: '#475569' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <h3 className="text-base font-semibold mb-1.5" style={{ color: '#94a3b8' }}>No projects found</h3>
          <p className="text-sm mb-5" style={{ color: '#475569' }}>
            No projects match <span style={{ color: '#f1f5f9', fontWeight: 600 }}>"{search || statusFilter}"</span>. Try a different search term or clear the filters.
          </p>
          <div className="flex items-center justify-center gap-3">
            {search && (
              <motion.button
                onClick={() => setSearch('')}
                className="px-4 py-2 rounded-xl text-sm font-medium"
                style={{ backgroundColor: 'rgba(71,85,105,0.12)', color: '#94a3b8', border: '1px solid #1e2533' }}
                whileHover={{ backgroundColor: 'rgba(71,85,105,0.2)', color: '#f1f5f9' }}
                whileTap={{ scale: 0.97 }}
              >
                Clear search
              </motion.button>
            )}
            {statusFilter !== 'all' && (
              <motion.button
                onClick={() => setStatusFilter('all')}
                className="px-4 py-2 rounded-xl text-sm font-medium"
                style={{ backgroundColor: 'rgba(71,85,105,0.12)', color: '#94a3b8', border: '1px solid #1e2533' }}
                whileHover={{ backgroundColor: 'rgba(71,85,105,0.2)', color: '#f1f5f9' }}
                whileTap={{ scale: 0.97 }}
              >
                Clear filter
              </motion.button>
            )}
          </div>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {filtered.map((project, i) => (
              <motion.div
                key={project.id}
                custom={i}
                variants={cardVariants}
                initial="hidden"
                animate="visible"
                onClick={() => navigate(`/projects/${project.id}`)}
                className="group relative cursor-pointer rounded-2xl overflow-hidden"
                style={{
                  backgroundColor: '#0f1117',
                  border: selectedIds.includes(project.id)
                    ? '1px solid rgba(244,123,32,0.5)'
                    : '1px solid #1e2533',
                }}
                whileHover={{
                  y: -3,
                  borderColor: selectedIds.includes(project.id) ? 'rgba(244,123,32,0.6)' : 'rgba(244,123,32,0.3)',
                  boxShadow: '0 12px 30px rgba(0,0,0,0.4), 0 0 0 1px rgba(244,123,32,0.15)'
                }}
                whileTap={{ scale: 0.99 }}
                transition={{ duration: 0.2 }}
              >
                {/* Gradient top strip */}
                <div
                  className="h-0.5 w-full"
                  style={{ background: STATUS_BORDER[project.status] || STATUS_BORDER.archived }}
                />

                {/* Checkbox */}
                <div
                  className="absolute top-3 left-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ opacity: selectedIds.includes(project.id) ? 1 : undefined }}
                  onClick={e => toggleSelect(e, project.id)}
                >
                  <div
                    className="w-5 h-5 rounded flex items-center justify-center transition-all cursor-pointer"
                    style={{
                      backgroundColor: selectedIds.includes(project.id) ? '#F47B20' : 'rgba(15,17,23,0.9)',
                      border: selectedIds.includes(project.id) ? '1.5px solid #F47B20' : '1.5px solid #334155',
                      boxShadow: selectedIds.includes(project.id) ? '0 0 8px rgba(244,123,32,0.4)' : 'none'
                    }}
                  >
                    {selectedIds.includes(project.id) && (
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>

                <div className="p-5">
                  <div className="flex items-start justify-between mb-2">
                    <h3
                      className="text-sm font-semibold line-clamp-1 flex-1 mr-2 transition-colors group-hover:text-blue-400"
                      style={{ color: '#f1f5f9' }}
                    >
                      {project.name}
                    </h3>
                    <StatusBadge status={project.status} />
                  </div>
                  <p className="text-xs mb-1" style={{ color: '#94a3b8' }}>{project.client_name}</p>
                  {project.client_contact && (
                    <p className="text-xs mb-0" style={{ color: '#475569' }}>{project.client_contact}</p>
                  )}

                  <div
                    className="flex items-center justify-between mt-4 pt-3"
                    style={{ borderTop: '1px solid #1e2533' }}
                  >
                    <GenerationBadge status={project.generation_status || 'idle'} />
                    <div className="flex items-center gap-2">
                      <span className="text-xs" style={{ color: '#475569' }}>{formatDate(project.created_at)}</span>
                      <motion.div
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ color: '#F59340' }}
                        initial={{ x: -4 }}
                        whileHover={{ x: 0 }}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                      </motion.div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
