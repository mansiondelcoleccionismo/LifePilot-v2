import { NavLink, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { MOBILE_NAV_ITEMS } from '@/lib/navigation'

export function MobileNav() {
  const { pathname } = useLocation()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 flex lg:hidden h-16 bg-(--bg-mobilenav) backdrop-blur-2xl border-t border-(--border)">
      {MOBILE_NAV_ITEMS.map((item) => {
        const Icon = item.icon
        const isActive = item.path === '/' ? pathname === '/' : pathname.startsWith(item.path)

        return (
          <NavLink
            key={item.id}
            to={item.path}
            className="relative flex flex-col items-center justify-center gap-1 flex-1 h-full"
          >
            {isActive && (
              <motion.div
                layoutId="mobile-active"
                className="absolute top-2 inset-x-2 h-9 rounded-[10px] bg-(--active-bg)"
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              />
            )}
            <div className={`relative z-10 ${isActive ? 'text-blue-400' : 'text-(--text-muted)'}`}>
              <Icon size={20} strokeWidth={isActive ? 2.1 : 1.7} />
              {item.badge && (
                <span className="absolute -top-1 -right-2 w-3.5 h-3.5 rounded-full bg-blue-500 text-[8px] font-bold text-white flex items-center justify-center">
                  {item.badge}
                </span>
              )}
            </div>
            <span className={`text-[10px] font-medium relative z-10 ${isActive ? 'text-blue-300 font-semibold' : 'text-(--text-muted)'}`}>
              {item.label}
            </span>
          </NavLink>
        )
      })}
    </nav>
  )
}
