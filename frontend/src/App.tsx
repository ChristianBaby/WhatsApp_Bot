import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './layout/Layout';
import { RUTA_INICIAL } from './lib/rutas';
import { useAuth } from './hooks/useAuth';
import { Login } from './pages/Login';
import { Conexion } from './pages/Conexion';
import { Leads } from './pages/Leads';
import { Publicaciones } from './pages/Publicaciones';
import { Reportes } from './pages/Reportes';
import { Respuestas } from './pages/Respuestas';
import { AutoRespuestas } from './pages/AutoRespuestas';
import { Configuracion } from './pages/Configuracion';

export function App() {
  const { cargando, usuario, cerrarSesion } = useAuth();

  // Nada que decidir todavia (¿hay sesion o no?) — mejor una pantalla en
  // blanco un instante que parpadear entre login y panel.
  if (cargando) return null;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={usuario ? <Navigate to={RUTA_INICIAL} replace /> : <Login />} />
        <Route
          element={usuario ? <Layout usuario={usuario} onCerrarSesion={cerrarSesion} /> : <Navigate to="/login" replace />}
        >
          <Route index element={<Navigate to={RUTA_INICIAL} replace />} />
          <Route path="/conexion" element={<Conexion />} />
          <Route path="/leads" element={<Leads />} />
          <Route path="/publicaciones" element={<Publicaciones />} />
          <Route path="/reportes" element={<Reportes />} />
          <Route path="/respuestas" element={<Respuestas />} />
          <Route path="/auto-respuestas" element={<AutoRespuestas />} />
          <Route path="/configuracion" element={<Configuracion />} />
          <Route path="*" element={<Navigate to={RUTA_INICIAL} replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
