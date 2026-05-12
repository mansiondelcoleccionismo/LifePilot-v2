export interface KiraMilestoneDef {
  id: string
  ageMonths: number
  title: string
  description: string
  importance: string
  area: 'motor' | 'lenguaje' | 'cognitivo' | 'social' | 'autonomia'
  relatedActivities: string[] // IDs de kira-activities.ts
}

// Hitos reales basados en desarrollo infantil (Denver II, Portage, OMS)
export const KIRA_MILESTONES_DEF: KiraMilestoneDef[] = [
  // ── YA CONSEGUIDOS (< 43 meses) ────────────────────────────────────────────
  {
    id: 'ms-30-01', ageMonths: 30, area: 'motor',
    title: 'Sube y baja escaleras alternando pies',
    description: 'Sube escaleras poniendo un pie diferente en cada peldaño, sin apoyarse en la pared.',
    importance: 'Señal de madurez del sistema de equilibrio y coordinación motora cruzada.',
    relatedActivities: ['ext-06', 'ext-04'],
  },
  {
    id: 'ms-30-02', ageMonths: 30, area: 'lenguaje',
    title: 'Frases de 3 palabras',
    description: 'Construye frases de 3 palabras: "papá quiero agua", "Kira no quiere".',
    importance: 'Hito central del desarrollo lingüístico que indica dominio de estructura gramatical básica.',
    relatedActivities: ['cog-06', 'vin-05', 'mus-01'],
  },
  {
    id: 'ms-36-01', ageMonths: 36, area: 'motor',
    title: 'Dibuja círculos y cruces',
    description: 'Puede dibujar formas geométricas simples: círculo, cruz, líneas horizontales y verticales.',
    importance: 'Indicador de la madurez de la motricidad fina visomotora, prerequisito directo para la escritura.',
    relatedActivities: ['cre-01', 'cre-07', 'cog-07'],
  },
  {
    id: 'ms-36-02', ageMonths: 36, area: 'cognitivo',
    title: 'Cuenta hasta 10',
    description: 'Cuenta de memoria hasta 10 y puede contar 3-4 objetos reales con correspondencia.',
    importance: 'Distingue entre recitar números (conteo memorístico) y contar objetos (cardinalidad). Hito matemático fundamental.',
    relatedActivities: ['cog-03', 'aut-09', 'aut-05'],
  },
  {
    id: 'ms-36-03', ageMonths: 36, area: 'cognitivo',
    title: 'Conoce colores básicos',
    description: 'Identifica y nombra correctamente rojo, azul, amarillo, verde, negro, blanco.',
    importance: 'La clasificación por color es el primer hito de categorización abstracta. Base del pensamiento lógico.',
    relatedActivities: ['cog-03', 'cre-01', 'ext-01'],
  },
  {
    id: 'ms-36-04', ageMonths: 36, area: 'social',
    title: 'Juego paralelo con otros niños',
    description: 'Juega al lado de otros niños sin necesidad de interacción, observándoles y a veces imitándoles.',
    importance: 'El juego paralelo es la etapa previa al juego cooperativo. Indica desarrollo social saludable.',
    relatedActivities: ['ext-10', 'ext-02', 'mus-10'],
  },
  {
    id: 'ms-36-05', ageMonths: 36, area: 'autonomia',
    title: 'Come sola con cuchara y tenedor',
    description: 'Se alimenta de forma independiente, con derrame ocasional pero funcional.',
    importance: 'La autonomía en la alimentación refleja el nivel de coordinación visomotora y de autoeficacia.',
    relatedActivities: ['aut-01', 'aut-02', 'aut-09'],
  },
  // ── EN PROCESO AHORA (40-46 meses) ─────────────────────────────────────────
  {
    id: 'ms-42-01', ageMonths: 42, area: 'motor',
    title: 'Salta a la pata coja',
    description: 'Puede dar 2-3 saltos consecutivos sobre un solo pie (derecho o izquierdo).',
    importance: 'Este hito requiere equilibrio unipodal dinámico, señal de madurez del sistema cerebeloso.',
    relatedActivities: ['ext-06', 'ext-04', 'mus-10'],
  },
  {
    id: 'ms-42-02', ageMonths: 42, area: 'lenguaje',
    title: 'Frases de 4-5 palabras',
    description: 'Construye frases complejas con sujeto, verbo, objeto y complemento: "papá yo quiero ir al parque".',
    importance: 'La longitud media de enunciado es el indicador más fiable del desarrollo lingüístico a esta edad.',
    relatedActivities: ['vin-05', 'cog-06', 'mus-05'],
  },
  {
    id: 'ms-42-03', ageMonths: 42, area: 'social',
    title: 'Juego cooperativo con otros niños',
    description: 'Juega con otros niños con un objetivo compartido, negocia turnos y roles.',
    importance: 'El juego cooperativo activa la teoría de la mente, la empatía y la regulación emocional en contexto social real.',
    relatedActivities: ['mus-10', 'cog-07', 'ext-02'],
  },
  {
    id: 'ms-42-04', ageMonths: 42, area: 'autonomia',
    title: 'Se pone y quita zapatos solos',
    description: 'Puede ponerse y quitarse zapatos con velcro de forma completamente independiente.',
    importance: 'La autonomía en el vestido requiere planificación motora y perseverancia. Señal clave de función ejecutiva.',
    relatedActivities: ['aut-08', 'aut-03', 'aut-04'],
  },
  // ── PRÓXIMOS (47-54 meses) ─────────────────────────────────────────────────
  {
    id: 'ms-48-01', ageMonths: 48, area: 'lenguaje',
    title: 'Reconoce letras de su nombre',
    description: 'Identifica visualmente la K, la I, la R y la A de su nombre.',
    importance: 'El reconocimiento de letras propias es el primer paso de la conciencia grafofónica, base de la lectoescritura.',
    relatedActivities: ['aut-07', 'cre-05', 'vin-06'],
  },
  {
    id: 'ms-48-02', ageMonths: 48, area: 'motor',
    title: 'Corta con tijeras de punta redonda',
    description: 'Puede cortar líneas rectas y curvas simples con tijeras de punta redonda.',
    importance: 'El uso de tijeras requiere coordinación bimanual y apertura/cierre controlado de la mano no dominante.',
    relatedActivities: ['cre-02', 'cre-05', 'aut-07'],
  },
  {
    id: 'ms-48-03', ageMonths: 48, area: 'autonomia',
    title: 'Se viste sola con ayuda mínima',
    description: 'Puede ponerse ropa con apertura frontal, pantalones elásticos y calcetines sin ayuda.',
    importance: 'La autonomía en el vestido es un hito de independencia compleja que integra planificación, secuenciación y motricidad fina.',
    relatedActivities: ['aut-08', 'aut-03'],
  },
  {
    id: 'ms-54-01', ageMonths: 54, area: 'lenguaje',
    title: 'Escribe su nombre',
    description: 'Puede escribir las letras de su nombre (KIRA) de forma reconocible, aunque no perfecta.',
    importance: 'Escribir el propio nombre es el primer acto de escritura significativa. Integra fonética, grafomotricidad e identidad.',
    relatedActivities: ['cre-05', 'aut-07', 'vin-06'],
  },
  {
    id: 'ms-54-02', ageMonths: 54, area: 'cognitivo',
    title: 'Cuenta hasta 20',
    description: 'Cuenta de memoria hasta 20 y puede contar hasta 10 objetos reales con correspondencia.',
    importance: 'El dominio numérico hasta 20 es la base aritmética que se trabaja en 1º de Primaria.',
    relatedActivities: ['cog-04', 'aut-09', 'aut-05'],
  },
]

export function getMilestoneStatus(
  milestone: KiraMilestoneDef,
  currentAgeMonths: number,
  achievedIds: Set<string>,
): 'achieved' | 'inprogress' | 'upcoming' | 'hidden' {
  if (achievedIds.has(milestone.id)) return 'achieved'
  const diff = milestone.ageMonths - currentAgeMonths
  if (diff < -3) return 'achieved' // esperado antes de los últimos 3 meses
  if (Math.abs(diff) <= 3) return 'inprogress' // ±3 meses de la edad actual
  if (diff > 3 && diff <= 9) return 'upcoming'
  return 'hidden'
}
