import { useEffect, useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { User, Key, Apple, Palette, Database, Save, Download, Loader2, Bell, Activity, Eye, EyeOff, Film, LogOut, RefreshCw } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import { useGoogleAuth } from '@/hooks/useGoogleAuth'
import { DAY_TARGETS, type DayType, type MacroTarget } from '@/types/nutrition'
import { getActiveKeyInfo, testGeminiKey, testGroqKey, clearCooldowns } from '@/services/ai.service'
import {
  loadProfile,
  saveProfile as persistMetabolicProfile,
  calcBMR, calcTDEE, calcIMC, calcIdealWeight, calcAge,
} from '@/services/metabolic.service'
import type { UserProfile, ActivityLevel, Goal } from '@/types/profile'
import {
  type NotificationSettings,
  type Reminder,
  loadNotificationSettings,
  saveNotificationSettings,
  requestPermission,
} from '@/services/notifications.service'

interface AIKeyConfig {
  id: string
  label: string
  provider: 'Gemini' | 'Groq'
  index: number
  storageKey: string
  placeholder: string
  link: string
  isGemini: boolean
}

const AI_KEY_CONFIGS: AIKeyConfig[] = [
  { id: 'gemini_1', label: 'Gemini — Key 1', provider: 'Gemini', index: 1, storageKey: 'lifepilot_gemini_key_1', placeholder: 'AIza...', link: 'https://aistudio.google.com/apikey', isGemini: true },
  { id: 'gemini_2', label: 'Gemini — Key 2', provider: 'Gemini', index: 2, storageKey: 'lifepilot_gemini_key_2', placeholder: 'AIza...', link: 'https://aistudio.google.com/apikey', isGemini: true },
  { id: 'gemini_3', label: 'Gemini — Key 3', provider: 'Gemini', index: 3, storageKey: 'lifepilot_gemini_key_3', placeholder: 'AIza...', link: 'https://aistudio.google.com/apikey', isGemini: true },
  { id: 'groq_1',   label: 'Groq — Key 1',   provider: 'Groq',   index: 1, storageKey: 'lifepilot_groq_key_1',   placeholder: 'gsk_...', link: 'https://console.groq.com/keys',       isGemini: false },
  { id: 'groq_2',   label: 'Groq — Key 2',   provider: 'Groq',   index: 2, storageKey: 'lifepilot_groq_key_2',   placeholder: 'gsk_...', link: 'https://console.groq.com/keys',       isGemini: false },
  { id: 'groq_3',   label: 'Groq — Key 3',   provider: 'Groq',   index: 3, storageKey: 'lifepilot_groq_key_3',   placeholder: 'gsk_...', link: 'https://console.groq.com/keys',       isGemini: false },
  { id: 'groq_4',   label: 'Groq — Key 4',   provider: 'Groq',   index: 4, storageKey: 'lifepilot_groq_key_4',   placeholder: 'gsk_...', link: 'https://console.groq.com/keys',       isGemini: false },
]

type GoalType = 'perder' | 'mantener' | 'ganar'
type ThemeType = 'oscuro' | 'claro' | 'sistema'

interface ProfileData {
  name: string
  weight: string
  height: string
  goal: GoalType
}

type CustomMacros = {
  [key in DayType]: MacroTarget
}

const STORAGE_KEYS = {
  profile: 'lifepilot_profile',
  customMacros: 'lifepilot_custom_macros',
  theme: 'lifepilot_theme',
}

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

const REMINDER_META: Record<string, { label: string; emoji: string; description: string }> = {
  metrics:     { label: 'Métricas semanales',  emoji: '⚖️', description: 'Recordatorio para registrar peso y medidas' },
  med_morning: { label: 'Medicación mañana',   emoji: '💊', description: 'Recordatorio de medicación matutina' },
  med_night:   { label: 'Medicación noche',    emoji: '💊', description: 'Recordatorio de medicación nocturna' },
  diary:       { label: 'Diario del día',       emoji: '📝', description: 'Recordatorio para registrar tu estado de ánimo' },
  kira:             { label: 'Tiempo con Kira',           emoji: '👧', description: 'Aviso 15 min antes de llegar a casa' },
  padel_lunes:      { label: 'Reserva pádel lunes',      emoji: '🎾', description: 'Dom 11:00 — reservar pista para el lunes' },
  padel_miercoles:  { label: 'Reserva pádel miércoles',  emoji: '🎾', description: 'Mar 9:45 — reservar pista para el miércoles' },
}

function toTimeStr(h: number, m: number) {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function fromTimeStr(s: string): { hour: number; minute: number } {
  const [h, m] = s.split(':').map(Number)
  return { hour: h ?? 0, minute: m ?? 0 }
}

const defaultProfile: ProfileData = {
  name: '',
  weight: '',
  height: '',
  goal: 'mantener',
}

const defaultMacros: CustomMacros = { ...DAY_TARGETS }

export function AjustesPage() {
  const [profile, setProfile] = useState<ProfileData>(defaultProfile)
  const [aiKeyValues, setAiKeyValues] = useState<Record<string, string>>({})
  const [testStates, setTestStates] = useState<Record<string, 'idle' | 'testing' | 'ok' | string>>({})
  const [testErrors, setTestErrors] = useState<Record<string, string>>({})
  const [activeKeyInfo, setActiveKeyInfo] = useState<{ provider: string; index: number } | null>(null)
  const [tmdbKey, setTmdbKey] = useState('')
  const [tmdbKeyVisible, setTmdbKeyVisible] = useState(false)
  const [tmdbTestState, setTmdbTestState] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')
  const [notifSettings, setNotifSettings] = useState<NotificationSettings>(() => loadNotificationSettings())
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(
    'Notification' in window ? Notification.permission : 'denied',
  )
  const notifSupported = 'Notification' in window
  const [customMacros, setCustomMacros] = useState<CustomMacros>(defaultMacros)
  const [theme, setTheme] = useState<ThemeType>('oscuro')
  const [feedback, setFeedback] = useState('')
  const [metabolicProfile, setMetabolicProfile] = useState<UserProfile>(() => loadProfile())

  useEffect(() => {
    // Load profile
    const savedProfile = localStorage.getItem(STORAGE_KEYS.profile)
    if (savedProfile) {
      try {
        setProfile(JSON.parse(savedProfile))
      } catch (e) {
        console.error('Error loading profile:', e)
      }
    }

    // Migrate legacy single Groq key → slot 1
    const legacyGroq = localStorage.getItem('lifepilot_groq_key')?.trim()
    if (legacyGroq && !localStorage.getItem('lifepilot_groq_key_1')?.trim()) {
      localStorage.setItem('lifepilot_groq_key_1', legacyGroq)
    }

    // Load AI keys
    const keys: Record<string, string> = {}
    AI_KEY_CONFIGS.forEach(cfg => { keys[cfg.id] = localStorage.getItem(cfg.storageKey)?.trim() ?? '' })
    setAiKeyValues(keys)
    setActiveKeyInfo(getActiveKeyInfo())

    // Load TMDB key
    setTmdbKey(localStorage.getItem('lifepilot_tmdb_key')?.trim() ?? '')

    // Load custom macros
    const savedMacros = localStorage.getItem(STORAGE_KEYS.customMacros)
    if (savedMacros) {
      try {
        setCustomMacros(JSON.parse(savedMacros))
      } catch (e) {
        console.error('Error loading custom macros:', e)
      }
    }

    // Load theme
    const savedTheme = (localStorage.getItem(STORAGE_KEYS.theme) as ThemeType) || 'oscuro'
    setTheme(savedTheme)
  }, [])

  const saveProfile = () => {
    localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(profile))
    setFeedback('Perfil guardado correctamente')
    setTimeout(() => setFeedback(''), 2400)
  }

  const saveMetabolicProfile = () => {
    persistMetabolicProfile(metabolicProfile)
    setFeedback('Perfil metabólico guardado')
    setTimeout(() => setFeedback(''), 2400)
  }

  const bmr  = useMemo(() => calcBMR(metabolicProfile),         [metabolicProfile])
  const tdee = useMemo(() => calcTDEE(metabolicProfile),        [metabolicProfile])
  const imc  = useMemo(() => calcIMC(metabolicProfile),         [metabolicProfile])
  const idealW = useMemo(() => calcIdealWeight(metabolicProfile), [metabolicProfile])
  const age  = useMemo(() => calcAge(metabolicProfile.birthDate), [metabolicProfile])

  function toggleDay(field: 'padelDays' | 'trainingDays', day: number) {
    setMetabolicProfile(prev => {
      const arr = prev[field]
      return {
        ...prev,
        [field]: arr.includes(day) ? arr.filter(d => d !== day) : [...arr, day].sort(),
      }
    })
  }

  const saveAiKey = (id: string, storageKey: string) => {
    const value = (aiKeyValues[id] ?? '').trim()
    localStorage.setItem(storageKey, value)
    // Keep legacy single-slot keys in sync for backward compat
    if (storageKey === 'lifepilot_gemini_key_1') localStorage.setItem('lifepilot_gemini_key', value)
    if (storageKey === 'lifepilot_groq_key_1')   localStorage.setItem('lifepilot_groq_key', value)
    setActiveKeyInfo(getActiveKeyInfo())
    setFeedback('API key guardada')
    setTimeout(() => setFeedback(''), 2400)
  }

  const testAiKey = async (cfg: AIKeyConfig) => {
    const value = (aiKeyValues[cfg.id] ?? '').trim()
    if (!value) return
    setTestStates(prev => ({ ...prev, [cfg.id]: 'testing' }))
    setTestErrors(prev => ({ ...prev, [cfg.id]: '' }))
    const err = cfg.isGemini ? await testGeminiKey(value) : await testGroqKey(value)
    if (err === null) {
      setTestStates(prev => ({ ...prev, [cfg.id]: 'ok' }))
    } else {
      setTestStates(prev => ({ ...prev, [cfg.id]: 'fail' }))
      setTestErrors(prev => ({ ...prev, [cfg.id]: err }))
    }
    setTimeout(() => setTestStates(prev => ({ ...prev, [cfg.id]: 'idle' })), 6000)
  }

  const handleSaveTmdbKey = () => {
    localStorage.setItem('lifepilot_tmdb_key', tmdbKey.trim())
    setFeedback('TMDB API key guardada')
    setTimeout(() => setFeedback(''), 2400)
  }

  const handleTestTmdbKey = async () => {
    const key = tmdbKey.trim()
    if (!key) return
    setTmdbTestState('testing')
    try {
      const res = await fetch(`https://api.themoviedb.org/3/configuration?api_key=${key}`)
      setTmdbTestState(res.ok ? 'ok' : 'fail')
    } catch {
      setTmdbTestState('fail')
    }
    setTimeout(() => setTmdbTestState('idle'), 6000)
  }

  const updateReminder = (id: string, patch: Partial<Reminder>) => {
    setNotifSettings(prev => {
      const updated: NotificationSettings = {
        reminders: prev.reminders.map(r => r.id === id ? { ...r, ...patch } : r),
      }
      saveNotificationSettings(updated)
      return updated
    })
  }

  const handleRequestPermission = async () => {
    const result = await requestPermission()
    setNotifPermission(result)
    if (result === 'granted') {
      saveNotificationSettings(notifSettings)
      setFeedback('Notificaciones activadas')
      setTimeout(() => setFeedback(''), 2400)
    }
  }

  const saveMacros = () => {
    localStorage.setItem(STORAGE_KEYS.customMacros, JSON.stringify(customMacros))
    setFeedback('Macros personalizadas guardadas')
    setTimeout(() => setFeedback(''), 2400)
  }

  const saveTheme = (newTheme: ThemeType) => {
    setTheme(newTheme)
    localStorage.setItem(STORAGE_KEYS.theme, newTheme)
    setFeedback('Tema guardado correctamente')
    setTimeout(() => setFeedback(''), 2400)
  }

  const exportData = () => {
    const data = {
      profile,
      aiKeys: AI_KEY_CONFIGS.map(cfg => ({ id: cfg.id, configured: Boolean(aiKeyValues[cfg.id]) })),
      customMacros,
      theme,
      exportDate: new Date().toISOString(),
    }

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `lifepilot-backup-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    setFeedback('Datos exportados correctamente')
    setTimeout(() => setFeedback(''), 2400)
  }

  const updateMacro = (dayType: DayType, field: keyof MacroTarget, value: string) => {
    const numValue = Number(value)
    if (Number.isNaN(numValue)) return

    setCustomMacros(prev => ({
      ...prev,
      [dayType]: {
        ...prev[dayType],
        [field]: numValue,
      },
    }))
  }

  const resetMacros = () => {
    setCustomMacros({ ...DAY_TARGETS })
  }

  const { user, logout } = useAuthStore()
  const { loginWithGoogle } = useGoogleAuth()

  return (
    <div className="px-4 py-6 md:px-6 lg:px-8 max-w-4xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-white/35">Configuración · Personalización</p>
            <h1 className="text-3xl font-bold text-white/90 mt-1">Ajustes</h1>
          </div>
          {feedback && (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
              {feedback}
            </div>
          )}
        </div>
      </motion.div>

      <div className="space-y-6">
        {/* Cuenta Google */}
        <section className="rounded-3xl border border-white/8 bg-[#1E1E28] p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/10 flex items-center justify-center">
              <User size={20} className="text-blue-300" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-white/25">Cuenta</p>
              <h2 className="text-lg font-semibold text-white/90 mt-1">Google</h2>
            </div>
          </div>

          {user ? (
            <div className="flex items-center gap-4">
              <img src={user.picture} alt={user.name} className="w-14 h-14 rounded-2xl object-cover ring-2 ring-white/10" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-white/90 truncate">{user.name}</p>
                <p className="text-sm text-white/40 truncate">{user.email}</p>
                <p className="text-xs text-emerald-400/70 mt-1">● Conectado · Calendar y Tasks activos</p>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => loginWithGoogle()}
                  className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition px-3 py-1.5 rounded-xl bg-white/5 border border-white/8"
                >
                  <RefreshCw size={11} /> Reconectar
                </button>
                <button
                  onClick={logout}
                  className="flex items-center gap-1.5 text-xs text-rose-400 hover:text-rose-300 transition px-3 py-1.5 rounded-xl bg-rose-500/6 border border-rose-500/15"
                >
                  <LogOut size={11} /> Cerrar sesión
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/8 flex items-center justify-center">
                <User size={20} className="text-white/25" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-white/50">No conectado</p>
                <p className="text-xs text-white/30 mt-0.5">Inicia sesión para sincronizar calendario y tareas</p>
              </div>
              <button
                onClick={() => loginWithGoogle()}
                className="text-sm font-medium text-blue-400 hover:text-blue-300 transition px-4 py-2 rounded-xl bg-blue-500/10 border border-blue-500/20"
              >
                Conectar
              </button>
            </div>
          )}
        </section>
        {/* Perfil metabólico */}
        <section className="rounded-3xl border border-white/8 bg-[#1E1E28] p-5">
          <div className="mb-5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/10 flex items-center justify-center">
              <Activity size={20} className="text-blue-300" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-white/25">Perfil metabólico</p>
              <h2 className="text-lg font-semibold text-white/90 mt-1">Datos personales y actividad</h2>
            </div>
          </div>

          {/* Calculated stats */}
          <div className="grid grid-cols-4 gap-2 mb-5">
            {[
              { label: 'Edad',    value: `${age} años`      },
              { label: 'BMR',     value: `${bmr} kcal`      },
              { label: 'TDEE',    value: `${tdee} kcal`     },
              { label: 'IMC',     value: `${imc}`           },
            ].map(s => (
              <div key={s.label} className="rounded-2xl bg-white/4 border border-white/6 p-3 text-center">
                <p className="text-[10px] text-white/30 mb-1">{s.label}</p>
                <p className="text-sm font-semibold text-white/80">{s.value}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Nombre</label>
              <input
                value={metabolicProfile.name}
                onChange={(e) => setMetabolicProfile(prev => ({ ...prev, name: e.target.value }))}
                className="mt-2 w-full rounded-2xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none"
                placeholder="Tu nombre"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Fecha de nacimiento</label>
              <input
                type="date"
                value={metabolicProfile.birthDate}
                onChange={(e) => setMetabolicProfile(prev => ({ ...prev, birthDate: e.target.value }))}
                className="mt-2 w-full rounded-2xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none scheme-dark"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Peso actual (kg)</label>
              <input
                value={metabolicProfile.weight}
                onChange={(e) => {
                  const v = parseFloat(e.target.value)
                  if (!isNaN(v)) setMetabolicProfile(prev => ({ ...prev, weight: v }))
                  else if (e.target.value === '') setMetabolicProfile(prev => ({ ...prev, weight: 0 }))
                }}
                inputMode="decimal"
                className="mt-2 w-full rounded-2xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none"
                placeholder="75"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Altura (cm)</label>
              <input
                value={metabolicProfile.height}
                onChange={(e) => {
                  const v = parseInt(e.target.value)
                  if (!isNaN(v)) setMetabolicProfile(prev => ({ ...prev, height: v }))
                }}
                inputMode="numeric"
                className="mt-2 w-full rounded-2xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none"
                placeholder="178"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Nivel de actividad base</label>
              <select
                value={metabolicProfile.activityLevel}
                onChange={(e) => setMetabolicProfile(prev => ({ ...prev, activityLevel: e.target.value as ActivityLevel }))}
                className="mt-2 w-full rounded-2xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none"
              >
                <option value="sedentary">Sedentario</option>
                <option value="light">Ligera actividad</option>
                <option value="moderate">Actividad moderada</option>
                <option value="active">Muy activo</option>
                <option value="very_active">Extremadamente activo</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Objetivo</label>
              <select
                value={metabolicProfile.goal}
                onChange={(e) => setMetabolicProfile(prev => ({ ...prev, goal: e.target.value as Goal }))}
                className="mt-2 w-full rounded-2xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none"
              >
                <option value="recomposicion">Recomposición corporal</option>
                <option value="deficit">Pérdida de grasa</option>
                <option value="volumen">Ganancia muscular</option>
                <option value="mantenimiento">Mantenimiento</option>
              </select>
            </div>
          </div>

          {/* Day pickers */}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {(['padelDays', 'trainingDays'] as const).map(field => (
              <div key={field}>
                <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">
                  {field === 'padelDays' ? 'Días de pádel' : 'Días de entreno (pesas)'}
                </label>
                <div className="mt-2 flex gap-1.5 flex-wrap">
                  {['D', 'L', 'M', 'X', 'J', 'V', 'S'].map((d, i) => (
                    <button
                      key={i}
                      onClick={() => toggleDay(field, i)}
                      className={`w-9 h-9 rounded-xl text-xs font-semibold transition ${
                        metabolicProfile[field].includes(i)
                          ? field === 'padelDays'
                            ? 'bg-cyan-500/25 border border-cyan-500/40 text-cyan-300'
                            : 'bg-emerald-500/25 border border-emerald-500/40 text-emerald-300'
                          : 'bg-white/4 border border-white/8 text-white/40 hover:border-white/14'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={saveMetabolicProfile}
              className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500"
            >
              <Save size={16} /> Guardar perfil
            </button>
            <p className="text-xs text-white/30">Peso ideal ≈ {idealW} kg (IMC 22)</p>
          </div>
        </section>

        {/* IA */}
        <section className="rounded-3xl border border-white/8 bg-[#1E1E28] p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
              <Key size={20} className="text-emerald-300" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-white/25">IA · Rotación automática</p>
              <h2 className="text-lg font-semibold text-white/90 mt-1">API Keys de IA</h2>
            </div>
          </div>

          <p className="text-xs text-white/35 mb-5 leading-relaxed">
            Configura hasta 3 claves de Gemini y 4 de Groq. La app rota automáticamente entre ellas cuando una tiene rate limit (cooldown de 60s).
          </p>

          <div className="space-y-3">
            {AI_KEY_CONFIGS.map((cfg) => {
              const isActive = activeKeyInfo?.provider === cfg.provider && activeKeyInfo?.index === cfg.index
              const ts = testStates[cfg.id] ?? 'idle'
              return (
                <div key={cfg.id} className="rounded-2xl border border-white/8 bg-white/3 p-4">
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-white/70">{cfg.label}</span>
                      {isActive && (
                        <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full font-semibold">
                          ACTIVA
                        </span>
                      )}
                    </div>
                    <a
                      href={cfg.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-blue-400/50 hover:text-blue-400 transition"
                    >
                      Obtener →
                    </a>
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={aiKeyValues[cfg.id] ?? ''}
                      onChange={(e) => setAiKeyValues(prev => ({ ...prev, [cfg.id]: e.target.value }))}
                      type="password"
                      placeholder={cfg.placeholder}
                      className="flex-1 rounded-xl bg-white/5 border border-white/8 px-3 py-2.5 text-sm text-white/80 focus:outline-none min-w-0"
                    />
                    <button
                      onClick={() => saveAiKey(cfg.id, cfg.storageKey)}
                      className="rounded-xl bg-emerald-500/15 border border-emerald-500/20 px-3 py-2.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/25 transition shrink-0"
                    >
                      Guardar
                    </button>
                    <button
                      onClick={() => testAiKey(cfg)}
                      disabled={ts === 'testing' || !aiKeyValues[cfg.id]?.trim()}
                      className="rounded-xl bg-white/5 border border-white/8 px-3 py-2.5 text-xs text-white/50 hover:text-white/80 transition shrink-0 disabled:opacity-40 w-16 flex items-center justify-center"
                    >
                      {ts === 'testing' ? <Loader2 size={13} className="animate-spin" /> :
                       ts === 'ok' ? '✅' :
                       ts === 'fail' ? '❌' : 'Probar'}
                    </button>
                  </div>
                  {ts === 'ok' && (
                    <p className="text-[11px] text-emerald-400 mt-1.5">Conexión correcta</p>
                  )}
                  {ts === 'fail' && testErrors[cfg.id] && (
                    <p className="text-[11px] text-rose-400 mt-1.5 leading-snug">{testErrors[cfg.id]}</p>
                  )}
                </div>
              )
            })}
          </div>

          <button
            onClick={() => {
              clearCooldowns()
              setActiveKeyInfo(getActiveKeyInfo())
              setFeedback('Cooldowns de IA reiniciados')
              setTimeout(() => setFeedback(''), 2400)
            }}
            className="mt-4 text-xs text-white/25 hover:text-white/50 transition"
          >
            Reiniciar cooldowns
          </button>
        </section>

        {/* TMDB */}
        <section className="rounded-3xl border border-white/8 bg-[#1E1E28] p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/10 flex items-center justify-center">
              <Film size={20} className="text-blue-300" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-[0.3em] text-white/25">APIs externas</p>
              <div className="flex items-center gap-2 mt-1">
                <h2 className="text-lg font-semibold text-white/90">🎬 TMDB — The Movie Database</h2>
                {tmdbKey && (
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full font-semibold shrink-0">
                    ACTIVA
                  </span>
                )}
              </div>
            </div>
          </div>

          <p className="text-xs text-white/35 mb-1 leading-relaxed">
            Para cargar pósters y datos de películas y series en la sección Ocio.
          </p>
          <a
            href="https://www.themoviedb.org/settings/api"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-blue-400/70 hover:text-blue-400 transition mb-4"
          >
            Obtén tu key gratis en themoviedb.org → Settings → API →
          </a>

          <div className="rounded-2xl border border-white/8 bg-white/3 p-4">
            <div className="flex gap-2">
              <div className="flex-1 relative min-w-0">
                <input
                  value={tmdbKey}
                  onChange={e => setTmdbKey(e.target.value)}
                  type={tmdbKeyVisible ? 'text' : 'password'}
                  placeholder="eyJhbGc..."
                  className="w-full rounded-xl bg-white/5 border border-white/8 px-3 py-2.5 pr-10 text-sm text-white/80 focus:outline-none"
                />
                <button
                  onClick={() => setTmdbKeyVisible(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition"
                  type="button"
                >
                  {tmdbKeyVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <button
                onClick={handleSaveTmdbKey}
                className="rounded-xl bg-emerald-500/15 border border-emerald-500/20 px-3 py-2.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/25 transition shrink-0"
              >
                Guardar
              </button>
              <button
                onClick={handleTestTmdbKey}
                disabled={tmdbTestState === 'testing' || !tmdbKey.trim()}
                className="rounded-xl bg-white/5 border border-white/8 px-3 py-2.5 text-xs text-white/50 hover:text-white/80 transition shrink-0 disabled:opacity-40 w-16 flex items-center justify-center"
              >
                {tmdbTestState === 'testing' ? <Loader2 size={13} className="animate-spin" /> :
                 tmdbTestState === 'ok' ? '✅' :
                 tmdbTestState === 'fail' ? '❌' : 'Probar'}
              </button>
            </div>
            {tmdbTestState === 'ok' && (
              <p className="text-[11px] text-emerald-400 mt-1.5">Conexión correcta — TMDB activo</p>
            )}
            {tmdbTestState === 'fail' && (
              <p className="text-[11px] text-rose-400 mt-1.5">Key inválida o sin conexión</p>
            )}
          </div>
        </section>

        {/* Nutrición */}
        <section className="rounded-3xl border border-white/8 bg-[#1E1E28] p-5">
          <div className="mb-5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-orange-500/10 flex items-center justify-center">
              <Apple size={20} className="text-orange-300" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-white/25">Nutrición</p>
              <h2 className="text-lg font-semibold text-white/90 mt-1">Macros personalizados</h2>
            </div>
          </div>

          <div className="space-y-4">
            {(Object.keys(customMacros) as DayType[]).map((dayType) => (
              <div key={dayType} className="rounded-3xl border border-white/8 bg-white/5 p-4">
                <h3 className="text-sm font-semibold text-white/90 capitalize mb-3">{dayType}</h3>
                <div className="grid gap-3 sm:grid-cols-4">
                  <div>
                    <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Kcal</label>
                    <input
                      value={customMacros[dayType].kcal}
                      onChange={(e) => updateMacro(dayType, 'kcal', e.target.value)}
                      inputMode="numeric"
                      className="mt-1 w-full rounded-2xl bg-[#1E1E28] border border-white/8 px-3 py-2 text-sm text-white/80 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Proteína (g)</label>
                    <input
                      value={customMacros[dayType].protein}
                      onChange={(e) => updateMacro(dayType, 'protein', e.target.value)}
                      inputMode="numeric"
                      className="mt-1 w-full rounded-2xl bg-[#1E1E28] border border-white/8 px-3 py-2 text-sm text-white/80 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Carbos (g)</label>
                    <input
                      value={customMacros[dayType].carbs}
                      onChange={(e) => updateMacro(dayType, 'carbs', e.target.value)}
                      inputMode="numeric"
                      className="mt-1 w-full rounded-2xl bg-[#1E1E28] border border-white/8 px-3 py-2 text-sm text-white/80 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Grasa (g)</label>
                    <input
                      value={customMacros[dayType].fat}
                      onChange={(e) => updateMacro(dayType, 'fat', e.target.value)}
                      inputMode="numeric"
                      className="mt-1 w-full rounded-2xl bg-[#1E1E28] border border-white/8 px-3 py-2 text-sm text-white/80 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex gap-3">
            <button
              onClick={saveMacros}
              className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500"
            >
              <Save size={16} /> Guardar macros
            </button>
            <button
              onClick={resetMacros}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/8 bg-white/5 px-5 py-3 text-sm text-white/70 transition hover:border-white/14"
            >
              Restablecer
            </button>
          </div>
        </section>

        {/* Recordatorios */}
        <section className="rounded-3xl border border-white/8 bg-[#1E1E28] p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-violet-500/10 flex items-center justify-center">
              <Bell size={20} className="text-violet-300" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-white/25">Recordatorios</p>
              <h2 className="text-lg font-semibold text-white/90 mt-1">Notificaciones push</h2>
            </div>
          </div>

          {/* Permission banner */}
          {!notifSupported ? (
            <div className="rounded-2xl bg-white/4 border border-white/8 p-4 text-sm text-white/40">
              Tu navegador no soporta notificaciones push.
            </div>
          ) : notifPermission === 'denied' ? (
            <div className="rounded-2xl bg-rose-500/8 border border-rose-500/15 p-4 mb-4">
              <p className="text-sm font-semibold text-rose-300 mb-1">Notificaciones bloqueadas</p>
              <p className="text-xs text-rose-300/60 leading-relaxed">
                Para activarlas, haz clic en el candado 🔒 en la barra de direcciones, busca
                "Notificaciones" y cambia el permiso a "Permitir". Luego recarga la página.
              </p>
            </div>
          ) : notifPermission === 'default' ? (
            <div className="rounded-2xl bg-violet-500/8 border border-violet-500/15 p-4 mb-4 flex items-center justify-between gap-4">
              <p className="text-sm text-violet-200/70 leading-snug">
                Activa los permisos para recibir recordatorios aunque la app esté en segundo plano.
              </p>
              <button
                onClick={handleRequestPermission}
                className="shrink-0 rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-violet-500 transition"
              >
                Activar
              </button>
            </div>
          ) : (
            <div className="rounded-2xl bg-emerald-500/8 border border-emerald-500/15 px-4 py-2.5 mb-4 text-xs text-emerald-400 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
              Notificaciones activas
            </div>
          )}

          {/* Reminder rows */}
          <div className="space-y-3">
            {notifSettings.reminders.map((reminder) => {
              const meta = REMINDER_META[reminder.id]
              if (!meta) return null
              const isWeekly = reminder.dayOfWeek !== undefined
              const disabled = !notifSupported || notifPermission !== 'granted'
              return (
                <div
                  key={reminder.id}
                  className={`rounded-2xl border border-white/8 bg-white/3 p-4 transition ${
                    disabled ? 'opacity-45' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Toggle */}
                    <button
                      disabled={disabled}
                      onClick={() => updateReminder(reminder.id, { enabled: !reminder.enabled })}
                      className={`mt-0.5 w-9 h-5 rounded-full relative transition-colors shrink-0 ${
                        reminder.enabled ? 'bg-violet-500' : 'bg-white/12'
                      } disabled:cursor-not-allowed`}
                      aria-label="Toggle recordatorio"
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                          reminder.enabled ? 'translate-x-4' : ''
                        }`}
                      />
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-white/80">
                          {meta.emoji} {meta.label}
                        </span>
                      </div>
                      <p className="text-[11px] text-white/30 mb-3 leading-snug">{meta.description}</p>

                      <div className="flex flex-wrap gap-2">
                        {/* Time picker */}
                        <div>
                          <label className="text-[10px] uppercase tracking-widest text-white/25 block mb-1">
                            Hora
                          </label>
                          <input
                            type="time"
                            disabled={disabled}
                            value={toTimeStr(reminder.hour, reminder.minute)}
                            onChange={(e) => {
                              const { hour, minute } = fromTimeStr(e.target.value)
                              updateReminder(reminder.id, { hour, minute })
                            }}
                            className="rounded-xl bg-white/5 border border-white/8 px-3 py-2 text-sm text-white/75 focus:outline-none disabled:cursor-not-allowed scheme-dark"
                          />
                        </div>

                        {/* Day picker (weekly only) */}
                        {isWeekly && (
                          <div>
                            <label className="text-[10px] uppercase tracking-widest text-white/25 block mb-1">
                              Día
                            </label>
                            <select
                              disabled={disabled}
                              value={reminder.dayOfWeek}
                              onChange={(e) => updateReminder(reminder.id, { dayOfWeek: Number(e.target.value) })}
                              className="rounded-xl bg-white/5 border border-white/8 px-3 py-2 text-sm text-white/75 focus:outline-none disabled:cursor-not-allowed"
                            >
                              {DAY_NAMES.map((name, i) => (
                                <option key={i} value={i}>{name}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* Apariencia */}
        <section className="rounded-3xl border border-white/8 bg-[#1E1E28] p-5">
          <div className="mb-5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-500/10 flex items-center justify-center">
              <Palette size={20} className="text-purple-300" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-white/25">Apariencia</p>
              <h2 className="text-lg font-semibold text-white/90 mt-1">Tema de la aplicación</h2>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { value: 'oscuro' as const, label: 'Oscuro', desc: 'Tema oscuro siempre' },
              { value: 'claro' as const, label: 'Claro', desc: 'Tema claro siempre' },
              { value: 'sistema' as const, label: 'Sistema', desc: 'Según preferencia del sistema' },
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => saveTheme(option.value)}
                className={`rounded-3xl border p-4 text-left transition ${
                  theme === option.value
                    ? 'border-blue-500/40 bg-blue-500/10'
                    : 'border-white/8 bg-white/5 hover:border-white/14'
                }`}
              >
                <h3 className="text-sm font-semibold text-white/90">{option.label}</h3>
                <p className="mt-1 text-xs text-white/40">{option.desc}</p>
              </button>
            ))}
          </div>
        </section>

        {/* Datos */}
        <section className="rounded-3xl border border-white/8 bg-[#1E1E28] p-5">
          <div className="mb-5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-500/10 flex items-center justify-center">
              <Database size={20} className="text-rose-300" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-white/25">Datos</p>
              <h2 className="text-lg font-semibold text-white/90 mt-1">Exportar información</h2>
            </div>
          </div>

          <div className="rounded-3xl border border-white/8 bg-white/5 p-4">
            <p className="text-sm text-white/70 mb-4">
              Exporta todos tus datos de configuración como archivo JSON. Incluye perfil, macros personalizados y preferencias, pero no incluye datos de Firebase.
            </p>
            <button
              onClick={exportData}
              className="inline-flex items-center gap-2 rounded-2xl bg-rose-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-rose-500"
            >
              <Download size={16} /> Exportar datos
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}