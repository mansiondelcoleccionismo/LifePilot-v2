import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Zap, X } from 'lucide-react'
import { useUIStore } from '@/store/ui.store'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import { Sidebar, SidebarContent } from './Sidebar'
import { Topbar } from './Topbar'
import { MobileNav } from './MobileNav'
import { WeeklyReport } from '@/components/WeeklyReport'

export function AppShell() {
  const { sidebarCollapsed, mobileMenuOpen, setMobileMenuOpen } = useUIStore()
  const isDesktop = useIsDesktop()
  const { pathname } = useLocation()

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

  useEffect(() => {
    document.body.style.overscrollBehavior = 'none'
    return () => { document.body.style.overscrollBehavior = '' }
  }, [])

  const sidebarWidth = sidebarCollapsed ? 64 : 240

  return (
    <div className="min-h-dvh bg-(--bg-base) overscroll-none touch-manipulation">

      {/* Sidebar desktop */}
      <Sidebar />

      {/* Drawer móvil */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
              onClick={() => setMobileMenuOpen(false)}
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 340, damping: 32 }}
              className="fixed left-0 top-0 bottom-0 z-50 w-72 lg:hidden bg-(--bg-card) border-r border-(--border) flex flex-col"
            >
              {/* Header del drawer móvil */}
              <div className="flex items-center justify-between px-4 h-14 border-b border-(--border) shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
                    <Zap size={14} className="text-white fill-white" />
                  </div>
                  <div className="flex flex-col leading-tight">
                    <span className="text-sm font-semibold text-(--text-primary)">LifePilot</span>
                    <span className="text-[10px] text-(--text-muted) uppercase tracking-widest">v2.0</span>
                  </div>
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-8 h-8 rounded-xl bg-(--hover-bg) hover:bg-(--active-bg) flex items-center justify-center transition"
                >
                  <X size={16} className="text-(--text-secondary)" />
                </button>
              </div>

              {/* Nav items — SidebarContent nunca tiene "hidden lg:flex" */}
              <SidebarContent />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Contenido principal */}
      <div
        className="flex flex-col min-h-dvh transition-[padding-left] duration-280"
        style={{ paddingLeft: isDesktop ? sidebarWidth : 0 }}
      >
        <Topbar />

        <main className="flex-1 pt-14 pb-24 lg:pb-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.22 }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Nav móvil */}
      <MobileNav />

      {/* Informe semanal — se abre automáticamente los domingos */}
      <WeeklyReport />
    </div>
  )
}
