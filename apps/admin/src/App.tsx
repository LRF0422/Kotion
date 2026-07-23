import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ThemeProvider, Toaster } from '@kn/ui'
import { AdminLayout } from './layout/AdminLayout'
import { Dashboard } from './pages/dashboard/Dashboard'
import { UserList } from './pages/users/UserList'
import { RoleList } from './pages/roles/RoleList'
import { SpaceList } from './pages/spaces/SpaceList'
import { PageList } from './pages/pages/PageList'
import { CommentList } from './pages/comments/CommentList'
import { PluginList } from './pages/plugins/PluginList'
import { AISettings } from './pages/ai/AISettings'
import { LogList } from './pages/logs/LogList'
import { SystemSettings } from './pages/settings/SystemSettings'

export const App = () => {
  return (
    <ThemeProvider defaultTheme="system" storageKey="kn-ui-theme">
      <HashRouter>
        <Routes>
          <Route path="/" element={<AdminLayout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="users" element={<UserList />} />
            <Route path="roles" element={<RoleList />} />
            <Route path="spaces" element={<SpaceList />} />
            <Route path="pages" element={<PageList />} />
            <Route path="comments" element={<CommentList />} />
            <Route path="plugins" element={<PluginList />} />
            <Route path="ai" element={<AISettings />} />
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
