/* eslint-disable react-refresh/only-export-components */
import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './index.css'

const App = lazy(() => import('./App.jsx'))
const LoginPage = lazy(() => import('./LoginPage.jsx').then((module) => ({ default: module.LoginPage })))
const loading = <div className="app-loading" role="status">Loading…</div>

const router = createBrowserRouter([
  {
    path: '/login',
    element: <Suspense fallback={loading}><LoginPage /></Suspense>,
  },
  {
    path: '*',
    element: <Suspense fallback={loading}><App /></Suspense>,
  },
])

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
