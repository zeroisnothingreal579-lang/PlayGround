import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from './lib/auth'
import { Logo } from './components/Logo'
import { AppShell } from './components/AppShell'
import LandingPage from './pages/Landing'
import AuthPage from './pages/Auth'
import DashboardPage from './pages/Dashboard'
import CreatePhonePage from './pages/CreatePhone'
import WorkspacePage from './pages/Workspace'
import FilesPage from './pages/Files'
import BillingPage from './pages/Billing'
import SettingsPage from './pages/Settings'
import AdminPage from './pages/Admin'

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-ink-950">
        <Logo />
        <Loader2 className="h-5 w-5 animate-spin text-iris-400" />
        <p className="text-xs text-zinc-600">Restoring your workspace…</p>
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />
  return <>{children}</>
}

function NotFound() {
  return (
    <div className="grid min-h-[70vh] place-items-center px-6">
      <div className="text-center">
        <p className="font-mono text-xs text-iris-300/70">404</p>
        <h1 className="mt-2 font-display text-2xl font-semibold text-white">This screen does not exist</h1>
        <p className="mt-2 text-sm text-zinc-500">The page may have moved, or the phone was deleted.</p>
        <a href="/app" className="mt-5 inline-flex rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2 text-sm text-zinc-200 transition hover:bg-white/[0.09]">Back to workspace</a>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />

      <Route path="/app" element={<Protected><AppShell /></Protected>}>
        <Route index element={<DashboardPage />} />
        <Route path="create" element={<CreatePhonePage />} />
        <Route path="files" element={<FilesPage />} />
        <Route path="billing" element={<BillingPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="admin" element={<AdminPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>

      <Route path="/app/phones/:id" element={<Protected><WorkspacePage /></Protected>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
