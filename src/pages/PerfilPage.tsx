import { motion } from 'framer-motion'
import { User } from 'lucide-react'
import { useUserStore } from '@/store/userStore'

export function PerfilPage() {
  const { name, email } = useUserStore()
  return (
    <div className="px-4 py-6 md:px-6 lg:px-8 max-w-4xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <p className="text-sm text-white/35">Cuenta · Identidad</p>
        <h1 className="text-3xl font-bold text-white/90 mt-1">Mi Perfil</h1>
      </motion.div>
      <div className="rounded-3xl border border-white/8 bg-[#1E1E28] p-8 flex flex-col items-center gap-4">
        <div className="w-20 h-20 rounded-full bg-linear-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-3xl font-semibold ring-4 ring-white/8">
          {name.charAt(0).toUpperCase()}
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold text-white/90">{name}</p>
          <p className="text-sm text-white/40 mt-0.5">{email}</p>
        </div>
        <div className="flex items-center gap-2 mt-2 rounded-xl bg-white/4 border border-white/8 px-4 py-2.5 text-sm text-white/40">
          <User size={14} />
          Conexión con Firebase Auth — próximamente
        </div>
      </div>
    </div>
  )
}
