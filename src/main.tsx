import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router'
import './index.css'
import { AppShell } from './components/AppShell'
import { StartPage } from './pages/Start'

const router = createBrowserRouter([
  // Belum ada landing page: semua pengunjung langsung ke aplikasi.
  { path: '/', element: <Navigate to="/app" replace /> },
  {
    path: '/app',
    element: <AppShell />,
    children: [
      { index: true, element: <StartPage /> },
      // Halaman selain layout dimuat belakangan (kamera, katalog stiker, encoder GIF, animasi GSAP)
      // supaya pembukaan pertama ringan; tirai antar langkah menutupi saat memuatnya.
      { path: 'foto', lazy: () => import('./pages/Capture').then((m) => ({ Component: m.CapturePage })) },
      { path: 'masuk', lazy: () => import('./pages/Login').then((m) => ({ Component: m.LoginPage })) },
      { path: 'hias', lazy: () => import('./pages/Edit').then((m) => ({ Component: m.EditPage })) },
      { path: 'unduh', lazy: () => import('./pages/Result').then((m) => ({ Component: m.ResultPage })) },
      // Tujuan link "foto bareng" (/app/bareng#kode).
      { path: 'bareng', lazy: () => import('./pages/Join').then((m) => ({ Component: m.JoinPage })) },
      // Tujuan link estafet (/app/estafet#kode).
      { path: 'estafet', lazy: () => import('./pages/Estafet').then((m) => ({ Component: m.EstafetPage })) },
    ],
  },
  { path: '*', element: <Navigate to="/app" replace /> },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
