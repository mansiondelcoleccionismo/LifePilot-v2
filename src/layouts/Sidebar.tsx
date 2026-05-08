import { NavLink, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight, Zap } from 'lucide-react'
import { useUIStore } from '@/store/ui.store'
import { NAV_GROUPS } from '@/lib/navigation'
import { useTasks } from '@/hooks/useTasks'

// ─── SidebarContent ───────────────────────────────────────────────────────────
// Renderiza los grupos de navegación. Exportado para usarlo también en el drawer
// móvil sin el className "hidden lg:flex" que oculta el Sidebar en pantallas pequeñas.
export function SidebarContent({ collapsed = false }: { collapsed?: boolean }) {
  const { pathname } = useLocation()
  const { pending } = useTasks()

  return (
    <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2">
      {NAV_GROUPS.map((group) => (
        <div key={group.id} className="mb-1">
          <AnimatePresence>
            {!collapsed && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="px-3 pt-3 pb-1.5 text-[10px] font-semibold tracking-widest uppercase text-white/25 select-none"
              >
                {group.label}
              </motion.p>
            )}
          </AnimatePresence>
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const Icon = item.icon
              const isActive = item.path === '/' ? pathname === '/' : pathname.startsWith(item.path)
              const badge = item.path === '/tareas' ? (pending > 0 ? String(pending) : undefined) : item.badge
              return (
                <NavLink
                  key={item.id}
                  to={item.path}
                  title={collapsed ? item.label : undefined}
                  className="relative flex items-center gap-3 rounded-[10px] px-3 py-2.5 transition-colors duration-150 hover:bg-white/6 group"
                  style={{ color: isActive ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.50)' }}
                >
                  {isActive && (
                    <motion.div
                      layoutId="sidebar-active"
                      className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-blue-500"
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  )}
                  <Icon
                    size={18}
                    strokeWidth={isActive ? 2 : 1.75}
                    className={isActive ? 'text-blue-400 shrink-0' : 'text-white/35 shrink-0'}
                  />
                  <AnimatePresence>
                    {!collapsed && (
                      <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="text-sm font-medium whitespace-nowrap flex-1"
                      >
                        {item.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                  {!collapsed && badge && (
                    <span className="ml-auto bg-blue-500/20 text-blue-400 text-[10px] font-semibold rounded-full px-1.5 py-0.5">
                      {badge}
                    </span>
                  )}
                  {collapsed && badge && (
                    <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-blue-400" />
                  )}
                </NavLink>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  )
}

// ─── Sidebar (desktop) ────────────────────────────────────────────────────────
export function Sidebar() {
  const { sidebarCollapsed, toggleSidebarCollapse } = useUIStore()

  return (
    <motion.aside
      animate={{ width: sidebarCollapsed ? 64 : 240 }}
      transition={{ duration: 0.28, ease: [0.25, 0.1, 0.25, 1] }}
      className="fixed left-0 top-0 bottom-0 z-30 hidden lg:flex flex-col h-dvh overflow-hidden bg-[#111118] border-r border-white/8"
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-white/8 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
          <Zap size={14} className="text-white fill-white" />
        </div>
        <AnimatePresence>
          {!sidebarCollapsed && (
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.15 }}
              className="flex flex-col leading-tight overflow-hidden"
            >
              <span className="text-sm font-semibold text-white/90 whitespace-nowrap">LifePilot</span>
              <span className="text-[10px] text-white/30 uppercase tracking-widest">v2.0</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <SidebarContent collapsed={sidebarCollapsed} />

      {/* Collapse button */}
      <div className="border-t border-white/8 px-2 py-3">
        <button
          onClick={toggleSidebarCollapse}
          className="w-full flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors"
        >
          {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          <AnimatePresence>
            {!sidebarCollapsed && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-xs font-medium whitespace-nowrap"
              >
                Contraer
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
    </motion.aside>
  )
}
