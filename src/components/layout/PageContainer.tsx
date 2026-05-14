import type { ReactNode } from 'react'
import { motion } from 'framer-motion'

interface PageHeaderProps {
  breadcrumb?: string
  title: string
  subtitle?: ReactNode
  icon?: string
  actions?: ReactNode
}

export function PageHeader({ breadcrumb, title, subtitle, icon, actions }: PageHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start justify-between mb-6"
    >
      <div>
        {breadcrumb && (
          <p className="text-xs text-white/30 font-medium tracking-wide mb-1">{breadcrumb}</p>
        )}
        <h1 className="text-2xl md:text-3xl font-bold text-white/90 flex items-center gap-3">
          {icon && <span className="text-2xl">{icon}</span>}
          {title}
        </h1>
        {subtitle && <p className="text-sm text-white/40 mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </motion.div>
  )
}

interface PageContainerProps {
  children: ReactNode
  maxWidth?: string
  className?: string
}

export function PageContainer({
  children,
  maxWidth = 'max-w-5xl',
  className = '',
}: PageContainerProps) {
  return (
    <div className={`px-4 py-6 md:px-6 lg:px-8 ${maxWidth} mx-auto pb-28 ${className}`}>
      {children}
    </div>
  )
}
