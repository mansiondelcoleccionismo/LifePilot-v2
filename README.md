# LifePilot v2

**Asistente personal todo-en-uno** para gestión de salud, nutrición, ejercicio, productividad y bienestar diario. PWA instalable, datos en Firebase, IA integrada (Gemini + Groq).

🌐 **App en producción:** https://mansiondelcoleccionismo.github.io/LifePilot-v2/

---

## Qué hace

| Módulo | Funcionalidad |
|---|---|
| **Inicio** | Briefing diario con IA · agenda iCloud · resumen de macros, medicación y tareas · widget de hidratación · registro rápido de peso |
| **Nutrición** | Registro de comidas por categoría · acceso rápido inteligente (ordenado por frecuencia + recencia de uso) · búsqueda en Open Food Facts · análisis de plato por foto con Gemini Vision · cálculo de macros con IA por texto |
| **Ejercicios** | Rutinas de pesas por día de la semana · seguimiento de series |
| **Diario** | Registro de mood 1-5 · notas y etiquetas · racha de días consecutivos |
| **IA** | Hub central de inteligencia: patrones de los últimos 30 días · informe semanal · objetivos personalizados · predicción de la semana · chat libre con contexto completo del usuario |
| **Progreso** | Gráficas SVG de evolución: peso (90 días + tendencia lineal) · ánimo (60 días área) · adherencia a macros (30 días barras) |
| **Ocio / Sommelier** | Recomendaciones de películas, series y documentales con pósters TMDB · YouTube gratuito de documentales |
| **Kira** | Actividades y sugerencias para los días con la hija |
| **Tareas** | To-do con prioridades · toggle de completado |
| **Medicación** | Lista de medicamentos con horario · toggle de tomado · progreso diario |
| **Calendario** | Integración iCal (iCloud) con sincronización automática cada 15 min |
| **Patrimonio** | Seguimiento de activos y patrimonio neto |
| **Planes / Aprender** | Gestión de proyectos y aprendizaje continuo |
| **Ajustes** | Perfil metabólico (BMR/TDEE/IMC) · macros personalizados por tipo de día · API keys IA · TMDB · calendario iCloud · objetivo de hidratación · notificaciones push · exportar datos |

---

## Stack técnico

- **Frontend:** React 19 + TypeScript + Vite
- **Estilos:** Tailwind CSS v4
- **Animaciones:** Framer Motion
- **Base de datos:** Firebase Firestore (tiempo real)
- **Autenticación:** Firebase Auth (Google OAuth)
- **IA:** Gemini 2.5 Flash (principal) + Groq llama-3.3-70b (fallback) — hasta 7 API keys en rotación automática con cooldown por agotamiento de créditos
- **Datos externos:** Open Food Facts API · TMDB API · OpenMeteo (meteorología) · iCal (iCloud Calendar)
- **PWA:** Service Worker + manifest + iconos 192/512

---

## Arquitectura

```
src/
├── pages/          # Una página por módulo (InicioPage, NutricionPage, IAPage, ProgresPage…)
├── components/     # Widgets reutilizables (HydrationWidget, MedicationWidget…)
├── services/       # Lógica de negocio y acceso a Firebase/APIs externas
│   ├── ai.service.ts          # Rotación de claves Gemini/Groq con fallback
│   ├── ai-memory.service.ts   # Contexto del usuario inyectado en cada llamada IA
│   ├── context.service.ts     # GlobalContext en memoria: sincroniza datos en vivo de todas las páginas
│   ├── analytics.service.ts   # Patrones de 30 días (mood, proteína, racha, cumplimiento macros)
│   ├── metabolic.service.ts   # BMR/TDEE/IMC, targets por tipo de día
│   ├── nutrition.service.ts   # CRUD Firebase nutrition_entries
│   ├── favorites.service.ts   # Favoritos ordenados por recencia + frecuencia de uso
│   ├── hydration.service.ts   # Hidratación Firebase con target dinámico por tipo de día
│   ├── medication.service.ts  # Medicamentos + logs diarios Firebase
│   ├── diary.service.ts       # Entradas de diario Firebase
│   ├── ical.service.ts        # Parsing y caché de calendarios iCal
│   └── …
├── features/
│   └── health/     # useWeights, weightService, weightStore (Zustand)
├── hooks/          # useTasks, useGoogleAuth, useWeeklyWeightPrompt…
├── store/          # Zustand stores (auth, weights)
├── types/          # Interfaces TypeScript (FoodEntry, Medication, DiaryEntry…)
├── data/           # Tabla de referencia nutricional estática
└── lib/
    ├── firebase.ts    # Inicialización Firebase
    └── navigation.ts  # Grupos y items del menú de navegación
```

---

## Firebase collections

| Colección | Descripción |
|---|---|
| `nutrition_entries` | Entradas de comida del día (kcal, macros, meal, createdAt) |
| `food_favorites` | Favoritos con usageCount + lastUsedAt para ordenación inteligente |
| `tasks` | Tareas con prioridad y estado completado |
| `diary_entries` | Entradas de diario con mood (1-5), notas y tags |
| `medication_logs/{date}/medications/{id}` | Log de medicación por día |
| `hydration/{YYYY-MM-DD}` | Vasos de agua del día con target dinámico |
| `users/local-user/weights` | Historial de pesajes |

---

## Lógica de IA

Cada llamada a `callAI()` incluye automáticamente el contexto completo del usuario via `buildAIContext()`:
- Perfil metabólico (BMR, TDEE, IMC, objetivo)
- Tipo de día (pesas / pádel / descanso / tarde con Kira)
- Datos en tiempo real: macros consumidos, medicación, hidratación, tareas, mood, racha

El `GlobalContext` (`context.service.ts`) actúa como bus de datos en memoria: cada página llama `patchContext()` cuando llegan datos de Firebase, y la IA lo consume de forma síncrona sin añadir latencia.

---

## Instalación y desarrollo

```bash
npm install
npm run dev        # dev server en localhost:5173
npm run build      # build de producción
npm run preview    # preview del build
```

Requiere un proyecto Firebase con Firestore habilitado. Copia las credenciales en `src/lib/firebase.ts`.

Las API keys de IA se configuran desde la propia app en **Ajustes → IA**.

---

## Despliegue

El proyecto se despliega automáticamente en GitHub Pages via GitHub Actions al hacer push a `main`.

```bash
npm run build && git push  # el workflow hace el deploy automáticamente
```
