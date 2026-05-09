import { useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Search, Bell, Moon, Sun, Menu } from 'lucide-react'
import { useUIStore } from '@/store/ui.store'
import { ALL_NAV_ITEMS } from '@/lib/navigation'
import { useTasks } from '@/hooks/useTasks'
import { useTheme } from '@/hooks/useTheme'

function getPageInfo(pathname: string) {
  const emojis: Record<string, string> = {
    '/': '🏠', '/nutricion': '🥗', '/ejercicios': '💪',
    '/tareas': '✅', '/calendario': '📅', '/ocio': '🎬',
    '/kira': '👧', '/planes': '📍', '/aprender': '🧠',
    '/diario': '📝', '/ia': '✨', '/ajustes': '⚙️',
    '/medicacion': '💊', '/patrimonio': '📈',
  }
  if (pathname === '/') return { label: 'Inicio', emoji: '🏠' }
  const item = ALL_NAV_ITEMS.find((i) => i.path !== '/' && pathname.startsWith(i.path))
  return { label: item?.label ?? 'LifePilot', emoji: emojis[item?.path ?? ''] ?? '⚡' }
}

export function Topbar() {
  const { pathname } = useLocation()
  const { setMobileMenuOpen, sidebarCollapsed } = useUIStore()
  const { label, emoji } = getPageInfo(pathname)
  const { pending } = useTasks()
  const { isDark, toggle } = useTheme()

  return (
    <header
      className="fixed top-0 right-0 z-20 h-14 flex items-center px-4 gap-3 bg-[#09090E]/80 backdrop-blur-xl border-b border-white/8 transition-[left] duration-280"
      style={{ left: typeof window !== 'undefined' && window.innerWidth >= 1024 ? (sidebarCollapsed ? 64 : 240) : 0 }}
    >
      {/* Mobile menu button */}
      <button
        className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg text-white/50 hover:text-white/80 hover:bg-white/6 transition-colors"
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
          className="text-sm font-semibold text-white/80 truncate"
        >
          {label}
        </motion.h1>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        <button className="hidden md:flex items-center gap-2 h-8 px-3 rounded-lg bg-white/5 border border-white/8 text-white/35 hover:text-white/60 text-xs transition-colors">
          <Search size={13} />
          <span>Buscar</span>
          <kbd className="bg-white/8 px-1.5 py-0.5 rounded text-[10px] font-mono">⌘K</kbd>
        </button>
        <button
          onClick={toggle}
          title={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-white/40 hover:text-white/70 hover:bg-white/6 transition-colors"
        >
          {isDark ? <Sun size={15} /> : <Moon size={15} />}
        </button>
        <button className="relative w-8 h-8 flex items-center justify-center rounded-lg text-white/40 hover:text-white/70 hover:bg-white/6 transition-colors">
          <Bell size={15} />
          {pending > 0 ? (
            <span className="absolute -top-1 -right-1 min-w-4.5 h-4 rounded-full bg-red-500 text-[10px] font-semibold leading-4 text-white flex items-center justify-center px-1.5">
              {pending}
            </span>
          ) : (
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-blue-400" />
          )}
        </button>
        <div className="w-8 h-8 rounded-full bg-linear-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-xs font-semibold cursor-pointer ring-2 ring-white/8">
          D
        </div>
      </div>
    </header>
  )
}
