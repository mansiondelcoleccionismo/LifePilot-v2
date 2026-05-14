import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { PageHeader } from '@/components/layout/PageContainer'
import { Plus, Trash2, CheckSquare, RefreshCw, AlertCircle } from 'lucide-react'
import { subscribeTasks, addTask, toggleTask, deleteTask } from '@/services/tasks.service'
import { getTasks, createTask, completeTask, deleteTask as deleteGTask, type GTask } from '@/services/google-tasks.service'
import { TokenExpiredError } from '@/services/google-calendar.service'
import { useAuthStore } from '@/store/auth.store'
import type { Task } from '@/types/task'

// ── Google Tasks section ──────────────────────────────────────────────────────

function GoogleTaskItem({ task, onComplete, onDelete }: {
  task: GTask
  onComplete: (id: string) => void
  onDelete: (id: string) => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex items-center gap-3 p-4 rounded-2xl bg-[#1E1E28] border border-blue-500/10 group"
    >
      <button
        onClick={() => onComplete(task.id)}
        className="w-5 h-5 rounded-full border border-white/20 hover:border-blue-500/50 flex items-center justify-center shrink-0 transition-colors"
      >
        <div className="w-2 h-2 rounded-full" />
      </button>
      <div className="flex-1 min-w-0">
        <span className="text-sm text-white/75">{task.title}</span>
        {task.notes && <p className="text-xs text-white/35 mt-0.5 truncate">{task.notes}</p>}
        {task.due && (
          <p className="text-[10px] text-blue-400/60 mt-0.5">
            {new Date(task.due).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
          </p>
        )}
      </div>
      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/12 text-blue-400/70 border border-blue-500/15 shrink-0">
        Google
      </span>
      <button
        onClick={() => onDelete(task.id)}
        className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
      >
        <Trash2 size={14} />
      </button>
    </motion.div>
  )
}

function GoogleTasksSection() {
  const [tasks, setTasks]     = useState<GTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<'expired' | null>(null)
  const [input, setInput]     = useState('')
  const [adding, setAdding]   = useState(false)
  const { logout }            = useAuthStore()

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getTasks()
      setTasks(data)
    } catch (err) {
      if (err instanceof TokenExpiredError) setError('expired')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 30_000)
    return () => clearInterval(id)
  }, [load])

  const handleAdd = async () => {
    if (!input.trim() || adding) return
    setAdding(true)
    try {
      const t = await createTask(input.trim())
      setTasks(prev => [t, ...prev])
      setInput('')
    } catch {
      /* silent */
    } finally {
      setAdding(false)
    }
  }

  const handleComplete = async (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id))
    try { await completeTask(id) } catch { /* silent */ }
  }

  const handleDelete = async (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id))
    try { await deleteGTask(id) } catch { /* silent */ }
  }

  if (error === 'expired') {
    return (
      <div className="flex items-center gap-3 p-3 rounded-2xl bg-amber-500/8 border border-amber-500/20 mb-4">
        <AlertCircle size={15} className="text-amber-400 shrink-0" />
        <p className="text-sm text-white/60 flex-1">Token de Google expirado.</p>
        <button onClick={logout} className="text-xs text-amber-400 hover:text-amber-300 transition">
          Reconectar
        </button>
      </div>
    )
  }

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-semibold text-white/60">📱 Google Tasks</span>
        <button onClick={load} disabled={loading} className="ml-auto text-white/30 hover:text-white/60 transition disabled:opacity-40">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex gap-2 mb-3">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="Añadir a Google Tasks..."
          className="flex-1 h-9 px-3 rounded-xl bg-white/5 border border-blue-500/20 text-white/80 placeholder:text-white/25 text-sm focus:outline-none focus:border-blue-500/40 transition-colors"
        />
        <button
          onClick={handleAdd}
          disabled={adding || !input.trim()}
          className="h-9 w-9 rounded-xl bg-blue-600 hover:bg-blue-500 flex items-center justify-center transition disabled:opacity-40"
        >
          <Plus size={15} className="text-white" />
        </button>
      </div>

      {loading && tasks.length === 0 ? (
        <div className="flex justify-center py-4">
          <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-blue-400 animate-spin" />
        </div>
      ) : tasks.length === 0 ? (
        <p className="text-center py-4 text-white/25 text-sm">Sin tareas en Google Tasks</p>
      ) : (
        <AnimatePresence>
          <div className="space-y-2">
            {tasks.map(t => (
              <GoogleTaskItem key={t.id} task={t} onComplete={handleComplete} onDelete={handleDelete} />
            ))}
          </div>
        </AnimatePresence>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function TareasPage() {
  const { isLoggedIn }          = useAuthStore()
  const [tasks, setTasks]       = useState<Task[]>([])
  const [input, setInput]       = useState('')
  const [priority, setPriority] = useState<Task['priority']>('medium')
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    const unsub = subscribeTasks((data) => {
      setTasks(data)
      setLoading(false)
    })
    return () => unsub()
  }, [])

  const handleAdd = async () => {
    if (!input.trim()) return
    await addTask(input.trim(), priority)
    setInput('')
  }

  const pending   = tasks.filter((t) => !t.completed)
  const completed = tasks.filter((t) => t.completed)

  return (
    <div className="px-4 py-6 md:px-6 lg:px-8 max-w-2xl mx-auto pb-28">

      <PageHeader
        title="Tareas"
        subtitle={`${pending.length} pendientes · ${completed.length} completadas`}
      />

      {/* Google Tasks (si logueado) */}
      {isLoggedIn && <GoogleTasksSection />}

      {/* Divider */}
      {isLoggedIn && (
        <div className="flex items-center gap-2 mb-4">
          <div className="flex-1 h-px bg-white/6" />
          <span className="text-[10px] font-semibold tracking-widest uppercase text-white/25">📝 Tareas locales</span>
          <div className="flex-1 h-px bg-white/6" />
        </div>
      )}

      {/* Local input */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex gap-2 mb-6"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder={isLoggedIn ? 'Nueva tarea local...' : 'Nueva tarea...'}
          className="flex-1 h-10 px-4 rounded-xl bg-white/6 border border-white/8 text-white/80 placeholder:text-white/25 text-sm focus:outline-none focus:border-blue-500/50 transition-colors"
        />
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as Task['priority'])}
          className="h-10 px-3 rounded-xl bg-white/6 border border-white/8 text-white/60 text-xs focus:outline-none cursor-pointer"
        >
          <option value="low">Baja</option>
          <option value="medium">Media</option>
          <option value="high">Alta</option>
        </select>
        <button
          onClick={handleAdd}
          className="h-10 w-10 rounded-xl bg-blue-600 hover:bg-blue-500 flex items-center justify-center transition-colors shrink-0"
        >
          <Plus size={18} className="text-white" />
        </button>
      </motion.div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-blue-400 animate-spin" />
        </div>
      )}

      {/* Pending tasks */}
      {!loading && (
        <AnimatePresence>
          <div className="space-y-2 mb-6">
            {pending.map((task) => (
              <TaskItem key={task.id} task={task} />
            ))}
            {pending.length === 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-8 text-white/25 text-sm"
              >
                No hay tareas pendientes 🎉
              </motion.div>
            )}
          </div>
        </AnimatePresence>
      )}

      {/* Completed tasks */}
      {!loading && completed.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold tracking-widest uppercase text-white/25 mb-2">
            Completadas
          </p>
          <div className="space-y-2">
            {completed.map((task) => (
              <TaskItem key={task.id} task={task} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function TaskItem({ task }: { task: Task }) {
  const priorityColors: Record<Task['priority'], string> = {
    low:    'bg-white/10 text-white/40',
    medium: 'bg-amber-500/20 text-amber-400',
    high:   'bg-rose-500/20 text-rose-400',
  }
  const priorityLabels: Record<Task['priority'], string> = {
    low: 'Baja', medium: 'Media', high: 'Alta',
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex items-center gap-3 p-4 rounded-2xl bg-[#1E1E28] border border-white/8 group"
    >
      <button
        onClick={() => toggleTask(task.id, !task.completed)}
        className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
          task.completed
            ? 'bg-emerald-500/20 border-emerald-500/50'
            : 'border-white/20 hover:border-emerald-500/50'
        }`}
      >
        {task.completed && <div className="w-2 h-2 rounded-full bg-emerald-400" />}
      </button>
      <span className={`flex-1 text-sm ${task.completed ? 'line-through text-white/25' : 'text-white/75'}`}>
        {task.title}
      </span>
      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${priorityColors[task.priority]}`}>
        {priorityLabels[task.priority]}
      </span>
      <button
        onClick={() => deleteTask(task.id)}
        className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
      >
        <Trash2 size={14} />
      </button>
    </motion.div>
  )
}
