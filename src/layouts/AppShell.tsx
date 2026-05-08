import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useUIStore } from '@/store/ui.store'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { MobileNav } from './MobileNav'

export function AppShell() {
  const { sidebarCollapsed, mobileMenuOpen, setMobileMenuOpen } = useUIStore()
  const isDesktop = useIsDesktop()
  const { pathname } = useLocation()

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

  const sidebarWidth = sidebarCollapsed ? 64 : 240

  return (
    <div className="min-h-dvh bg-[#09090E]">

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
              className="fixed left-0 top-0 bottom-0 z-50 w-72 lg:hidden bg-[#111118] border-r border-white/8"
            >
              <Sidebar />
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

        <main className="flex-1 pt-14 pb-16 lg:pb-0">
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
    </div>
  )
}
