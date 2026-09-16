/**
 * 落地页运营接口（knowledge-system /admin/ops/*）。
 *
 * 权限：读操作 `platform.landing.read`（过渡期兼容 `platform.dashboard.read`），
 *      写操作 `platform.landing.manage`（过渡期兼容 `platform.settings.manage`）。
 *
 * 分页口径：本模块统一 `current` + `size`，响应为 `PageResult<T>`。
 * 表结构见 backend/knowledgecloud/script/migration/V31~V34__landing_ops*.sql，
 * 规划见 docs/OPERATIONS_PLAN.md。
 */
import { del, get, patch, post, put, type PageResult } from '@/lib/request'

const BASE = '/knowledge-system/admin/ops'

// ============================================================
// 类型
// ============================================================

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

export interface OpsContentCoverage {
  locale: string
  totalKeys: number
  translatedKeys: number
  missingKeys: string[]
  orphanKeys: string[]
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
  tags?: string
  confirmedAt?: string
  createTime?: string
  tagIds?: number[]
}

export interface OpsLink {
  id: number
  slug: string
  target: string
  label?: string
  channel?: string
  groupName?: string
  position?: number
  remark?: string
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

// ---------- P0 新增 ----------

export interface OpsAudit {
  id: number
  operator?: string
  action: string
  targetType: string
  targetKey?: string
  summary?: string
  detail?: string
  clientIp?: string
  createTime?: string
}

export interface OpsFilterRule {
  id?: number
  ruleName?: string
  ruleType: 'IP' | 'IP_PREFIX' | 'UA' | 'VISITOR' | 'PATH' | 'EMAIL_DOMAIN'
  pattern: string
  action: 'EXCLUDE' | 'INCLUDE'
  enabled: boolean
  remark?: string
}

export interface OpsEventDict {
  id?: number
  eventName: string
  category: string
  description?: string
  propsSchema?: string
  status: 'REGISTERED' | 'DEPRECATED'
  owner?: string
}

export interface OpsEventDictCoverage {
  registered: string[]
  observed: OpsEventRank[]
  /** 前端已上报但字典里没有的事件 */
  unknown: string[]
  /** 字典里注册但近 N 天没有任何数据的事件 */
  silent: string[]
}

export interface OpsGoal {
  id?: number
  goalKey: string
  name: string
  stepType: 'EVENT' | 'PATH'
  stepValue: string
  description?: string
  enabled: boolean
  position: number
}

export interface OpsGoalStat {
  goalKey: string
  name: string
  conversions: number
  visitors: number
  sessions: number
  totalVisitors: number
  conversionRate: number
  previousConversions: number
  changePct: number
}

export interface OpsFunnelStepDef {
  label: string
  type: 'event' | 'path'
  value: string
}

export interface OpsFunnelDef {
  id?: number
  funnelKey: string
  name: string
  steps: OpsFunnelStepDef[]
  description?: string
  enabled: boolean
  position: number
}

export interface OpsFunnelStats {
  funnelKey: string
  name: string
  steps: OpsFunnelStep[]
}

// ---------- P1 新增 ----------

export type OpsResourceKind =
  | 'SEO'
  | 'SECTION'
  | 'PROMOTION'
  | 'ASSET'
  | 'NAV'
  /** 模板 / 插件精选位（resKey = `template:<id>` 或 `plugin:<id>`） */
  | 'FEATURED'
  | 'EMAIL_TEMPLATE'
  | 'AUDIENCE'
  | 'CAMPAIGN_PAGE'

export interface OpsResource {
  id?: number
  resKind: OpsResourceKind
  resKey: string
  locale: string
  payload?: Record<string, unknown> | null
  status: 'DRAFT' | 'PUBLISHED' | 'OFFLINE'
  position: number
  enabled: boolean
  startTime?: string | null
  endTime?: string | null
  remark?: string
  updateTime?: string
}

/** 精选位 payload（resKind = FEATURED，resKey = `template:<id>` / `plugin:<id>`）。 */
export interface OpsFeaturedPayload {
  targetType: 'template' | 'plugin'
  targetId: string
  name?: string
  badge?: string
  blurb?: string
}

/** SEO 资源 payload（resKind = SEO，resKey = 路径）。 */
export interface OpsSeoPayload {
  title?: string
  description?: string
  keywords?: string
  canonical?: string
  robots?: string
  ogImage?: string
  ogTitle?: string
  ogDescription?: string
  jsonLd?: string
}

/** 首页区块编排 payload（resKind = SECTION，resKey = 页面 key，如 home）。 */
export interface OpsSectionPayload {
  sectionKey: string
  position?: number
  props?: Record<string, unknown>
}

/** 推广位 payload（resKind = PROMOTION，resKey = 推广位 id）。 */
export interface OpsPromotionPayload {
  type: 'announcement' | 'exit_intent' | 'sticky_cta'
  title?: string
  body?: string
  ctaLabel?: string
  ctaHref?: string
  pages?: string[]
  /** 同一访客展示上限，0 表示不限 */
  frequency?: number
  theme?: 'default' | 'accent' | 'warn'
}

/** 素材 payload（resKind = ASSET，resKey = 素材 key）。 */
export interface OpsAssetPayload {
  url: string
  name?: string
  mime?: string
  width?: number
  height?: number
  /** OG 图建议 1200×630 */
  usage?: string
}

export interface OpsExperimentVariant {
  id?: number
  variantKey: string
  name?: string
  weight: number
  isControl: boolean
  payload?: Record<string, unknown> | null
  position?: number
}

export interface OpsExperiment {
  id?: number
  expKey: string
  name: string
  hypothesis?: string
  status: 'DRAFT' | 'RUNNING' | 'PAUSED' | 'FINISHED'
  trafficSplit: number
  metricEvent: string
  guardrailNote?: string
  startTime?: string | null
  endTime?: string | null
  variants?: OpsExperimentVariant[]
}

export interface OpsExperimentVariantResult {
  variantKey: string
  name?: string
  isControl: boolean
  exposures: number
  conversions: number
  conversionRate: number
  /** 相对对照组的提升百分比 */
  lift: number
  /** 优于对照组的概率（0-100，近似） */
  probabilityToBeatControl: number
}

export interface OpsExperimentResults {
  expKey: string
  metricEvent: string
  variants: OpsExperimentVariantResult[]
}

export interface OpsTag {
  id?: number
  tag: string
  color?: string
  description?: string
}

// ---------- P2 新增 ----------

export interface OpsCampaign {
  id?: number
  name: string
  subject: string
  preheader?: string
  templateKey?: string | null
  bodyHtml?: string
  audience?: OpsAudienceSelector | null
  status: 'DRAFT' | 'SCHEDULED' | 'SENDING' | 'SENT' | 'FAILED' | 'CANCELLED'
  scheduledAt?: string | null
  startedAt?: string | null
  finishedAt?: string | null
  totalCount: number
  sentCount: number
  failedCount: number
  openCount: number
  clickCount: number
  unsubscribeCount: number
  testEmail?: string | null
  createTime?: string
}

export interface OpsAudienceSelector {
  status?: string
  tags?: string[]
  utmSource?: string
  days?: number
}

export interface OpsCampaignSend {
  id: number
  campaignId: number
  email: string
  status: string
  error?: string
  sentAt?: string
  openedAt?: string
  clickedAt?: string
}

export interface OpsCampaignPreview {
  total: number
  sample: string[]
}

export interface OpsAlertRule {
  id?: number
  name: string
  metric: 'CONVERSIONS' | 'VISITORS' | 'PAGEVIEWS' | 'COLLECT_SILENCE' | 'LINK_CLICKS' | 'GOAL_RATE'
  goalKey?: string | null
  comparator: 'LT' | 'LTE' | 'GT' | 'GTE' | 'DROP_PCT'
  threshold: number
  windowMinutes: number
  lookbackDays: number
  channels: string
  webhookUrl?: string | null
  enabled: boolean
  lastTriggeredAt?: string | null
}

export interface OpsAlertEvent {
  id: number
  ruleId?: number
  ruleName?: string
  metric?: string
  metricValue?: number
  threshold?: number
  level: string
  message?: string
  createTime?: string
}

export interface OpsReferral {
  id?: number
  code: string
  ownerType: 'USER' | 'PARTNER' | 'CAMPAIGN'
  ownerId?: string
  ownerName?: string
  target: string
  clicks: number
  signups: number
  activations: number
  enabled: boolean
  createTime?: string
}

export interface OpsWorkbench {
  pendingDrafts: number
  newSubscribers: number
  runningExperiments: number
  openAlerts: number
  expiringPromotions: number
  unreviewedChangelog: number
  totals: {
    visitors: number
    conversions: number
    conversionRate: number
    changePct: number
  }
}

export interface OpsDataQuality {
  /** 采样率 0-100 */
  sampleRate: number
  filterEnabled: boolean
  excludedEvents: number
  dataNote?: string
  filters: OpsFilterRule[]
}

// ============================================================
// 统计（V31）
// ============================================================

export const getOpsOverview = (days = 30) => get<OpsOverview>(`${BASE}/stats/overview`, { days })
export const getOpsTimeseries = (days = 30, compare = false) =>
  get<OpsTrendPoint[]>(`${BASE}/stats/timeseries`, { days, compare })
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

// ============================================================
// 文案 CMS（V31）
// ============================================================

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

/** 从内置 resources.ts 导入线上文案，生成草稿（P1-5）。 */
export const importOpsContent = (payload: { locale: string; entries: Record<string, string>; overwrite?: boolean }) =>
  post<{ imported: number; skipped: number }>(`${BASE}/content/import`, payload)

/** 文案覆盖率：已翻译 / 缺失 / 多余（P1-5）。 */
export const getOpsContentCoverage = (locale: string, keys?: string[]) =>
  post<OpsContentCoverage>(`${BASE}/content/coverage`, { locale, keys })

/** 预览令牌：拿到可直接打开的草稿预览链接（P1-5）。 */
export const createOpsContentPreview = (payload: { locale: string; ttlMinutes?: number }) =>
  post<{ token: string; url: string; expiresAt: string }>(`${BASE}/content/preview-token`, payload)

// ============================================================
// 订阅线索（V31 + P1-10）
// ============================================================

export const getOpsSubscribers = (params: {
  current: number
  size: number
  status?: string
  search?: string
  tagId?: number
  utmSource?: string
  days?: number
}) => get<PageResult<OpsSubscriber>>(`${BASE}/subscribers`, params)
export const updateOpsSubscriber = (id: number, payload: { status?: string; note?: string }) =>
  patch<void>(`${BASE}/subscribers/${id}`, payload)
export const deleteOpsSubscriber = (id: number) => del<void>(`${BASE}/subscribers/${id}`)
export const getOpsSubscribersExportUrl = (params?: { status?: string; tagId?: number; utmSource?: string; search?: string }) => {
  const query = new URLSearchParams()
  if (params?.status) query.set('status', params.status)
  if (params?.tagId) query.set('tagId', String(params.tagId))
  if (params?.utmSource) query.set('utmSource', params.utmSource)
  if (params?.search) query.set('search', params.search)
  const suffix = query.toString()
  return `/api${BASE}/subscribers/export${suffix ? `?${suffix}` : ''}`
}
/** CSV 文本导入，去重后返回结果（P1-10）。 */
export const importOpsSubscribers = (payload: { csv: string; source?: string; status?: string }) =>
  post<{ imported: number; duplicated: number; invalid: number }>(`${BASE}/subscribers/import`, payload)
/** 批量状态流转（P1-10）。 */
export const batchUpdateOpsSubscribers = (payload: { ids: number[]; status?: string; note?: string }) =>
  post<{ updated: number }>(`${BASE}/subscribers/batch`, payload)
/** 给订阅者打标（P1-10）。 */
export const setOpsSubscriberTags = (id: number, tagIds: number[]) =>
  put<{ count: number }>(`${BASE}/subscribers/${id}/tags`, { tagIds })
/** 标签 CRUD。 */
export const getOpsTags = () => get<OpsTag[]>(`${BASE}/tags`)
export const createOpsTag = (payload: { tag: string; color?: string; description?: string }) =>
  post<OpsTag>(`${BASE}/tags`, payload)
export const updateOpsTag = (id: number, payload: { tag?: string; color?: string; description?: string }) =>
  put<OpsTag>(`${BASE}/tags/${id}`, payload)
export const deleteOpsTag = (id: number) => del<void>(`${BASE}/tags/${id}`)

// ============================================================
// 渠道短链（V31 + P1-9）
// ============================================================

export const getOpsLinks = (params?: { channel?: string; groupName?: string; enabled?: boolean }) =>
  get<OpsLink[]>(`${BASE}/links`, params)
export const createOpsLink = (payload: {
  slug?: string
  target: string
  label?: string
  channel?: string
  groupName?: string
  enabled?: boolean
  utm?: Record<string, string>
}) => post<OpsLink>(`${BASE}/links`, payload)
/**
 * 更新短链。
 *
 * 后端 `LandingLinkDTO` 期望 **嵌套** 的 `utm: { source, medium, campaign, content }`，
 * 而调用方习惯传扁平的 `utmSource/utmMedium/...`。这里统一归一化，
 * 两种写法都能生效，避免前后端形状不一致导致的静默失效。
 */
export const updateOpsLink = (id: number, payload: Record<string, unknown>) => {
  const {
    utmSource, utmMedium, utmCampaign, utmContent,
    ...rest
  } = payload as {
    utmSource?: string
    utmMedium?: string
    utmCampaign?: string
    utmContent?: string
    [key: string]: unknown
  }
  const nested = rest.utm as Record<string, string> | undefined
  const utm = nested ?? {
    source: utmSource as string,
    medium: utmMedium as string,
    campaign: utmCampaign as string,
    content: utmContent as string,
  }
  const hasUtm = Object.values(utm).some((value) => value !== undefined && value !== null && value !== '')
  return put<OpsLink>(`${BASE}/links/${id}`, hasUtm ? { ...rest, utm } : rest)
}
export const deleteOpsLink = (id: number) => del<void>(`${BASE}/links/${id}`)
export const getOpsLinkStats = (slug: string, days = 30) =>
  get<OpsLinkStatsPoint[]>(`${BASE}/links/${encodeURIComponent(slug)}/stats`, { days })
/** 批量导入短链（P1-9）。 */
export const importOpsLinks = (payload: { csv: string }) =>
  post<{ imported: number; skipped: number }>(`${BASE}/links/import`, payload)
/** 短链点击 → 目标转化的对比（P1-9）。 */
export const getOpsLinkConversions = (days = 30) =>
  get<Array<{ slug: string; label?: string; channel?: string; clicks: number; visitors: number; conversions: number; conversionRate: number }>>(
    `${BASE}/links/conversions`,
    { days },
  )

// ============================================================
// 更新日志（V31 + P2）
// ============================================================

export const getOpsChangelog = () => get<OpsChangelog[]>(`${BASE}/changelog`)
export const refreshOpsChangelog = () => post<{ count: number }>(`${BASE}/changelog/refresh`)
export const updateOpsChangelog = (id: string, payload: { pinned?: boolean; hidden?: boolean }) =>
  patch<void>(`${BASE}/changelog/${id}`, payload)
/** 把某条 Release 作为邮件活动草稿（P2-2 自动化）。 */
export const notifyOpsChangelog = (id: string) =>
  post<OpsCampaign>(`${BASE}/changelog/${id}/notify`)

// ============================================================
// 设置（V31）
// ============================================================

export const getOpsSettings = () => get<Record<string, string>>(`${BASE}/settings`)
export const saveOpsSettings = (payload: Record<string, string>) =>
  put<{ count: number }>(`${BASE}/settings`, payload)
/** 数据口径与流量过滤（P0-4）。 */
export const getOpsDataQuality = () => get<OpsDataQuality>(`${BASE}/data-quality`)
export const saveOpsDataQuality = (payload: { sampleRate?: number; filterEnabled?: boolean; dataNote?: string }) =>
  put<OpsDataQuality>(`${BASE}/data-quality`, payload)

// ============================================================
// 审计（P0-3）
// ============================================================

export const getOpsAudit = (params: {
  current: number
  size: number
  action?: string
  targetType?: string
  operator?: string
  startTime?: string
  endTime?: string
}) => get<PageResult<OpsAudit>>(`${BASE}/audit`, params)

// ============================================================
// 流量过滤规则（P0-4）
// ============================================================

export const getOpsFilterRules = () => get<OpsFilterRule[]>(`${BASE}/filters`)
export const createOpsFilterRule = (payload: OpsFilterRule) => post<OpsFilterRule>(`${BASE}/filters`, payload)
export const updateOpsFilterRule = (id: number, payload: OpsFilterRule) =>
  put<OpsFilterRule>(`${BASE}/filters/${id}`, payload)
export const deleteOpsFilterRule = (id: number) => del<void>(`${BASE}/filters/${id}`)

// ============================================================
// 事件字典（P0-5）
// ============================================================

export const getOpsEventDict = () => get<OpsEventDict[]>(`${BASE}/event-dict`)
export const createOpsEventDict = (payload: OpsEventDict) => post<OpsEventDict>(`${BASE}/event-dict`, payload)
export const updateOpsEventDict = (id: number, payload: OpsEventDict) =>
  put<OpsEventDict>(`${BASE}/event-dict/${id}`, payload)
export const deleteOpsEventDict = (id: number) => del<void>(`${BASE}/event-dict/${id}`)
/** 已注册 / 已收到 / 未注册 / 静默 四类对比（P0-5）。 */
export const getOpsEventDictCoverage = (days = 30) =>
  get<OpsEventDictCoverage>(`${BASE}/event-dict/coverage`, { days })
/** 用前端字典批量同步（幂等，只新增缺失项）。 */
export const syncOpsEventDict = (payload: { events: Array<{ eventName: string; category?: string; description?: string }> }) =>
  post<{ created: number; existing: number }>(`${BASE}/event-dict/sync`, payload)

// ============================================================
// 转化目标（P0-6）
// ============================================================

export const getOpsGoals = () => get<OpsGoal[]>(`${BASE}/goals`)
export const createOpsGoal = (payload: OpsGoal) => post<OpsGoal>(`${BASE}/goals`, payload)
export const updateOpsGoal = (id: number, payload: OpsGoal) => put<OpsGoal>(`${BASE}/goals/${id}`, payload)
export const deleteOpsGoal = (id: number) => del<void>(`${BASE}/goals/${id}`)
export const getOpsGoalStats = (days = 30) => get<OpsGoalStat[]>(`${BASE}/goals/stats`, { days })

// ============================================================
// 保存漏斗（P0-7）
// ============================================================

export const getOpsFunnels = () => get<OpsFunnelDef[]>(`${BASE}/funnels`)
export const createOpsFunnel = (payload: OpsFunnelDef) => post<OpsFunnelDef>(`${BASE}/funnels`, payload)
export const updateOpsFunnel = (id: number, payload: OpsFunnelDef) => put<OpsFunnelDef>(`${BASE}/funnels/${id}`, payload)
export const deleteOpsFunnel = (id: number) => del<void>(`${BASE}/funnels/${id}`)
export const getOpsFunnelStats = (funnelKey: string, days = 30) =>
  get<OpsFunnelStats>(`${BASE}/funnels/${encodeURIComponent(funnelKey)}/stats`, { days })

// ============================================================
// 通用配置资源（P1）
// ============================================================

export const getOpsResources = (params: { kind: OpsResourceKind; locale?: string; status?: string }) =>
  get<OpsResource[]>(`${BASE}/resources`, params)
export const getOpsResource = (kind: OpsResourceKind, key: string, locale = 'zh') =>
  get<OpsResource>(`${BASE}/resources/${kind}/${encodeURIComponent(key)}`, { locale })
/** 按 (kind, key, locale) upsert。 */
export const saveOpsResource = (kind: OpsResourceKind, key: string, payload: Partial<OpsResource>) =>
  put<OpsResource>(`${BASE}/resources/${kind}/${encodeURIComponent(key)}`, payload)
export const deleteOpsResource = (kind: OpsResourceKind, key: string, locale = 'zh') =>
  del<void>(`${BASE}/resources/${kind}/${encodeURIComponent(key)}`, { locale })
/** 批量 upsert：区块排序 / 批量发布用。 */
export const saveOpsResourceBatch = (kind: OpsResourceKind, items: Array<Partial<OpsResource>>) =>
  post<{ count: number }>(`${BASE}/resources/${kind}/batch`, { items })

// ============================================================
// 实验（P1-8）
// ============================================================

export const getOpsExperiments = () => get<OpsExperiment[]>(`${BASE}/experiments`)
export const createOpsExperiment = (payload: OpsExperiment) => post<OpsExperiment>(`${BASE}/experiments`, payload)
export const updateOpsExperiment = (id: number, payload: OpsExperiment) =>
  put<OpsExperiment>(`${BASE}/experiments/${id}`, payload)
export const deleteOpsExperiment = (id: number) => del<void>(`${BASE}/experiments/${id}`)
export const saveOpsExperimentVariants = (id: number, variants: OpsExperimentVariant[]) =>
  put<OpsExperiment>(`${BASE}/experiments/${id}/variants`, { variants })
export const getOpsExperimentResults = (expKey: string, days = 30) =>
  get<OpsExperimentResults>(`${BASE}/experiments/${encodeURIComponent(expKey)}/results`, { days })

// ============================================================
// 运营工作台（P2-5）
// ============================================================

export const getOpsWorkbench = (days = 7) => get<OpsWorkbench>(`${BASE}/workbench`, { days })

// ============================================================
// 邮件活动（P2-2）
// ============================================================

export const getOpsCampaigns = (params?: { current: number; size: number; status?: string }) =>
  get<PageResult<OpsCampaign>>(`${BASE}/campaigns`, params)
export const getOpsCampaign = (id: number) => get<OpsCampaign>(`${BASE}/campaigns/${id}`)
export const createOpsCampaign = (payload: Partial<OpsCampaign>) => post<OpsCampaign>(`${BASE}/campaigns`, payload)
export const updateOpsCampaign = (id: number, payload: Partial<OpsCampaign>) =>
  put<OpsCampaign>(`${BASE}/campaigns/${id}`, payload)
export const deleteOpsCampaign = (id: number) => del<void>(`${BASE}/campaigns/${id}`)
/** 人群预估（发送前确认人数）。 */
export const previewOpsCampaignAudience = (payload: OpsAudienceSelector) =>
  post<OpsCampaignPreview>(`${BASE}/campaigns/audience-preview`, payload)
/** 给自己发一封测试邮件。 */
export const testOpsCampaign = (id: number, email: string) =>
  post<{ ok: boolean }>(`${BASE}/campaigns/${id}/test`, { email })
/** 立即发送。 */
export const sendOpsCampaign = (id: number) => post<{ queued: number }>(`${BASE}/campaigns/${id}/send`)
export const getOpsCampaignSends = (id: number, params: { current: number; size: number; status?: string }) =>
  get<PageResult<OpsCampaignSend>>(`${BASE}/campaigns/${id}/sends`, params)

// ============================================================
// 告警（P2-4）
// ============================================================

export const getOpsAlertRules = () => get<OpsAlertRule[]>(`${BASE}/alerts`)
export const createOpsAlertRule = (payload: OpsAlertRule) => post<OpsAlertRule>(`${BASE}/alerts`, payload)
export const updateOpsAlertRule = (id: number, payload: OpsAlertRule) => put<OpsAlertRule>(`${BASE}/alerts/${id}`, payload)
export const deleteOpsAlertRule = (id: number) => del<void>(`${BASE}/alerts/${id}`)
export const getOpsAlertEvents = (params: { current: number; size: number }) =>
  get<PageResult<OpsAlertEvent>>(`${BASE}/alerts/events`, params)
/** 手动触发一次巡检，便于验证规则。 */
export const runOpsAlertCheck = () => post<{ evaluated: number; triggered: number }>(`${BASE}/alerts/check`)

// ============================================================
// 推荐 / 邀请（P2-7）
// ============================================================

export const getOpsReferrals = () => get<OpsReferral[]>(`${BASE}/referrals`)
export const createOpsReferral = (payload: Partial<OpsReferral>) => post<OpsReferral>(`${BASE}/referrals`, payload)
export const updateOpsReferral = (id: number, payload: Partial<OpsReferral>) =>
  put<OpsReferral>(`${BASE}/referrals/${id}`, payload)
export const deleteOpsReferral = (id: number) => del<void>(`${BASE}/referrals/${id}`)

// ============================================================
// 导出（P2-8）
// ============================================================

export type OpsExportDataset = 'events' | 'sessions' | 'subscribers' | 'links' | 'goals' | 'audit'

export const getOpsExportUrl = (dataset: OpsExportDataset, params?: { days?: number; format?: 'csv' | 'json' }) => {
  const query = new URLSearchParams({ dataset })
  if (params?.days) query.set('days', String(params.days))
  if (params?.format) query.set('format', params.format)
  return `/api${BASE}/export?${query.toString()}`
}
