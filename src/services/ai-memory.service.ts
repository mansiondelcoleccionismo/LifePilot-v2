import { loadProfile, calcBMR, calcTDEE, calcIMC, getTargetForDay, getDayLabel } from './metabolic.service'

const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const DAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

export function buildAIContext(): string {
  try {
    const profile = loadProfile()
    const bmr = calcBMR(profile)
    const tdee = calcTDEE(profile)
    const imc = calcIMC(profile)
    const dow = new Date().getDay()
    const dayName = DAY_NAMES[dow]
    const todayTarget = getTargetForDay(profile)
    const dayLabel = getDayLabel(profile)

    const trainingStr = DAY_SHORT.filter((_, i) => profile.trainingDays.includes(i)).join(', ')
    const padelStr    = DAY_SHORT.filter((_, i) => profile.padelDays.includes(i)).join(', ')

    return `[CONTEXTO_USUARIO]
Nombre: ${profile.name} | Peso: ${profile.weight}kg | Altura: ${profile.height}cm | IMC: ${imc}
BMR: ${bmr} kcal | TDEE: ${tdee} kcal | Objetivo: ${profile.goal}
Hoy (${dayName}): ${dayLabel}
Target hoy — ${todayTarget.kcal} kcal · Proteína: ${todayTarget.protein}g · Carbos: ${todayTarget.carbs}g · Grasa: ${todayTarget.fat}g
Pesas: ${trainingStr} | Pádel: ${padelStr}
[FIN_CONTEXTO]

`
  } catch {
    return ''
  }
}
