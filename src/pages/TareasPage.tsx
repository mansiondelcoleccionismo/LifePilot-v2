import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Trash2, CheckSquare } from 'lucide-react'
import { subscribeTasks, addTask, toggleTask, deleteTask } from '@/services/tasks.service'
import type { Task } from '@/types/task'

const priorities = [
  { value: 'low',    label: 'Baja',  color: 'bg-white/10 text-white/40' },
  { value: 'medium', label: 'Media', color: 'bg-amber-500/20 text-amber-400' },
  { value: 'high',   label: 'Alta',  color: 'bg-rose-500/20 text-rose-400' },
] as const

export function TareasPage() {
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
    <div className="px-4 py-6 md:px-6 lg:px-8 max-w-2xl mx-auto">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center">
            <CheckSquare size={18} className="text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white/90">Tareas</h1>
            <p className="text-xs text-white/35">{pending.length} pendientes · {completed.length} completadas</p>
          </div>
        </div>
      </motion.div>

      {/* Input */}
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
          placeholder="Nueva tarea..."
          className="flex-1 h-10 px-4 rounded-xl bg-white/6 border border-white/8 text-white/80 placeholder:text-white/25 text-sm focus:outline-none focus:border-blue-500/50 transition-colors"
        />
        {/* Priority selector */}
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
          className="h-10 w-10 rounded-xl bg-blue-600 hover:bg-blue-500 flex items-center justify-center transition-colors flex-shrink-0"
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
      {/* Checkbox */}
      <button
        onClick={() => toggleTask(task.id, !task.completed)}
        className={`w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 transition-colors ${
          task.completed
            ? 'bg-emerald-500/20 border-emerald-500/50'
            : 'border-white/20 hover:border-emerald-500/50'
        }`}
      >
        {task.completed && <div className="w-2 h-2 rounded-full bg-emerald-400" />}
      </button>

      {/* Title */}
      <span className={`flex-1 text-sm ${task.completed ? 'line-through text-white/25' : 'text-white/75'}`}>
        {task.title}
      </span>

      {/* Priority badge */}
      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${priorityColors[task.priority]}`}>
        {priorityLabels[task.priority]}
      </span>

      {/* Delete */}
      <button
        onClick={() => deleteTask(task.id)}
        className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
      >
        <Trash2 size={14} />
      </button>
    </motion.div>
  )
}