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
  Users,
  ShieldCheck,
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
import { clearTokens, getAuthUser } from '@/lib/auth'
import { Button } from '@kn/ui'

const GITHUB_URL = 'https://github.com/LRF0422/knowledge-repo'

interface NavItem {
  title: string
  url: string
  icon: React.ComponentType<{ className?: string }>
}

interface NavGroup {
  label: string
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: '概览',
    items: [
      { title: '仪表盘', url: '/dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: '用户与权限',
    items: [
      { title: '用户管理', url: '/users', icon: Users },
      { title: '角色权限', url: '/roles', icon: ShieldCheck },
    ],
  },
  {
    label: '内容管理',
    items: [
      { title: '空间管理', url: '/spaces', icon: FolderKanban },
      { title: '页面管理', url: '/pages', icon: FileText },
      { title: '评论审核', url: '/comments', icon: MessageSquare },
    ],
  },
  {
    label: '平台能力',
    items: [
      { title: '插件管理', url: '/plugins', icon: Blocks },
      { title: 'AI 配置', url: '/ai', icon: Sparkles },
      { title: 'AI 用量', url: '/ai-usage', icon: Gauge },
    ],
  },
  {
    label: '系统',
    items: [
      { title: '日志审计', url: '/logs', icon: ScrollText },
      { title: '系统设置', url: '/settings', icon: Settings },
    ],
  },
]

/** 精确段匹配，避免 /ai-usage 被 /ai 误命中 */
const isPathActive = (pathname: string, url: string) =>
  pathname === url || pathname.startsWith(`${url}/`)

const findActiveItem = (pathname: string) =>
  NAV_GROUPS.flatMap((group) => group.items).find((item) => isPathActive(pathname, item.url))

export const AdminLayout = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const activeItem = findActiveItem(location.pathname)
  const authUser = getAuthUser()
  const displayName = authUser?.userName || authUser?.account || '管理员'

  const handleLogout = () => {
    clearTokens()
    navigate('/login', { replace: true })
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
                    <span className="truncate font-semibold">KN Admin</span>
                    <span className="truncate text-xs text-muted-foreground">知识平台管理后台</span>
                  </div>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          {NAV_GROUPS.map((group) => (
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
                  <Link to="/dashboard">管理后台</Link>
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
