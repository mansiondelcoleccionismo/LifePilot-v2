import { motion } from 'framer-motion'
import { LogOut, CheckCircle } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import { useGoogleAuth } from '@/hooks/useGoogleAuth'

export function PerfilPage() {
  const { user, logout } = useAuthStore()
  const { loginWithGoogle } = useGoogleAuth()

  const name      = user?.name    ?? ''
  const email     = user?.email   ?? ''
  const picture   = user?.picture ?? ''
  const initial   = name ? name.charAt(0).toUpperCase() : '?'

  return (
    <div className="px-4 py-6 md:px-6 lg:px-8 max-w-4xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <p className="text-sm text-white/35">Cuenta · Identidad</p>
        <h1 className="text-3xl font-bold text-white/90 mt-1">Mi Perfil</h1>
      </motion.div>

      <div className="rounded-3xl border border-white/8 bg-[#1E1E28] p-8 flex flex-col items-center gap-5">
        {/* Avatar */}
        <div className="w-24 h-24 rounded-full ring-4 ring-white/10 overflow-hidden shrink-0">
          {picture
            ? <img src={picture} alt={name} className="w-full h-full object-cover" />
            : (
              <div className="w-full h-full bg-linear-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-3xl font-semibold">
                {initial}
              </div>
            )
          }
        </div>

        {/* Name + email */}
        <div className="text-center">
          <p className="text-xl font-semibold text-white/90">{name || '—'}</p>
          <p className="text-sm text-white/40 mt-0.5">{email || '—'}</p>
        </div>

        {/* Google status */}
        {user ? (
          <div className="flex flex-col items-center gap-3 w-full max-w-xs">
            <div className="flex items-center gap-2 w-full rounded-2xl bg-emerald-500/8 border border-emerald-500/20 px-4 py-3">
              <CheckCircle size={15} className="text-emerald-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-emerald-300">Conectado con Google</p>
                <p className="text-xs text-white/40 truncate">{email}</p>
              </div>
            </div>
            <button
              onClick={logout}
              className="flex items-center gap-2 w-full justify-center rounded-2xl bg-rose-500/8 border border-rose-500/20 px-4 py-3 text-sm text-rose-400 hover:bg-rose-500/12 hover:text-rose-300 transition"
            >
              <LogOut size={14} />
              Cerrar sesión
            </button>
          </div>
        ) : (
          <button
            onClick={() => loginWithGoogle()}
            className="rounded-2xl bg-blue-600 hover:bg-blue-500 px-6 py-3 text-sm font-semibold text-white transition"
          >
            Conectar con Google
          </button>
        )}
      </div>
    </div>
  )
}
