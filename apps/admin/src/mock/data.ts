/**
 * 演示用 mock 数据，字段设计对齐后端模块：
 * knowledge-system（用户/角色）、knowledge-wiki（空间/页面/评论/插件）、knowledge-log（日志）。
 */

export interface AdminUser {
  id: string
  account: string
  name: string
  email: string
  role: string
  tenant: string
  status: 'active' | 'disabled'
  createTime: string
  lastLogin: string
}

export const MOCK_USERS: AdminUser[] = [
  { id: 'u_001', account: 'admin', name: '管理员', email: 'admin@kotion.top', role: '超级管理员', tenant: '默认租户', status: 'active', createTime: '2025-01-12', lastLogin: '2026-07-23 09:12' },
  { id: 'u_002', account: 'leong', name: 'Leong', email: 'leong@kotion.top', role: '空间管理员', tenant: '默认租户', status: 'active', createTime: '2025-02-03', lastLogin: '2026-07-22 21:40' },
  { id: 'u_003', account: 'zhangwei', name: '张伟', email: 'zhangwei@kotion.top', role: '普通用户', tenant: '研发中心', status: 'active', createTime: '2025-03-18', lastLogin: '2026-07-23 08:05' },
  { id: 'u_004', account: 'liuyang', name: '刘洋', email: 'liuyang@kotion.top', role: '普通用户', tenant: '研发中心', status: 'disabled', createTime: '2025-04-22', lastLogin: '2026-06-30 17:22' },
  { id: 'u_005', account: 'chenjing', name: '陈静', email: 'chenjing@kotion.top', role: '审核员', tenant: '市场部', status: 'active', createTime: '2025-05-09', lastLogin: '2026-07-21 14:33' },
  { id: 'u_006', account: 'wanglei', name: '王磊', email: 'wanglei@kotion.top', role: '普通用户', tenant: '市场部', status: 'active', createTime: '2025-06-15', lastLogin: '2026-07-19 10:08' },
  { id: 'u_007', account: 'sunli', name: '孙丽', email: 'sunli@kotion.top', role: '空间管理员', tenant: '产品部', status: 'active', createTime: '2025-08-27', lastLogin: '2026-07-23 11:47' },
  { id: 'u_008', account: 'zhaomin', name: '赵敏', email: 'zhaomin@kotion.top', role: '普通用户', tenant: '产品部', status: 'disabled', createTime: '2025-10-02', lastLogin: '2026-05-11 09:30' },
]

export interface AdminRole {
  id: string
  name: string
  code: string
  scope: string
  userCount: number
  permissions: string[]
  builtin: boolean
}

export const MOCK_ROLES: AdminRole[] = [
  { id: 'r_001', name: '超级管理员', code: 'super_admin', scope: '全平台', userCount: 1, permissions: ['全部权限'], builtin: true },
  { id: 'r_002', name: '空间管理员', code: 'space_admin', scope: '所辖空间', userCount: 2, permissions: ['空间管理', '页面管理', '成员管理', '评论管理'], builtin: true },
  { id: 'r_003', name: '审核员', code: 'auditor', scope: '全平台', userCount: 1, permissions: ['评论审核', '内容审核', '日志查看'], builtin: false },
  { id: 'r_004', name: '普通用户', code: 'member', scope: '个人空间', userCount: 4, permissions: ['页面编辑', '评论发布'], builtin: true },
]

export interface AdminSpace {
  id: string
  name: string
  type: 'personal' | 'team'
  owner: string
  memberCount: number
  pageCount: number
  status: 'normal' | 'archived'
  createTime: string
}

export const MOCK_SPACES: AdminSpace[] = [
  { id: 's_001', name: '产品知识库', type: 'team', owner: '孙丽', memberCount: 18, pageCount: 342, status: 'normal', createTime: '2025-02-14' },
  { id: 's_002', name: '研发规范中心', type: 'team', owner: 'Leong', memberCount: 32, pageCount: 587, status: 'normal', createTime: '2025-01-20' },
  { id: 's_003', name: '市场素材库', type: 'team', owner: '陈静', memberCount: 9, pageCount: 126, status: 'normal', createTime: '2025-04-08' },
  { id: 's_004', name: 'Leong 的个人空间', type: 'personal', owner: 'Leong', memberCount: 1, pageCount: 89, status: 'normal', createTime: '2025-02-03' },
  { id: 's_005', name: '旧版运营文档', type: 'team', owner: '王磊', memberCount: 5, pageCount: 64, status: 'archived', createTime: '2025-03-01' },
]

export interface AdminPage {
  id: string
  title: string
  space: string
  author: string
  blocks: number
  versions: number
  status: 'published' | 'draft' | 'trashed'
  updateTime: string
}

export const MOCK_PAGES: AdminPage[] = [
  { id: 'p_001', title: '产品需求文档模板', space: '产品知识库', author: '孙丽', blocks: 156, versions: 24, status: 'published', updateTime: '2026-07-23 10:21' },
  { id: 'p_002', title: '前端代码评审规范', space: '研发规范中心', author: 'Leong', blocks: 203, versions: 31, status: 'published', updateTime: '2026-07-22 18:47' },
  { id: 'p_003', title: 'Q3 营销活动计划', space: '市场素材库', author: '陈静', blocks: 88, versions: 12, status: 'draft', updateTime: '2026-07-21 15:02' },
  { id: 'p_004', title: '数据库设计规范 v2', space: '研发规范中心', author: '张伟', blocks: 178, versions: 19, status: 'published', updateTime: '2026-07-20 09:36' },
  { id: 'p_005', title: '会议纪要 2026-07-18', space: '产品知识库', author: '赵敏', blocks: 42, versions: 5, status: 'published', updateTime: '2026-07-18 17:55' },
  { id: 'p_006', title: '废弃的接口文档', space: '旧版运营文档', author: '王磊', blocks: 67, versions: 8, status: 'trashed', updateTime: '2026-06-12 11:19' },
]

export interface AdminComment {
  id: string
  content: string
  page: string
  author: string
  status: 'pending' | 'approved' | 'rejected'
  createTime: string
}

export const MOCK_COMMENTS: AdminComment[] = [
  { id: 'c_001', content: '这一节的架构图建议补充网关层的说明', page: '前端代码评审规范', author: '张伟', status: 'pending', createTime: '2026-07-23 09:45' },
  { id: 'c_002', content: '模板非常实用，已在团队内推广使用', page: '产品需求文档模板', author: '王磊', status: 'approved', createTime: '2026-07-22 16:30' },
  { id: 'c_003', content: '含外部推广链接，疑似广告内容', page: 'Q3 营销活动计划', author: '匿名用户', status: 'rejected', createTime: '2026-07-22 14:12' },
  { id: 'c_004', content: '第三章的索引设计与实际线上配置不一致', page: '数据库设计规范 v2', author: '刘洋', status: 'pending', createTime: '2026-07-21 20:08' },
  { id: 'c_005', content: '会议结论第 2 条缺少负责人信息', page: '会议纪要 2026-07-18', author: '孙丽', status: 'approved', createTime: '2026-07-19 10:26' },
]

export interface AdminPlugin {
  id: string
  name: string
  packageName: string
  version: string
  author: string
  installCount: number
  status: 'enabled' | 'disabled' | 'reviewing'
  updateTime: string
}

export const MOCK_PLUGINS: AdminPlugin[] = [
  { id: 'pl_001', name: 'AI 助手', packageName: '@kn/plugin-ai', version: '0.0.16', author: '官方', installCount: 1284, status: 'enabled', updateTime: '2026-07-15' },
  { id: 'pl_002', name: '多维表格', packageName: '@kn/plugin-bitable', version: '0.0.16', author: '官方', installCount: 986, status: 'enabled', updateTime: '2026-07-10' },
  { id: 'pl_003', name: 'Mermaid 图表', packageName: '@kn/mermaid-plugin', version: '0.0.16', author: '官方', installCount: 754, status: 'enabled', updateTime: '2026-07-08' },
  { id: 'pl_004', name: 'Drawnix 白板', packageName: '@kn/plugin-drawnix', version: '0.0.16', author: '官方', installCount: 512, status: 'enabled', updateTime: '2026-06-28' },
  { id: 'pl_005', name: 'B 站视频嵌入', packageName: '@kn/plugin-bilibili', version: '0.0.15', author: '社区', installCount: 231, status: 'disabled', updateTime: '2026-05-19' },
  { id: 'pl_006', name: '泛微 OA 集成', packageName: '@kn/plugin-weaver-oa', version: '0.0.14', author: '社区', installCount: 47, status: 'reviewing', updateTime: '2026-07-20' },
]

export interface AdminLog {
  id: string
  type: 'operation' | 'login'
  operator: string
  action: string
  target: string
  ip: string
  result: 'success' | 'failure'
  time: string
}

export const MOCK_LOGS: AdminLog[] = [
  { id: 'l_001', type: 'operation', operator: '管理员', action: '禁用用户', target: 'zhaomin', ip: '10.20.3.44', result: 'success', time: '2026-07-23 11:02' },
  { id: 'l_002', type: 'login', operator: 'Leong', action: '登录系统', target: '-', ip: '58.34.102.7', result: 'success', time: '2026-07-23 09:12' },
  { id: 'l_003', type: 'operation', operator: '孙丽', action: '归档空间', target: '旧版运营文档', ip: '10.20.5.18', result: 'success', time: '2026-07-22 17:40' },
  { id: 'l_004', type: 'login', operator: 'unknown', action: '登录系统', target: '-', ip: '203.98.44.61', result: 'failure', time: '2026-07-22 03:27' },
  { id: 'l_005', type: 'operation', operator: '陈静', action: '驳回评论', target: 'c_003', ip: '10.20.7.92', result: 'success', time: '2026-07-22 14:15' },
  { id: 'l_006', type: 'operation', operator: '管理员', action: '更新 AI 模型配置', target: 'deepseek-chat', ip: '10.20.3.44', result: 'success', time: '2026-07-21 16:53' },
  { id: 'l_007', type: 'login', operator: '张伟', action: '登录系统', target: '-', ip: '112.65.10.201', result: 'success', time: '2026-07-21 08:44' },
  { id: 'l_008', type: 'operation', operator: 'Leong', action: '发布插件', target: '@kn/plugin-weaver-oa', ip: '58.34.102.7', result: 'failure', time: '2026-07-20 22:31' },
]

export interface TrendPoint {
  date: string
  activeUsers: number
  newPages: number
  aiCalls: number
}

export const MOCK_TRENDS: TrendPoint[] = [
  { date: '07-17', activeUsers: 186, newPages: 42, aiCalls: 356 },
  { date: '07-18', activeUsers: 204, newPages: 51, aiCalls: 412 },
  { date: '07-19', activeUsers: 158, newPages: 33, aiCalls: 287 },
  { date: '07-20', activeUsers: 149, newPages: 28, aiCalls: 265 },
  { date: '07-21', activeUsers: 232, newPages: 64, aiCalls: 498 },
  { date: '07-22', activeUsers: 241, newPages: 58, aiCalls: 531 },
  { date: '07-23', activeUsers: 213, newPages: 46, aiCalls: 447 },
]

export interface StorageSlice {
  name: string
  value: number
  fill: string
}

export const MOCK_STORAGE: StorageSlice[] = [
  { name: '文档内容', value: 42, fill: 'hsl(var(--chart-1))' },
  { name: '图片附件', value: 28, fill: 'hsl(var(--chart-2))' },
  { name: '办公文件', value: 17, fill: 'hsl(var(--chart-3))' },
  { name: '其他', value: 13, fill: 'hsl(var(--chart-4))' },
]
