import { motion } from 'framer-motion'
import { Zap, Shield, Calendar, CheckSquare } from 'lucide-react'
import { useGoogleAuth } from '@/hooks/useGoogleAuth'

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  )
}

const FEATURES = [
  { icon: Calendar,    label: 'Google Calendar sincronizado' },
  { icon: CheckSquare, label: 'Google Tasks integradas' },
  { icon: Shield,      label: 'Solo tú accedes a tus datos' },
]

export function LoginPage() {
  const { loginWithGoogle } = useGoogleAuth()

  return (
    <div className="min-h-dvh bg-[#09090E] flex items-center justify-center px-6">
      {/* Background glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full bg-blue-600/8 blur-3xl" />
        <div className="absolute bottom-1/3 right-1/4 w-64 h-64 rounded-full bg-violet-600/8 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="w-full max-w-sm flex flex-col items-center gap-8"
      >
        {/* Logo */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="w-20 h-20 rounded-3xl bg-blue-600 flex items-center justify-center shadow-2xl shadow-blue-900/50">
            <Zap size={36} className="text-white fill-white" />
          </div>
          <div className="text-center">
            <h1 className="text-3xl font-bold text-white/95 tracking-tight">LifePilot</h1>
            <p className="text-white/40 mt-1.5 text-sm">Tu sistema operativo personal</p>
          </div>
        </motion.div>

        {/* Features */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.4 }}
          className="w-full space-y-3"
        >
          {FEATURES.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/4 border border-white/6">
              <div className="w-8 h-8 rounded-xl bg-blue-500/15 flex items-center justify-center shrink-0">
                <Icon size={15} className="text-blue-400" />
              </div>
              <span className="text-sm text-white/65">{label}</span>
            </div>
          ))}
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.4 }}
          className="w-full flex flex-col items-center gap-4"
        >
          <button
            onClick={() => loginWithGoogle()}
            className="w-full flex items-center justify-center gap-3 h-13 rounded-2xl bg-white text-gray-800 font-semibold text-sm hover:bg-gray-50 active:bg-gray-100 transition-colors shadow-lg shadow-black/30"
          >
            <GoogleIcon />
            Continuar con Google
          </button>

          <p className="text-[11px] text-white/25 text-center leading-relaxed">
            Solo tú tienes acceso a tus datos.
            <br />No compartimos información con terceros.
          </p>
        </motion.div>
      </motion.div>
    </div>
  )
}
