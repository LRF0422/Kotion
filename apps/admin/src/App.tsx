import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ThemeProvider, Toaster } from '@kn/ui'
import { AdminLayout } from './layout/AdminLayout'
import { Login } from './pages/login/Login'
import { Dashboard } from './pages/dashboard/Dashboard'
import { SpaceList } from './pages/spaces/SpaceList'
import { PageList } from './pages/pages/PageList'
import { CommentList } from './pages/comments/CommentList'
import { PluginList } from './pages/plugins/PluginList'
import { AISettings } from './pages/ai/AISettings'
import { AiUsage } from './pages/ai/AiUsage'
import { LogList } from './pages/audit/LogList'
import { SystemSettings } from './pages/settings/SystemSettings'
import { isOperatorLoggedIn } from './lib/auth'

const RequireAuth = ({ children }: { children: React.ReactNode }) => {
  if (!isOperatorLoggedIn()) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}

export const App = () => {
  return (
    <ThemeProvider defaultTheme="system" storageKey="kn-ui-theme">
      <HashRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={(
              <RequireAuth>
                <AdminLayout />
              </RequireAuth>
            )}
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="spaces" element={<SpaceList />} />
            <Route path="pages" element={<PageList />} />
            <Route path="comments" element={<CommentList />} />
            <Route path="plugins" element={<PluginList />} />
            <Route path="ai" element={<AISettings />} />
            <Route path="ai-usage" element={<AiUsage />} />
            <Route path="logs" element={<LogList />} />
            <Route path="settings" element={<SystemSettings />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
      </HashRouter>
      <Toaster />
    </ThemeProvider>
  )
}
