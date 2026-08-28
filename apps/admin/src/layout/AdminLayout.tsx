import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  Separator,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  ModeToggle,
  Avatar,
  AvatarFallback,
  AvatarImage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@kn/ui'
import {
  LayoutDashboard,
  FolderKanban,
  FileText,
  MessageSquare,
  Blocks,
  Sparkles,
  Gauge,
  ScrollText,
  Settings,
  BookOpen,
  LogOut,
  UserCircle,
  Github,
} from '@kn/icon'
import { clearTokens, getAuthUser, hasPermission, type AuthUser } from '@/lib/auth'
import { logout } from '@/api'
import { Button } from '@kn/ui'

const GITHUB_URL = 'https://github.com/LRF0422/knowledge-repo'

interface NavItem {
  title: string
  url: string
  icon: React.ComponentType<{ className?: string }>
  permission?: string
}

interface NavGroup {
  label: string
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: '概览',
    items: [
      { title: '仪表盘', url: '/dashboard', icon: LayoutDashboard, permission: 'platform.dashboard.read' },
    ],
  },
  {
    label: '内容管理',
    items: [
      { title: '空间管理', url: '/spaces', icon: FolderKanban, permission: 'platform.content.spaces.read' },
      { title: '页面管理', url: '/pages', icon: FileText, permission: 'platform.content.pages.read' },
      { title: '评论审核', url: '/comments', icon: MessageSquare, permission: 'platform.content.comments.read' },
    ],
  },
  {
    label: '平台能力',
    items: [
      { title: '插件审核', url: '/plugins', icon: Blocks, permission: 'platform.plugins.read' },
      { title: 'AI 配置', url: '/ai', icon: Sparkles, permission: 'platform.ai.config.manage' },
      { title: 'AI 用量', url: '/ai-usage', icon: Gauge, permission: 'platform.ai.usage.read' },
    ],
  },
  {
    label: '系统',
    items: [
      { title: '日志审计', url: '/logs', icon: ScrollText, permission: 'platform.audit.read' },
      { title: '系统设置', url: '/settings', icon: Settings, permission: 'platform.settings.manage' },
    ],
  },
]

export const canAccessNavItem = (item: NavItem, user: AuthUser | null) =>
  !item.permission || user?.permissions === undefined || hasPermission(user.permissions, item.permission)

export const getVisibleNavGroups = (user: AuthUser | null) =>
  NAV_GROUPS
    .map((group) => ({ ...group, items: group.items.filter((item) => canAccessNavItem(item, user)) }))
    .filter((group) => group.items.length > 0)

/** 精确段匹配，避免 /ai-usage 被 /ai 误命中 */
const isPathActive = (pathname: string, url: string) =>
  pathname === url || pathname.startsWith(`${url}/`)

const findActiveItem = (pathname: string, groups: NavGroup[]) =>
  groups.flatMap((group) => group.items).find((item) => isPathActive(pathname, item.url))

export const AdminLayout = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const authUser = getAuthUser()
  const visibleNavGroups = getVisibleNavGroups(authUser)
  const activeItem = findActiveItem(location.pathname, visibleNavGroups)
  const displayName = authUser?.userName || authUser?.account || '平台运营员'

  const handleLogout = () => {
    void logout().catch(() => undefined).finally(() => {
      clearTokens()
      navigate('/login', { replace: true })
    })
  }

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <Link to="/dashboard">
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                    <BookOpen className="size-4" />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">KN Operations</span>
                    <span className="truncate text-xs text-muted-foreground">知识平台运营中心</span>
                  </div>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          {visibleNavGroups.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton
                        asChild
                        isActive={isPathActive(location.pathname, item.url)}
                        tooltip={item.title}
                      >
                        <Link to={item.url}>
                          <item.icon />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton size="lg">
                    <Avatar className="size-8 rounded-lg">
                      {authUser?.avatar && <AvatarImage src={authUser.avatar} alt={displayName} />}
                      <AvatarFallback className="rounded-lg">{displayName.slice(0, 1).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold">{displayName}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {authUser?.authority || authUser?.account || '-'}
                      </span>
                    </div>
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start" className="w-56">
                  <DropdownMenuLabel>我的账户</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    <UserCircle className="mr-2 size-4" />
                    个人信息
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive" onClick={handleLogout}>
                    <LogOut className="mr-2 size-4" />
                    退出登录
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink asChild>
                  <Link to="/dashboard">平台运营</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              {activeItem && (
                <>
                  <BreadcrumbSeparator className="hidden md:block" />
                  <BreadcrumbItem>
                    <BreadcrumbPage>{activeItem.title}</BreadcrumbPage>
                  </BreadcrumbItem>
                </>
              )}
            </BreadcrumbList>
          </Breadcrumb>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => window.open(GITHUB_URL, '_blank')}
              title="GitHub"
              aria-label="GitHub"
            >
              <Github className="h-4 w-4" />
            </Button>
            <ModeToggle />
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
