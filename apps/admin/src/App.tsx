import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ThemeProvider, Toaster } from '@kn/ui'
import { AdminLayout } from './layout/AdminLayout'
import { Login } from './pages/login/Login'
import { Dashboard } from './pages/dashboard/Dashboard'
import { SpaceList } from './pages/spaces/SpaceList'
import { PageList } from './pages/pages/PageList'
import { CommentList } from './pages/comments/CommentList'
import { PluginList } from './pages/plugins/PluginList'
import { PluginReports } from './pages/plugins/PluginReports'
import { AISettings } from './pages/ai/AISettings'
import { AiUsage } from './pages/ai/AiUsage'
import { LogList } from './pages/audit/LogList'
import { SystemSettings } from './pages/settings/SystemSettings'
import { SubscriptionUsers } from './pages/membership/SubscriptionUsers'
import { MembershipLevels } from './pages/membership/MembershipLevels'
// 运营模块
import { OpsHome } from './pages/ops/OpsHome'
import { OpsDashboard } from './pages/ops/OpsDashboard'
import { LandingContent } from './pages/ops/LandingContent'
import { Subscribers } from './pages/ops/Subscribers'
import { ChannelLinks } from './pages/ops/ChannelLinks'
import { ChangelogAdmin } from './pages/ops/ChangelogAdmin'
import { SeoSettings } from './pages/ops/SeoSettings'
import { Goals } from './pages/ops/Goals'
import { Funnels } from './pages/ops/Funnels'
import { EventDictionary } from './pages/ops/EventDictionary'
import { DataQuality } from './pages/ops/DataQuality'
import { OpsAudit } from './pages/ops/OpsAudit'
import { Sections } from './pages/ops/Sections'
import { Promotions } from './pages/ops/Promotions'
import { Assets } from './pages/ops/Assets'
import { Audience } from './pages/ops/Audience'
import { Experiments } from './pages/ops/Experiments'
import { MarketOps } from './pages/ops/MarketOps'
import { Campaigns } from './pages/ops/Campaigns'
import { CampaignPages } from './pages/ops/CampaignPages'
import { Alerts } from './pages/ops/Alerts'
import { Referrals } from './pages/ops/Referrals'
import { DataExport } from './pages/ops/DataExport'
import { isOperatorLoggedIn, getAuthUser } from './lib/auth'
import { can, OPS_READ_CODES } from './lib/permissions'

const RequireAuth = ({ children }: { children: React.ReactNode }) => {
  if (!isOperatorLoggedIn()) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}

/**
 * 路由级权限守卫：导航隐藏不等于不能访问，直接改 hash 同样要被拦下。
 * 无权限时回到仪表盘，避免白屏。
 */
const RequirePermission = ({ codes, children }: { codes: string[]; children: React.ReactNode }) => {
  if (!can(getAuthUser(), ...codes)) {
    return <Navigate to="/dashboard" replace />
  }
  return <>{children}</>
}

/** 运营页统一走运营读权限守卫。 */
const ops = (element: React.ReactNode) => <RequirePermission codes={OPS_READ_CODES}>{element}</RequirePermission>

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
            <Route path="plugin-reports" element={<PluginReports />} />
            <Route path="ai" element={<AISettings />} />
            <Route path="ai-usage" element={<AiUsage />} />
            <Route path="logs" element={<LogList />} />
            <Route path="settings" element={<SystemSettings />} />
            <Route path="subscription" element={<SubscriptionUsers />} />
            <Route path="subscription/levels" element={<MembershipLevels />} />

            {/* 运营 · 洞察 */}
            <Route path="ops/home" element={ops(<OpsHome />)} />
            <Route path="ops/dashboard" element={ops(<OpsDashboard />)} />
            <Route path="ops/goals" element={ops(<Goals />)} />
            <Route path="ops/funnels" element={ops(<Funnels />)} />
            <Route path="ops/alerts" element={ops(<Alerts />)} />

            {/* 运营 · 内容 */}
            <Route path="ops/content" element={ops(<LandingContent />)} />
            <Route path="ops/seo" element={ops(<SeoSettings />)} />
            <Route path="ops/sections" element={ops(<Sections />)} />
            <Route path="ops/promotions" element={ops(<Promotions />)} />
            <Route path="ops/assets" element={ops(<Assets />)} />

            {/* 运营 · 转化 */}
            <Route path="ops/subscribers" element={ops(<Subscribers />)} />
            <Route path="ops/audience" element={ops(<Audience />)} />
            <Route path="ops/links" element={ops(<ChannelLinks />)} />
            <Route path="ops/referrals" element={ops(<Referrals />)} />
            <Route path="ops/campaigns" element={ops(<Campaigns />)} />
            <Route path="ops/campaign-pages" element={ops(<CampaignPages />)} />

            {/* 运营 · 实验与治理 */}
            <Route path="ops/experiments" element={ops(<Experiments />)} />
            <Route path="ops/events" element={ops(<EventDictionary />)} />
            <Route path="ops/data-quality" element={ops(<DataQuality />)} />
            <Route path="ops/audit" element={ops(<OpsAudit />)} />
            <Route path="ops/export" element={ops(<DataExport />)} />

            {/* 运营 · 生态 */}
            <Route path="ops/market" element={ops(<MarketOps />)} />
            <Route path="ops/changelog" element={ops(<ChangelogAdmin />)} />

            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
      </HashRouter>
      <Toaster />
    </ThemeProvider>
  )
}
