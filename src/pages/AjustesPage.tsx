import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { User, Key, Apple, Palette, Database, Save, Download } from 'lucide-react'
import { DAY_TARGETS, type DayType, type MacroTarget } from '@/types/nutrition'

type GoalType = 'perder' | 'mantener' | 'ganar'
type ThemeType = 'oscuro' | 'claro' | 'sistema'

interface ProfileData {
  name: string
  weight: string
  height: string
  goal: GoalType
}

interface CustomMacros {
  [key in DayType]: MacroTarget
}

const STORAGE_KEYS = {
  profile: 'lifepilot_profile',
  geminiKey: 'lifepilot_gemini_key',
  customMacros: 'lifepilot_custom_macros',
  theme: 'lifepilot_theme',
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
  const [geminiKey, setGeminiKey] = useState('')
  const [customMacros, setCustomMacros] = useState<CustomMacros>(defaultMacros)
  const [theme, setTheme] = useState<ThemeType>('oscuro')
  const [feedback, setFeedback] = useState('')

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

    // Load Gemini key
    const savedKey = localStorage.getItem(STORAGE_KEYS.geminiKey) || ''
    setGeminiKey(savedKey)

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

  const saveGeminiKey = () => {
    localStorage.setItem(STORAGE_KEYS.geminiKey, geminiKey.trim())
    setFeedback('API key guardada correctamente')
    setTimeout(() => setFeedback(''), 2400)
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
      geminiKey: geminiKey ? '[CONFIGURADA]' : '[NO CONFIGURADA]',
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
        {/* Perfil */}
        <section className="rounded-3xl border border-white/8 bg-[#1E1E28] p-5">
          <div className="mb-5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/10 flex items-center justify-center">
              <User size={20} className="text-blue-300" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-white/25">Perfil</p>
              <h2 className="text-lg font-semibold text-white/90 mt-1">Información personal</h2>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Nombre</label>
              <input
                value={profile.name}
                onChange={(e) => setProfile(prev => ({ ...prev, name: e.target.value }))}
                className="mt-2 w-full rounded-2xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none"
                placeholder="Tu nombre"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Peso actual (kg)</label>
              <input
                value={profile.weight}
                onChange={(e) => setProfile(prev => ({ ...prev, weight: e.target.value }))}
                inputMode="numeric"
                className="mt-2 w-full rounded-2xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none"
                placeholder="75.5"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Altura (cm)</label>
              <input
                value={profile.height}
                onChange={(e) => setProfile(prev => ({ ...prev, height: e.target.value }))}
                inputMode="numeric"
                className="mt-2 w-full rounded-2xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none"
                placeholder="175"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Objetivo</label>
              <select
                value={profile.goal}
                onChange={(e) => setProfile(prev => ({ ...prev, goal: e.target.value as GoalType }))}
                className="mt-2 w-full rounded-2xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none"
              >
                <option value="perder">Perder peso</option>
                <option value="mantener">Mantener peso</option>
                <option value="ganar">Ganar masa muscular</option>
              </select>
            </div>
          </div>

          <button
            onClick={saveProfile}
            className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500"
          >
            <Save size={16} /> Guardar perfil
          </button>
        </section>

        {/* IA */}
        <section className="rounded-3xl border border-white/8 bg-[#1E1E28] p-5">
          <div className="mb-5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
              <Key size={20} className="text-emerald-300" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-white/25">IA</p>
              <h2 className="text-lg font-semibold text-white/90 mt-1">Google Gemini</h2>
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">API Key</label>
            <div className="mt-2 flex gap-3">
              <input
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                type="password"
                className="flex-1 rounded-2xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none"
                placeholder="Introduce tu API key de Gemini"
              />
              <button
                onClick={saveGeminiKey}
                className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-400"
              >
                Guardar
              </button>
            </div>
            <p className="mt-2 text-xs text-white/40">
              Obtén tu API key gratuita en{' '}
              <a
                href="https://makersuite.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300"
              >
                Google AI Studio
              </a>
            </p>
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