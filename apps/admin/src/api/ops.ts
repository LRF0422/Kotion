/**
 * 落地页运营接口（knowledge-system /admin/ops/*）。
 * 读操作需 platform.dashboard.read，写操作需 platform.settings.manage。
 */
import { del, get, patch, post, put, type PageResult } from '@/lib/request'

const BASE = '/knowledge-system/admin/ops'

export interface OpsOverview {
  pageviews: number
  events: number
  visitors: number
  sessions: number
  newVisitors: number
  bounces: number
  bounceRate: number
  avgDurationMs: number
  days: number
}

export interface OpsTrendPoint {
  date: string
  pageviews: number
  events: number
  visitors: number
  sessions: number
}

export interface OpsPageRank { path: string; pageviews: number; visitors: number }
export interface OpsEventRank { name: string; count: number; visitors: number }
export interface OpsChannel { source: string; medium: string; campaign: string; visitors: number; sessions: number; pageviews: number }
export interface OpsReferrer { referrer: string; visitors: number; pageviews: number }
export interface OpsBreakdown { label: string; visitors: number }
export interface OpsPropCount { label: string; count: number; visitors: number }

export interface OpsSession {
  id: string
  visitorId: string
  landingPath?: string
  referrer?: string
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  device?: string
  browser?: string
  os?: string
  language?: string
  firstSeen?: string
  lastSeen?: string
  pageviews?: number
  events?: number
}

export interface OpsFunnelStep {
  index: number
  label: string
  type: 'event' | 'path'
  sessions: number
  visitors: number
  rateFromFirst: number
  rateFromPrevious: number
}

export interface OpsRealtime {
  minutes: number
  visitors: number
  sessions: number
  pageviews: number
  paths: OpsPageRank[]
}

export interface OpsTech {
  device: OpsBreakdown[]
  browser: OpsBreakdown[]
  os: OpsBreakdown[]
}

export interface OpsContent {
  id?: number
  contentKey: string
  locale: string
  contentVersion: number
  updatedBy?: string | null
  publishedAt?: string | null
  published?: Record<string, unknown> | null
  draft?: Record<string, unknown>
}

export interface OpsContentRevision {
  id: number
  contentVersion: number
  note?: string
  createTime?: string
  createdBy?: string
}

export interface OpsSubscriber {
  id: number
  email: string
  status: string
  sourcePath?: string
  referrer?: string
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  note?: string
  createTime?: string
}

export interface OpsLink {
  id: number
  slug: string
  target: string
  label?: string
  channel?: string
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  utmContent?: string
  clicks: number
  enabled: boolean
  createTime?: string
}

export interface OpsChangelog {
  id: string
  releaseId?: string
  tag?: string
  name?: string
  body?: string
  url?: string
  author?: string
  prerelease?: boolean
  pinned?: boolean
  hidden?: boolean
  /** 后端为 LocalDateTime，序列化为 ISO 字符串 */
  publishedAt?: string
}

export interface OpsLinkStatsPoint { date: string; clicks: number }

// ---------- 统计 ----------

export const getOpsOverview = (days = 30) => get<OpsOverview>(`${BASE}/stats/overview`, { days })
export const getOpsTimeseries = (days = 30) => get<OpsTrendPoint[]>(`${BASE}/stats/timeseries`, { days })
export const getOpsPages = (days = 30, limit = 20) => get<OpsPageRank[]>(`${BASE}/stats/pages`, { days, limit })
export const getOpsEvents = (days = 30, limit = 30) => get<OpsEventRank[]>(`${BASE}/stats/events`, { days, limit })
export const getOpsChannels = (days = 30, limit = 20) => get<OpsChannel[]>(`${BASE}/stats/channels`, { days, limit })
export const getOpsReferrers = (days = 30, limit = 20) => get<OpsReferrer[]>(`${BASE}/stats/referrers`, { days, limit })
export const getOpsTech = (days = 30) => get<OpsTech>(`${BASE}/stats/tech`, { days })
export const getOpsEventProps = (name: string, key: string, days = 30, limit = 30) =>
  get<OpsPropCount[]>(`${BASE}/stats/event-props`, { name, key, days, limit })
export const getOpsRealtime = (minutes = 30) => get<OpsRealtime>(`${BASE}/stats/realtime`, { minutes })
export const getOpsSessions = (limit = 50) => get<OpsSession[]>(`${BASE}/stats/sessions`, { limit })
export const postOpsFunnel = (payload: { days?: number; steps: { type: 'event' | 'path'; value: string }[] }) =>
  post<{ steps: unknown[]; result: OpsFunnelStep[] }>(`${BASE}/stats/funnel`, payload)

// ---------- 文案 CMS ----------

export const getOpsContentList = (locale?: string) => get<OpsContent[]>(`${BASE}/content`, { locale })
export const getOpsContent = (key: string, locale: string) =>
  get<OpsContent>(`${BASE}/content/${encodeURIComponent(key)}`, { locale })
export const saveOpsContentDraft = (key: string, locale: string, draft: Record<string, unknown>) =>
  put<OpsContent>(`${BASE}/content/${encodeURIComponent(key)}`, { locale, draft })
export const publishOpsContent = (key: string, locale: string, note?: string) =>
  post<OpsContent>(`${BASE}/content/${encodeURIComponent(key)}/publish`, { locale, note })
export const getOpsContentRevisions = (key: string, locale: string) =>
  get<OpsContentRevision[]>(`${BASE}/content/${encodeURIComponent(key)}/revisions`, { locale })
export const rollbackOpsContent = (key: string, locale: string, version: number) =>
  post<OpsContent>(`${BASE}/content/${encodeURIComponent(key)}/rollback`, { locale, version })

// ---------- 订阅线索 ----------

export const getOpsSubscribers = (params: { current: number; size: number; status?: string; search?: string }) =>
  get<PageResult<OpsSubscriber>>(`${BASE}/subscribers`, params)
export const updateOpsSubscriber = (id: number, payload: { status?: string; note?: string }) =>
  patch<void>(`${BASE}/subscribers/${id}`, payload)
export const deleteOpsSubscriber = (id: number) => del<void>(`${BASE}/subscribers/${id}`)
export const getOpsSubscribersExportUrl = () => `/api${BASE}/subscribers/export`

// ---------- 渠道短链 ----------

export const getOpsLinks = () => get<OpsLink[]>(`${BASE}/links`)
export const createOpsLink = (payload: {
  slug?: string
  target: string
  label?: string
  channel?: string
  enabled?: boolean
  utm?: Record<string, string>
}) => post<OpsLink>(`${BASE}/links`, payload)
export const updateOpsLink = (id: number, payload: Record<string, unknown>) =>
  put<OpsLink>(`${BASE}/links/${id}`, payload)
export const deleteOpsLink = (id: number) => del<void>(`${BASE}/links/${id}`)
export const getOpsLinkStats = (slug: string, days = 30) =>
  get<OpsLinkStatsPoint[]>(`${BASE}/links/${encodeURIComponent(slug)}/stats`, { days })

// ---------- 更新日志 ----------

export const getOpsChangelog = () => get<OpsChangelog[]>(`${BASE}/changelog`)
export const refreshOpsChangelog = () => post<{ count: number }>(`${BASE}/changelog/refresh`)
export const updateOpsChangelog = (id: string, payload: { pinned?: boolean; hidden?: boolean }) =>
  patch<void>(`${BASE}/changelog/${id}`, payload)

// ---------- 设置 ----------

export const getOpsSettings = () => get<Record<string, string>>(`${BASE}/settings`)
export const saveOpsSettings = (payload: Record<string, string>) =>
  put<{ count: number }>(`${BASE}/settings`, payload)
