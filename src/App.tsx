import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppShell } from '@/layouts/AppShell'
import { InicioPage } from '@/pages/InicioPage'
import { NutricionPage } from '@/pages/NutricionPage'
import { EjerciciosPage } from '@/pages/EjerciciosPage'
import { DiarioPage } from '@/pages/DiarioPage'
import { IAPage } from '@/pages/IAPage'
import { AjustesPage } from '@/pages/AjustesPage'
import { TareasPage } from '@/pages/TareasPage'

function Placeholder({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <p className="text-4xl mb-4">🚧</p>
        <h2 className="text-xl font-semibold text-white/70">{title}</h2>
        <p className="text-sm text-white/30 mt-2">Módulo en construcción</p>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index           element={<InicioPage />} />
          <Route path="nutricion"  element={<NutricionPage />} />
          <Route path="ejercicios" element={<EjerciciosPage />} />
          <Route path="tareas"     element={<TareasPage />} />
          <Route path="calendario" element={<Placeholder title="Calendario" />} />
          <Route path="ocio"       element={<Placeholder title="Ocio" />} />
          <Route path="kira"       element={<Placeholder title="Kira" />} />
          <Route path="planes"     element={<Placeholder title="Planes" />} />
          <Route path="aprender"   element={<Placeholder title="Aprender" />} />
          <Route path="diario"     element={<DiarioPage />} />
          <Route path="ia"         element={<IAPage />} />
          <Route path="ajustes"    element={<AjustesPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}