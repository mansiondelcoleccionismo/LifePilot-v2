import { HashRouter, Routes, Route } from 'react-router-dom'
import { AppShell } from '@/layouts/AppShell'
import { LoginPage } from '@/pages/LoginPage'
import { useAuthStore } from '@/store/auth.store'
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
import { MedicacionPage } from '@/pages/MedicacionPage'
import { PatrimonioPage } from '@/pages/PatrimonioPage'
import { PerfilPage } from '@/pages/PerfilPage'
import { SaludPesoPage } from '@/pages/SaludPesoPage'
import { SaludPage } from '@/pages/SaludPage'
import { ProgresPage } from '@/pages/ProgresPage'

export default function App() {
  const { isLoggedIn } = useAuthStore()

  if (!isLoggedIn) return <LoginPage />

  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index           element={<InicioPage />} />
          <Route path="nutricion"  element={<NutricionPage />} />
          <Route path="ejercicios" element={<EjerciciosPage />} />
          <Route path="tareas"     element={<TareasPage />} />
          <Route path="medicacion" element={<MedicacionPage />} />
          <Route path="patrimonio" element={<PatrimonioPage />} />
          <Route path="calendario" element={<CalendarioPage />} />
          <Route path="ocio"       element={<OcioPage />} />
          <Route path="kira"       element={<KiraPage />} />
          <Route path="planes"     element={<PlanesPage />} />
          <Route path="aprender"   element={<AprenderPage />} />
          <Route path="diario"     element={<DiarioPage />} />
          <Route path="ia"         element={<IAPage />} />
          <Route path="ajustes"    element={<AjustesPage />} />
          <Route path="perfil"     element={<PerfilPage />} />
          <Route path="salud/peso" element={<SaludPesoPage />} />
          <Route path="progreso"   element={<ProgresPage />} />
          <Route path="salud"      element={<SaludPage />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}