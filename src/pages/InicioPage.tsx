import { motion } from 'framer-motion'
import { Sparkles, CheckSquare, TrendingUp, Flame } from 'lucide-react'

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
}
const item = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.28 } },
}

function Card({ children, className = '' }: { children: React.ReactNode, className?: string }) {
  return (
    <motion.div variants={item} className={`rounded-2xl bg-[#1E1E28] border border-white/[0.08] p-5 ${className}`}>
      {children}
    </motion.div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-semibold tracking-widest uppercase text-white/25 mb-2">{children}</p>
}

export function InicioPage() {
  const today = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="px-4 py-6 md:px-6 lg:px-8 max-w-5xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <p className="text-white/35 text-sm capitalize">{today}</p>
        <h1 className="text-3xl font-bold text-white/90 mt-1">Buenos días, Daniel.</h1>
      </motion.div>

      <motion.div variants={stagger} initial="hidden" animate="visible" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

        <Card className="lg:col-span-3 bg-gradient-to-br from-blue-950/60 to-[#1E1E28] border-blue-900/30 flex gap-4">
          <div className="w-9 h-9 rounded-xl bg-blue-500/15 flex items-center justify-center flex-shrink-0">
            <Sparkles size={18} className="text-blue-400" />
          </div>
          <div>
            <Label>Briefing IA · Hoy</Label>
            <p className="text-sm text-white/55 leading-relaxed">
              Tienes <span className="text-white/85 font-medium">3 tareas pendientes</span> y entrenamiento de{' '}
              <span className="text-white/85 font-medium">piernas</span> programado. Streak:{' '}
              <span className="text-emerald-400 font-semibold">12 🔥</span>. Hoy es un buen día para rendir.
            </p>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Flame size={14} className="text-orange-400" />
            <Label>Macros · Hoy</Label>
            <span className="ml-auto text-[11px] text-white/25">1840 / 2200 kcal</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden mb-4">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: '84%' }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Proteína', value: '142g', color: 'text-blue-400' },
              { label: 'Carbos', value: '180g', color: 'text-amber-400' },
              { label: 'Grasa', value: '68g', color: 'text-rose-400' },
            ].map((m) => (
              <div key={m.label} className="bg-white/[0.04] rounded-xl p-3 text-center">
                <p className={`text-base font-semibold ${m.color}`}>{m.value}</p>
                <p className="text-[10px] text-white/30 mt-0.5">{m.label}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-2 mb-3">
            <CheckSquare size={14} className="text-emerald-400" />
            <Label>Tareas de hoy</Label>
            <span className="ml-auto text-[11px] text-white/25">2 / 5</span>
          </div>
          <div className="space-y-2">
            {[
              { label: 'Llamar al médico', done: true },
              { label: 'Revisar inversiones', done: true },
              { label: 'Enviar email trabajo', done: false },
              { label: 'Comprar proteína', done: false },
            ].map((t, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${t.done ? 'bg-emerald-500/20' : 'border border-white/15'}`}>
                  {t.done && <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                </div>
                <span className={`text-sm ${t.done ? 'line-through text-white/25' : 'text-white/60'}`}>{t.label}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={14} className="text-violet-400" />
            <Label>Métricas</Label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Peso', value: '78.4 kg', delta: '-0.3', pos: true },
              { label: 'Sueño', value: '7h 20m', delta: '+20m', pos: true },
              { label: 'Pasos', value: '8,240', delta: '-1.2k', pos: false },
              { label: 'Streak', value: '12 días', delta: '+1', pos: true },
            ].map((s) => (
              <div key={s.label} className="bg-white/[0.04] rounded-xl p-3">
                <p className="text-[10px] text-white/30 mb-1">{s.label}</p>
                <p className="text-sm font-semibold text-white/80">{s.value}</p>
                <p className={`text-[10px] font-medium mt-0.5 ${s.pos ? 'text-emerald-400' : 'text-rose-400'}`}>{s.delta}</p>
              </div>
            ))}
          </div>
        </Card>

      </motion.div>
    </div>
  )
}