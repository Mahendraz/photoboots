import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router'
import './index.css'
import { AppShell } from './components/AppShell'
import { StartPage } from './pages/Start'
import { CapturePage } from './pages/Capture'
import { LoginPage } from './pages/Login'

const router = createBrowserRouter([
  // Belum ada landing page: semua pengunjung langsung ke aplikasi.
  { path: '/', element: <Navigate to="/app" replace /> },
  {
    path: '/app',
    element: <AppShell />,
    children: [
      { index: true, element: <StartPage /> },
      { path: 'foto', element: <CapturePage /> },
      { path: 'masuk', element: <LoginPage /> },
      // Halaman hias (katalog stiker) & unduh (encoder GIF) dimuat belakangan supaya pembukaan pertama ringan.
      { path: 'hias', lazy: () => import('./pages/Edit').then((m) => ({ Component: m.EditPage })) },
      { path: 'unduh', lazy: () => import('./pages/Result').then((m) => ({ Component: m.ResultPage })) },
    ],
  },
  { path: '*', element: <Navigate to="/app" replace /> },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
