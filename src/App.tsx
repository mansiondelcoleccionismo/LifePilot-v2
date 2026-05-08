import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppShell } from '@/layouts/AppShell'
import { InicioPage } from '@/pages/InicioPage'
import { NutricionPage } from '@/pages/NutricionPage'
import { EjerciciosPage } from '@/pages/EjerciciosPage'
import { DiarioPage } from '@/pages/DiarioPage'
import { IAPage } from '@/pages/IAPage'
import { AjustesPage } from '@/pages/AjustesPage'
import { CalendarioPage } from '@/pages/CalendarioPage'
import { KiraPage } from '@/pages/KiraPage'
import { AprenderPage } from '@/pages/AprenderPage'
import { PlanesPage } from '@/pages/PlanesPage'
import { OcioPage } from '@/pages/OcioPage'
import { TareasPage } from '@/pages/TareasPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index           element={<InicioPage />} />
          <Route path="nutricion"  element={<NutricionPage />} />
          <Route path="ejercicios" element={<EjerciciosPage />} />
          <Route path="tareas"     element={<TareasPage />} />
          <Route path="calendario" element={<CalendarioPage />} />
          <Route path="ocio"       element={<OcioPage />} />
          <Route path="kira"       element={<KiraPage />} />
          <Route path="planes"     element={<PlanesPage />} />
          <Route path="aprender"   element={<AprenderPage />} />
          <Route path="diario"     element={<DiarioPage />} />
          <Route path="ia"         element={<IAPage />} />
          <Route path="ajustes"    element={<AjustesPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}