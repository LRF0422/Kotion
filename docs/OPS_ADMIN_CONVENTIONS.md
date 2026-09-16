# Admin 运营页面开发约定（内部施工说明）

> 本文件是 `docs/OPERATIONS_PLAN.md` 实施期间沉淀的约定，用于让多个并行开发的运营页面
> 在组件、状态、权限与错误处理上保持一致；后续新增运营页面时请继续遵守。

## 1. 必须遵守

- 页面导出**具名组件**，与文件名一致：`export const Goals = () => { ... }`。
- 根节点 `<div>`，首行 `<PageHeader title description actions />`。
- 所有接口调用**只能**来自 `@/api/ops`（已定义完整契约与类型）。缺失的接口先补 `api/ops.ts`，不要直接写 `fetch`。
- 加载 / 失败 / 空态统一用 `<DataState>`；**禁止**把请求失败渲染成「暂无数据」。
- 一次性加载用 `useAsync(fetcher, deps)`；分页列表用 `usePagedData`。
- 写操作必须受权限控制：

  ```tsx
  const { canManage } = useOpsPermission()
  ...
  {canManage && <Button onClick={...}>保存</Button>}
  ```

- 提示统一 `import { toast } from '@kn/ui'`。
- 全部中文文案。不使用 `any`，不留未使用的 import/变量，状态显式标注类型。
- 危险操作（删除、发送、发布）必须二次确认。

## 2. 组件与图标

- 图表原语从 `@kn/ui` 引入：`ChartContainer, ChartTooltip, ChartTooltipContent, AreaChart, Area, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid`。
- 表格原语从 `@kn/ui` 引入：`Table, TableBody, TableCell, TableHead, TableHeader, TableRow`。
- 其余可用：`Button, Card, CardContent, CardHeader, CardTitle, CardDescription, Input, Label, Textarea, Badge, Switch, Separator, Tabs, TabsContent, TabsList, TabsTrigger, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, Alert, Skeleton, Progress, Tooltip`。
  若不确定某组件是否存在，**改用原生 HTML + Tailwind 类**，不要猜。
- 图标仅使用以下已核验存在的名字（`@kn/icon`）：
  `Target, Funnel, Bell, Megaphone, Layers, Image, Tags, Gift, Send, QrCode, FlaskConical, Activity, ShieldCheck, Download, Upload, Store, Briefcase, Plus, Pencil, Trash2, Save, RefreshCw, Copy, Check, X, Search, Play, Pause, Rocket, Link2, Mail, Users, Eye, CircleAlert, LoaderCircle, ArrowRight, ArrowUpRight, ChevronDown, ChevronRight, ChevronLeft, History, Percent, Timer, MousePointerClick, Gauge, Sparkles, Palette, Zap, Inbox, ExternalLink, Calendar, Clock, Webhook, Siren, Trophy, Ticket, GripVertical, ListChecks, Filter`。
  **注意**：用 `CircleAlert` 而不是 `AlertCircle`；用 `LoaderCircle` 而不是 `Loader2`；用 `Funnel` 而不是 `Filter`（`Filter` 未导出类型声明）。

## 3. 共享组件速查

| 组件 | Props |
| --- | --- |
| `PageHeader` | `{ title: string; description?: string; actions?: ReactNode }` |
| `StatCard` | `{ title: string; value: string; trend?: number; icon: ComponentType<{className?: string}> }` |
| `StatusBadge` | `{ variant: 'success'\|'warning'\|'danger'\|'info'\|'muted'; children }` |
| `TablePagination` | `{ current: number; pages: number; total: number; onChange: (page:number)=>void }` |
| `DataState` | `{ loading?, error?, empty?, emptyText?, rows?, onRetry?, children }` |
| `JsonField` | `{ label?, value: string, onChange: (v:string)=>void, rows?, hint?, allowArray?, disabled? }` + 导出 `parseJsonObject(text, allowArray?)` / `toJsonText(value, fallback?)` |
| `useAsync` | `(fetcher: () => Promise<T>, deps?) => { data, loading, error, reload, setData }` |
| `usePagedData` | `(fetcher: (current:number) => Promise<PageResult<T>>, deps?) => { records,total,pages,current,setCurrent,loading,error,reload }` |
| `useOpsPermission` | `() => { canRead: boolean; canManage: boolean }` |
| `formatDateTime` | `(value?: string \| null) => string` |

## 4. 资源型页面统一模型

P1/P2 中大量配置（SEO / 区块 / 推广位 / 素材 / 专题页 / 精选位）都落在同一张
`landing_resource` 表，前端统一走 `getOpsResources` / `getOpsResource` / `saveOpsResource` /
`saveOpsResourceBatch` / `deleteOpsResource`，按 `kind` 区分：

| kind | resKey | payload 类型 |
| --- | --- | --- |
| `SEO` | 路径，如 `/templates` | `OpsSeoPayload` |
| `SECTION` | 页面 key，如 `home` | `{ sectionKey, position, props }` |
| `PROMOTION` | 推广位 id | `OpsPromotionPayload` |
| `ASSET` | 素材 key | `OpsAssetPayload` |
| `FEATURED` | `template:<id>` / `plugin:<id>` | `OpsFeaturedPayload` |
| `CAMPAIGN_PAGE` | slug | `{ title, blocks, seo }` |

## 5. 禁止事项

- 不执行任何构建命令（父任务统一构建）。
- 不修改分配给你之外的文件。
- 不在页面里硬编码生产域名；短链/落地页地址从 `window.location.origin` 或明确常量推导。
