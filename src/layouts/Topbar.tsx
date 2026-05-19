import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Search, Bell, Moon, Sun, Menu,
  User, Settings, Palette, LogOut, Trophy, Clock, Info, AlertTriangle,
} from 'lucide-react'
import { useUIStore } from '@/store/ui.store'
import { ALL_NAV_ITEMS } from '@/lib/navigation'
import { useTheme } from '@/hooks/useTheme'
import { useNotificationsStore } from '@/store/notificationsStore'
import { useAuthStore } from '@/store/auth.store'
import type { NotificationType } from '@/types/notification'

// ── Helpers ───────────────────────────────────────────────────────────────────
function getPageInfo(pathname: string) {
  const emojis: Record<string, string> = {
    '/': '🏠', '/nutricion': '🥗', '/ejercicios': '💪',
    '/tareas': '✅', '/calendario': '📅', '/ocio': '🎬',
    '/kira': '👧', '/planes': '📍', '/aprender': '🧠',
    '/diario': '📝', '/ia': '✨', '/ajustes': '⚙️',
    '/medicacion': '💊', '/patrimonio': '📈', '/perfil': '👤',
    '/patrones': '🧠', '/progreso': '📈', '/salud': '❤️', '/informe-semanal': '📊',
  }
  if (pathname === '/') return { label: 'Inicio', emoji: '🏠' }
  const item = ALL_NAV_ITEMS.find((i) => i.path !== '/' && pathname.startsWith(i.path))
  return { label: item?.label ?? 'LifePilot', emoji: emojis[item?.path ?? ''] ?? '⚡' }
}

function relativeTime(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000)
  if (secs < 60) return 'ahora mismo'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `hace ${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `hace ${hours}h`
  const days = Math.floor(hours / 24)
  return `hace ${days}d`
}

function NotifIcon({ type }: { type: NotificationType }) {
  const cls = 'shrink-0 mt-0.5'
  if (type === 'achievement') return <Trophy size={14} className={`${cls} text-amber-400`} />
  if (type === 'reminder')    return <Clock   size={14} className={`${cls} text-blue-400`} />
  if (type === 'warning')     return <AlertTriangle size={14} className={`${cls} text-rose-400`} />
  return <Info size={14} className={`${cls} text-white/40`} />
}

// ── Dropdown animation ────────────────────────────────────────────────────────
const dropVariants = {
  hidden:  { opacity: 0, scale: 0.95, y: -6 },
  visible: { opacity: 1, scale: 1,    y: 0,  transition: { duration: 0.15, ease: 'easeOut' as const } },
  exit:    { opacity: 0, scale: 0.95, y: -4, transition: { duration: 0.1 } },
}

// ── Topbar ────────────────────────────────────────────────────────────────────
export function Topbar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { setMobileMenuOpen, sidebarCollapsed } = useUIStore()
  const { label, emoji } = getPageInfo(pathname)
  const { isDark, toggle } = useTheme()
  const { notifications, markAsRead, markAllAsRead } = useNotificationsStore()
  const { user, logout } = useAuthStore()

  const [notifOpen, setNotifOpen]     = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const notifRef   = useRef<HTMLDivElement>(null)
  const profileRef = useRef<HTMLDivElement>(null)

  const name      = user?.name    ?? 'Usuario'
  const email     = user?.email   ?? ''
  const avatarUrl = user?.picture ?? null

  const unreadCount = notifications.filter((n) => !n.read).length
  const initial     = name ? name.charAt(0).toUpperCase() : 'U'

  // Click-outside + Escape for both dropdowns
  useEffect(() => {
    function onMouse(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false)
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setNotifOpen(false); setProfileOpen(false) }
    }
    document.addEventListener('mousedown', onMouse)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onMouse)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  // Close dropdowns on route change
  useEffect(() => { setNotifOpen(false); setProfileOpen(false) }, [pathname])

  function goTo(path: string) {
    navigate(path)
    setProfileOpen(false)
  }

  return (
    <header
      className="fixed top-0 right-0 z-20 h-14 flex items-center px-4 gap-3 bg-(--bg-topbar) backdrop-blur-xl border-b border-(--border) transition-[left] duration-280"
      style={{ left: typeof window !== 'undefined' && window.innerWidth >= 1024 ? (sidebarCollapsed ? 64 : 240) : 0 }}
    >
      {/* Mobile menu */}
      <button
        className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg text-(--text-secondary) hover:text-(--text-primary) hover:bg-(--hover-bg) transition-colors"
        onClick={() => setMobileMenuOpen(true)}
      >
        <Menu size={18} />
      </button>

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="text-base">{emoji}</span>
        <motion.h1
          key={pathname}
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2 }}
          className="text-sm font-semibold text-(--text-primary) truncate"
        >
          {label}
        </motion.h1>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        {/* Search (decorative for now) */}
        <button className="hidden md:flex items-center gap-2 h-8 px-3 rounded-lg bg-(--hover-bg) border border-(--border) text-(--text-muted) hover:text-(--text-secondary) text-xs transition-colors">
          <Search size={13} />
          <span>Buscar</span>
          <kbd className="bg-white/8 px-1.5 py-0.5 rounded text-[10px] font-mono">⌘K</kbd>
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggle}
          title={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-(--text-muted) hover:text-(--text-secondary) hover:bg-(--hover-bg) transition-colors"
        >
          {isDark ? <Sun size={15} /> : <Moon size={15} />}
        </button>

        {/* ── Notifications ── */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => { setNotifOpen((o) => !o); setProfileOpen(false) }}
            className="relative w-8 h-8 flex items-center justify-center rounded-lg text-(--text-muted) hover:text-(--text-secondary) hover:bg-(--hover-bg) transition-colors"
          >
            <Bell size={15} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-4.5 h-4 rounded-full bg-blue-500 text-[10px] font-semibold leading-4 text-white flex items-center justify-center px-1">
                {unreadCount}
              </span>
            )}
          </button>

          <AnimatePresence>
            {notifOpen && (
              <motion.div
                variants={dropVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="absolute top-full right-0 mt-2 w-80 rounded-2xl bg-(--bg-popup) border border-(--border) shadow-2xl shadow-black/50 overflow-hidden origin-top-right"
              >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-(--border)">
                  <span className="text-sm font-semibold text-(--text-primary)">Notificaciones</span>
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllAsRead}
                      className="text-xs text-blue-400 hover:text-blue-300 transition"
                    >
                      Marcar todas como leídas
                    </button>
                  )}
                </div>

                {/* List */}
                <div className="max-h-85 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="py-12 text-center text-sm text-(--text-muted)">
                      No tienes notificaciones
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => {
                          markAsRead(n.id)
                          if ((n as { accionUrl?: string }).accionUrl) {
                            navigate((n as { accionUrl?: string }).accionUrl!)
                            setNotifOpen(false)
                          }
                        }}
                        className={`w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-(--hover-bg) transition border-b border-(--border) last:border-0 ${n.read ? 'opacity-50' : ''}`}
                      >
                        <NotifIcon type={n.type} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-(--text-primary) flex items-center gap-1.5 leading-snug">
                            {n.title}
                            {!n.read && (
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                            )}
                          </p>
                          <p className="text-xs text-(--text-secondary) mt-0.5 leading-snug">{n.body}</p>
                          <p className="text-[10px] text-(--text-muted) mt-1">{relativeTime(n.createdAt)}</p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Profile ── */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => { setProfileOpen((o) => !o); setNotifOpen(false) }}
            className="w-8 h-8 rounded-full bg-linear-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-xs font-semibold ring-2 ring-white/8 hover:ring-white/20 transition-all overflow-hidden"
          >
            {avatarUrl
              ? <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
              : initial
            }
          </button>

          <AnimatePresence>
            {profileOpen && (
              <motion.div
                variants={dropVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="absolute top-full right-0 mt-2 w-64 rounded-2xl bg-(--bg-popup) border border-(--border) shadow-2xl shadow-black/50 overflow-hidden origin-top-right"
              >
                {/* User header */}
                <div className="px-4 py-4 flex items-center gap-3 border-b border-(--border)">
                  <div className="w-10 h-10 rounded-full bg-linear-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-sm font-semibold shrink-0 overflow-hidden">
                    {avatarUrl
                      ? <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
                      : initial
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-(--text-primary) truncate">{name}</p>
                    <p className="text-xs text-(--text-muted) truncate">{email}</p>
                  </div>
                </div>

                {/* Nav options */}
                <div className="py-1.5">
                  <button
                    onClick={() => goTo('perfil')}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-(--text-secondary) hover:text-(--text-primary) hover:bg-(--hover-bg) transition"
                  >
                    <User size={15} className="text-(--text-muted)" />
                    Mi perfil
                  </button>
                  <button
                    onClick={() => goTo('ajustes')}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-(--text-secondary) hover:text-(--text-primary) hover:bg-(--hover-bg) transition"
                  >
                    <Settings size={15} className="text-(--text-muted)" />
                    Configuración
                  </button>
                  <button
                    onClick={() => goTo('ajustes')}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-(--text-secondary) hover:text-(--text-primary) hover:bg-(--hover-bg) transition"
                  >
                    <Palette size={15} className="text-(--text-muted)" />
                    Apariencia
                  </button>
                </div>

                {/* Divider + logout */}
                <div className="border-t border-(--border) py-1.5">
                  <button
                    onClick={() => { logout(); setProfileOpen(false) }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-rose-400 hover:text-rose-300 hover:bg-rose-500/6 transition"
                  >
                    <LogOut size={15} />
                    Cerrar sesión
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  )
}
