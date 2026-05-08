export function useToday() {
  const now = new Date()
  const hours = now.getHours()

  const greeting = hours >= 20 || hours < 5
    ? 'Buenas noches'
    : hours >= 12
      ? 'Buenas tardes'
      : 'Buenos días'

  const today = now.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  return { today, greeting }
}
