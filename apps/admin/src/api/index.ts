/**
 * 后端 API 定义：类型对齐 knowledge-system / knowledge-wiki / knowledge-log 的 VO/DTO。
 * 分页注意：system/log 模块用 current+size（Query），wiki 模块用 current+pageSize（PageDTO）。
 */
import { del, get, post, put, type PageResult } from '@/lib/request'

export type { PageResult }

// ---------- 认证 ----------

export interface AuthInfo {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
  userId: string
  tenantId: string
  avatar: string
  authority: string
  userName: string
  account: string
}

export const login = (account: string, password: string) =>
  post<AuthInfo>('/knowledge-auth/oauth2/token', undefined, {
    grantType: 'password',
    type: 'account',
    scope: 'all',
    account,
    password,
  })

// ---------- 用户（knowledge-system，current + size） ----------

export interface UserVO {
  id: string
  code?: string
  account: string
  name?: string
  realName?: string
  avatar?: string
  email?: string
  phone?: string
  sex?: number
  sexName?: string
  roleId?: string
  roleName?: string
  deptName?: string
  tenantId?: string
  isSetup?: boolean
  /** 1-正常 2-禁用（null 视为正常） */
  status?: number
}

export interface UserSubmitDTO {
  id?: string
  account?: string
  password?: string
  name?: string
  realName?: string
  email?: string
  phone?: string
  tenantId?: string
}

export const getUserInfo = () => get<UserVO>('/knowledge-system/user/info')

export const getUserList = (params: { current: number; size: number; searchValue?: string }) =>
  get<PageResult<UserVO>>('/knowledge-system/user/list', params)

export const submitUser = (user: UserSubmitDTO) => post<unknown>('/knowledge-system/user/submit', user)

export const removeUsers = (ids: string) => post<unknown>('/knowledge-system/user/remove', undefined, { ids })

export const grantUserRoles = (userIds: string, roleIds: string) =>
  post<unknown>('/knowledge-system/user/grant', undefined, { userIds, roleIds })

export const resetUserPassword = (userIds: string) =>
  post<unknown>('/knowledge-system/user/reset-password', undefined, { userIds })

export const enableUsers = (userIds: string) =>
  post<unknown>('/knowledge-system/user/enable', undefined, { userIds })

export const disableUsers = (userIds: string) =>
  post<unknown>('/knowledge-system/user/disable', undefined, { userIds })

// ---------- 角色（knowledge-system，current + pageSize） ----------

export interface RoleVO {
  id: string
  parentId?: string
  roleName: string
  roleAlias?: string
  sort?: number
  admin?: boolean
  userCount?: number
  parentName?: string
  permissions?: { id?: string; name?: string; code?: string }[]
  children?: RoleVO[]
}

export const getRoleList = (params: { current: number; pageSize: number; searchValue?: string }) =>
  get<PageResult<RoleVO>>('/knowledge-system/role/list', params)

export const getRoleTree = () => get<RoleVO[]>('/knowledge-system/role/tree')

export const submitRole = (role: { id?: string; roleName: string; roleAlias?: string; sort?: number }) =>
  post<unknown>('/knowledge-system/role/submit', role)

export const removeRoles = (ids: string) => post<unknown>('/knowledge-system/role/remove', undefined, { ids })

export const grantRole = (userId: string, roleId: string) =>
  post<unknown>('/knowledge-system/role/grant', undefined, { userId, roleId })

// ---------- 空间（knowledge-wiki，current + pageSize） ----------

export type SpaceType = 'TEMPLATE' | 'PERSONAL' | 'SPACE' | 'INNER' | 'JOURNAL' | 'COLLABORATION'

export interface SpaceVO {
  id: string
  userId?: string
  nickName?: string
  name: string
  status?: 'ACTIVE' | 'IN_ACTIVE'
  description?: string
  type?: SpaceType
  cover?: string
  visibility?: string
  archived?: boolean
  memberCount?: number
  createTime?: string
  updateTime?: string
}

export const getSpaceList = (params: {
  current: number
  pageSize: number
  searchValue?: string
  type?: SpaceType
}) => get<PageResult<SpaceVO>>('/knowledge-wiki/space/list', params)

// ---------- 空间后台治理（knowledge-wiki /admin/space） ----------

export interface SpaceMemberDTO {
  id: string
  name?: string
  email?: string
  avatar?: string
  role?: string
  joinedAt?: string
}

export interface AdminSpaceDetailVO {
  space: SpaceVO
  memberCount: number
  pageCount: number
}

export const getAdminSpaceDetail = (id: string) =>
  get<AdminSpaceDetailVO>(`/knowledge-wiki/admin/space/${id}/detail`)

export const getAdminSpaceMembers = (id: string) =>
  get<SpaceMemberDTO[]>(`/knowledge-wiki/admin/space/${id}/members`)

export const archiveSpace = (id: string) => put<unknown>(`/knowledge-wiki/admin/space/${id}/archive`)

export const unarchiveSpace = (id: string) => put<unknown>(`/knowledge-wiki/admin/space/${id}/unarchive`)

export const updateSpaceStatus = (id: string, status: 'ACTIVE' | 'IN_ACTIVE') =>
  put<unknown>(`/knowledge-wiki/admin/space/${id}/status`, undefined, { status })

// ---------- 页面（knowledge-wiki，current + pageSize） ----------

export type PageStatus = 'DRAFT' | 'ACTIVE' | 'TRASH' | 'DELETED'

export interface PageVO {
  id: string
  title?: string
  description?: string
  spaceId?: string
  parentId?: string
  status?: PageStatus
  isTemplate?: boolean
  draft?: boolean
  createUser?: string
  updateUser?: string
  createTime?: string
  updateTime?: string
}

export const getPageList = (params: {
  current: number
  pageSize: number
  searchValue?: string
  status?: PageStatus
  spaceId?: string
}) => get<PageResult<PageVO>>('/knowledge-wiki/space/page/list', params)

export const restorePage = (id: string) => put<unknown>(`/knowledge-wiki/space/page/${id}/restore`)

// ---------- 页面后台治理（knowledge-wiki /admin/page） ----------

export const getAdminPageList = (params: {
  current: number
  pageSize: number
  searchValue?: string
  status?: PageStatus
  spaceId?: string
  createUser?: string
  startTime?: string
  endTime?: string
}) => get<PageResult<PageVO>>('/knowledge-wiki/admin/page/list', params)

export const batchRestorePages = (ids: string) =>
  post<unknown>('/knowledge-wiki/admin/page/batch-restore', undefined, { ids })

export const batchDeletePages = (ids: string) =>
  del<unknown>('/knowledge-wiki/admin/page/batch', { ids })

// ---------- 评论（knowledge-wiki，current + pageSize） ----------

export interface PageCommentDTO {
  id: string
  pageId: string
  pageTitle?: string
  userId: string
  userName?: string
  userAvatar?: string
  content: string
  parentId?: string
  resolved?: boolean
  createdAt?: string
  updatedAt?: string
}

export const getCommentList = (params: {
  current: number
  pageSize: number
  searchValue?: string
  resolved?: boolean
}) => get<PageResult<PageCommentDTO>>('/knowledge-wiki/comment/list', params)

export const deleteComment = (id: string) => del<unknown>(`/knowledge-wiki/comment/${id}`)

export const toggleCommentResolved = (id: string) => put<unknown>(`/knowledge-wiki/comment/${id}/resolve`)

// ---------- 插件（knowledge-wiki，current + pageSize） ----------

export type PluginCategory = 'FEATURE' | 'APP' | 'CONNECTOR'
export type PluginStatus = 'PENDING' | 'IN_PROGRESS' | 'REJECTED' | 'DONE'

export interface PluginVO {
  id: string
  name: string
  description?: string
  developer?: string
  icon?: string
  pluginKey?: string
  status?: PluginStatus
  installCtn?: number
  favoriteCtn?: number
  maintainer?: string
  category?: PluginCategory
  installedVersion?: string
  currentVersion?: { id?: string; version?: string; updateTime?: string }
  rating?: number
  downloads?: number
}

export const getPluginList = (params: {
  current: number
  pageSize: number
  searchValue?: string
  category?: PluginCategory
}) => get<PageResult<PluginVO>>('/knowledge-wiki/plugin', params)

// ---------- 日志（knowledge-log，current + size） ----------

export interface LogVO {
  strId?: string
  serviceId?: string
  serverIp?: string
  remoteIp?: string
  userAgent?: string
  requestUri?: string
  method?: string
  methodName?: string
  params?: string
  time?: string
  createBy?: string
  createTime?: string
  // usual
  logLevel?: string
  logId?: string
  logData?: string
  // api
  type?: string
  title?: string
  // error
  exceptionName?: string
  message?: string
  stackTrace?: string
}

export type LogKind = 'usual' | 'api' | 'error'

export const getLogList = (kind: LogKind, params: { current: number; size: number }) =>
  get<PageResult<LogVO>>(`/knowledge-log/${kind}/list`, params)

// ---------- 登录日志（knowledge-log，current + size） ----------

export interface LoginLogVO {
  id: string
  tenantId?: string
  account?: string
  userId?: string
  /** 1-成功 0-失败 */
  success?: number
  failReason?: string
  remoteIp?: string
  userAgent?: string
  createTime?: string
}

export const getLoginLogList = (params: {
  current: number
  size: number
  account?: string
  success?: number
  userId?: string
}) => get<PageResult<LoginLogVO>>('/knowledge-log/login/list', params)

// ---------- 运营统计（knowledge-system / knowledge-wiki /admin/stats） ----------

export interface DailyCount {
  date: string
  value: number
}

export const getUserRegistrationTrend = (days = 30) =>
  get<DailyCount[]>('/knowledge-system/admin/stats/user-registrations', { days })

export const getDauTrend = (days = 30) => get<DailyCount[]>('/knowledge-system/admin/stats/dau', { days })

export const getTotalUsers = () => get<number>('/knowledge-system/admin/stats/total-users')

export const getContentTrend = (days = 30) =>
  get<DailyCount[]>('/knowledge-wiki/admin/stats/content-trend', { days })

export const getSpaceTrend = (days = 30) =>
  get<DailyCount[]>('/knowledge-wiki/admin/stats/space-trend', { days })

export interface TopSpaceVO {
  spaceId: string
  spaceName?: string
  type?: SpaceType
  pageCount: number
}

export const getTopSpaces = (limit = 10) => get<TopSpaceVO[]>('/knowledge-wiki/admin/stats/top-spaces', { limit })

export const getWikiSummary = () =>
  get<{ totalSpaces: number; totalPages: number }>('/knowledge-wiki/admin/stats/summary')

// ---------- AI 用量（knowledge-agent /admin/ai） ----------

export interface AiDailyTokens {
  date: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  sessions: number
}

export interface AiUsageByUser {
  userId: string
  userName?: string
  sessions: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface AiUsageByModel {
  modelName?: string
  sessions: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cost?: number
  currency?: string
}

export interface AiUsageSummary {
  totalTokens: number
  sessions: number
  totalCost: number
  models: number
}

export interface ModelPrice {
  id?: string
  modelName: string
  promptPrice?: number
  completionPrice?: number
  currency?: string
  remark?: string
  updateTime?: string
}

export const getAiUsageTrend = (days = 30) =>
  get<AiDailyTokens[]>('/knowledge-agent/admin/ai/usage/trend', { days })

export const getAiUsageByUser = (days = 30, limit = 20) =>
  get<AiUsageByUser[]>('/knowledge-agent/admin/ai/usage/by-user', { days, limit })

export const getAiUsageByModel = (days = 30) =>
  get<AiUsageByModel[]>('/knowledge-agent/admin/ai/usage/by-model', { days })

export const getAiUsageSummary = (days = 30) =>
  get<AiUsageSummary>('/knowledge-agent/admin/ai/usage/summary', { days })

export const getModelPriceList = () =>
  get<ModelPrice[]>('/knowledge-agent/admin/ai/model-price/list')

export const submitModelPrice = (price: ModelPrice) =>
  post<unknown>('/knowledge-agent/admin/ai/model-price/submit', price)

export const deleteModelPrice = (id: string) =>
  del<unknown>(`/knowledge-agent/admin/ai/model-price/${id}`)

// ---------- 系统参数（knowledge-system，current + size） ----------

export interface Param {
  id?: string
  paramName?: string
  paramKey?: string
  paramValue?: string
  remark?: string
  updateTime?: string
}

export const getParamList = (params: {
  current: number
  size: number
  paramName?: string
  paramKey?: string
}) => get<PageResult<Param>>('/knowledge-system/param/list', params)

export const getParamValue = (paramKey: string) =>
  get<string | null>('/knowledge-system/param/value', { paramKey })

export const submitParam = (param: Param) => post<unknown>('/knowledge-system/param/submit', param)

export const removeParams = (ids: string) => post<unknown>('/knowledge-system/param/remove', undefined, { ids })

/** 批量读取参数键值（不存在的键返回 null） */
export const getParamValues = async (keys: string[]) => {
  const values = await Promise.all(keys.map((key) => getParamValue(key).catch(() => null)))
  return Object.fromEntries(keys.map((key, index) => [key, values[index]])) as Record<string, string | null>
}

/** 批量保存参数（key 已存在则覆盖其 value） */
export const saveParamValues = async (entries: Record<string, string>, names: Record<string, string> = {}) => {
  // param/submit 依据 id 更新，因此需要先查出已存在的参数
  const existing = await getParamList({ current: 1, size: 100 })
  const byKey = new Map(existing.records.map((item) => [item.paramKey, item]))
  await Promise.all(
    Object.entries(entries).map(([paramKey, paramValue]) => {
      const found = byKey.get(paramKey)
      return submitParam({
        id: found?.id,
        paramKey,
        paramValue,
        paramName: found?.paramName || names[paramKey] || paramKey,
      })
    }),
  )
}
