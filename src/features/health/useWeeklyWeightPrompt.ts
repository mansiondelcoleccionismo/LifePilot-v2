import { useEffect, useState } from 'react'
import { useWeightStore } from './weightStore'

const todayKey = () =>
  `weight-prompt-dismissed-${new Date().toISOString().split('T')[0]}`
const UNTIL_KEY = 'weight-prompt-dismissed-until'

function isDismissed(): boolean {
  if (localStorage.getItem(todayKey())) return true
  const until = localStorage.getItem(UNTIL_KEY)
  if (until && new Date(until) > new Date()) return true
  return false
}

export function useWeeklyWeightPrompt() {
  const { weights, loading } = useWeightStore()
  const [shouldPrompt, setShouldPrompt] = useState(false)

  useEffect(() => {
    if (loading) return
    if (isDismissed()) return

    if (weights.length === 0) {
      setShouldPrompt(true)
      return
    }

    const last = weights[0]
    const daysSince = (Date.now() - last.date.getTime()) / 86_400_000
    if (daysSince >= 7) setShouldPrompt(true)
  }, [loading, weights])

  /** Called after successfully saving weight — no need to mark dismissed */
  const closePrompt = () => setShouldPrompt(false)

  /** "Recordármelo mañana" */
  const dismissToday = () => {
    localStorage.setItem(todayKey(), '1')
    setShouldPrompt(false)
  }

  /** "No esta semana" */
  const dismissWeek = () => {
    const until = new Date()
    until.setDate(until.getDate() + 7)
    localStorage.setItem(UNTIL_KEY, until.toISOString())
    setShouldPrompt(false)
  }

  return { shouldPrompt, closePrompt, dismissToday, dismissWeek }
}
