import { Home, Salad, Dumbbell, CheckSquare, CalendarDays, Pill, Clapperboard, Baby, Map, BookOpen, NotebookPen, Sparkles, Settings, TrendingUp, Activity, Heart } from 'lucide-react'

export const NAV_GROUPS = [
  {
    id: 'main',
    label: 'Principal',
    items: [
      { id: 'inicio',      label: 'Inicio',      icon: Home,         path: '/',           mobileVisible: true },
      { id: 'nutricion',   label: 'Nutrición',   icon: Salad,        path: '/nutricion',  mobileVisible: true },
      { id: 'ejercicios',  label: 'Ejercicios',  icon: Dumbbell,     path: '/ejercicios', mobileVisible: true },
      { id: 'tareas',      label: 'Tareas',      icon: CheckSquare,  path: '/tareas',     mobileVisible: true, badge: 3 },
      { id: 'calendario',  label: 'Calendario',  icon: CalendarDays, path: '/calendario', mobileVisible: true },
      { id: 'medicacion',  label: 'Medicación',  icon: Pill,         path: '/medicacion' },
      { id: 'progreso',    label: 'Progreso',    icon: Activity,     path: '/progreso' },
      { id: 'salud',      label: 'Salud',       icon: Heart,        path: '/salud' },
    ],
  },
  {
    id: 'personal',
    label: 'Personal',
    items: [
      { id: 'ocio',      label: 'Ocio',     icon: Clapperboard, path: '/ocio' },
      { id: 'kira',      label: 'Kira',     icon: Baby,         path: '/kira' },
      { id: 'planes',    label: 'Planes',   icon: Map,          path: '/planes' },
      { id: 'aprender',  label: 'Aprender', icon: BookOpen,     path: '/aprender' },
      { id: 'diario',    label: 'Diario',   icon: NotebookPen,  path: '/diario' },
    ],
  },
  {
    id: 'system',
    label: 'Sistema',
    items: [
      { id: 'ia',         label: 'IA',         icon: Sparkles,   path: '/ia' },
      { id: 'patrimonio', label: 'Patrimonio', icon: TrendingUp, path: '/patrimonio' },
      { id: 'ajustes',    label: 'Ajustes',    icon: Settings,   path: '/ajustes' },
    ],
  },
]

export const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items)
export const MOBILE_NAV_ITEMS = ALL_NAV_ITEMS.filter((i) => i.mobileVisible)