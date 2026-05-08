import { useEffect, useState } from 'react'
import { subscribeTasks } from '@/services/tasks.service'
import type { Task } from '@/types/task'

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = subscribeTasks((fetchedTasks) => {
      setTasks(fetchedTasks)
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  const completed = tasks.filter((task) => task.completed).length
  const pending = tasks.filter((task) => !task.completed).length

  return { tasks, pending, completed, loading }
}
