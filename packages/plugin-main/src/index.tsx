import { Home } from './pages/Home'
import { Spaces } from './pages/Spaces'
import { SpaceDetail } from './pages/SpaceDetail'
import { SpaceGraph } from './pages/SpaceGraph'
import { PageRouteSync } from './pages/SpaceDetail/PageEditor/PageRouteSync'
import { SpaceSettings } from './pages/SpaceDetail/Settings'
import { InviteCollaboration } from './pages/InviteCollaboration'
import { SharedPage } from './pages/SharedPage'
import { SpaceHub } from './pages/SpaceHub'
import { TeamSpaceHome } from './pages/TeamSpaceHome'
import { KPlugin, PluginConfig } from '@kn/common'
import React from 'react'
import { LayoutGrid } from '@kn/icon'
import "@kn/ui/globals.css"
import { spaceService } from './service/space-service'
import { BlockVersionsExtension } from './extensions/block-versions'
// export * from "./service"
// @ts-ignore
import pkg from '../package.json'





interface DefaultPluginProps extends PluginConfig {

}
class DefaultPlugin extends KPlugin<DefaultPluginProps> {
  pluginKey: string = pkg.name
}

export const DefaultPluginInstance = new DefaultPlugin({
  name: 'Basic plugin',
  status: 'ACTIVE',
  routes: [
    { name: '/', path: '/', element: <Home /> },
    { name: '/home', path: '/home', element: <Home /> },
    { name: '/spaces', path: '/spaces', element: <Spaces /> },
    { name: '/all-spaces', path: '/all-spaces', element: <SpaceHub /> },
    // { name: '/ai-assistant', path: '/ai-assistant', element: <AIAssistantPage /> },
    { name: '/collaborate/:token', path: '/collaborate/:token', element: <InviteCollaboration /> },
    { name: '/share/:shortCode', path: '/share/:shortCode', element: <SharedPage /> },
    {
      name: '/space-detail/:id',
      path: '/space-detail/:id',
      element: <SpaceDetail />,
      children: [
        {
          name: '/space-detail/:id/page/edit/:pageId',
          path: '/space-detail/:id/page/edit/:pageId',
          // Renders null; only syncs the URL → page-tab Redux state. The actual
          // editor is rendered by <TabbedEditorArea/> in SpaceDetail.
          element: <PageRouteSync />
        },
        {
          name: '/space-detail/:id/settings',
          path: '/space-detail/:id/settings',
          element: <SpaceSettings />
        },
        {
          name: '/space-detail/:id/graph',
          path: '/space-detail/:id/graph',
          element: <SpaceGraph />
        },
        {
          name: '/space-detail/:id/home',
          path: '/space-detail/:id/home',
          element: <TeamSpaceHome />
        }
      ]
    }
  ],
  menus: [
    {
      name: 'Home',
      icon: <LayoutGrid className="h-5 w-5" />,
      key: '/home',
      attachTabs: true,
      id: '/home'
    }
  ]
  ,
  // 主页功能引导:在 welcome 引导(priority 100)之后自动接续播放
  tours: [
    {
      id: 'home-intro',
      name: '主页功能',
      trigger: 'auto',
      priority: 90,
      version: 1,
      steps: [
        {
          id: 'new-page',
          target: '[data-tour="home-new-page"]',
          title: '新建页面',
          description: '一键在个人空间创建文档,马上开始记录想法。',
          placement: 'bottom',
          route: '/home',
          allowInteraction: true,
        },
        {
          id: 'new-space',
          target: '[data-tour="home-new-space"]',
          title: '创建空间',
          description: '用「空间」把相关文档归类管理,像文件夹一样组织知识。',
          placement: 'bottom',
        },
        {
          id: 'all-spaces',
          target: '[data-tour="home-all-spaces"]',
          title: '全部空间',
          description: '在这里查看和管理你的所有空间。',
          placement: 'bottom',
        },
      ],
    },
  ],
  editorExtension: [BlockVersionsExtension],
  services: {
    spaceService: spaceService
  },
  locales: {
    "zh": {
      translation: {
        home: {
          "title": "早上好",
          "create-space": "创建空间",
          "rs": "最近的空间",
          "all": "查看全部",
          "recent-pages": "最近的页面",
          "collaboration": "协作空间",
          "team-spaces": "团队空间",
          "team-badge": "团队",
          "favorites": "收藏页面",
          "no-favorites": "暂无收藏页面",
          "no-favorites-hint": "给页面加星标即可在此快速访问",
          "no-spaces": "暂无空间",
          "no-spaces-hint": "创建一个空间开始使用",
          "no-recent-pages": "暂无最近页面",
          "no-recent-pages-hint": "您访问过的页面将显示在这里",
          "learning": "学习使用 Knowledge",
          "coming-soon-desc": "功能即将上线，敬请期待！",
          "new-page": "新建页面",
          "all-spaces": "全部空间",
          "ai-assistant": "AI 助手",
          "relation-graph": "关系图谱",
          "last-update": "最近更新",
          "week-stat": "本周编辑 {{count}} 篇",
          "greeting": {
            "morning": "早上好",
            "afternoon": "下午好",
            "evening": "晚上好"
          }
        },
        "space-hub": {
          "all-space": "所有空间",
          "subtitle": "管理和探索您的所有知识空间",
          "create-space": "创建空间",
          "favorites": "收藏",
          "all-spaces": "所有空间",
          "tab-all": "全部",
          "tab-normal": "普通空间",
          "tab-team": "团队空间",
          "count": "{{n}} 个空间",
          "stat-total": "空间总数",
          "stat-favorites": "已收藏",
          "stat-current": "当前页",
          "stat-pages": "总页数",
          "no-favorites": "暂无收藏空间",
          "no-favorites-hint": "给空间加星标即可添加到收藏",
          "no-spaces": "暂无空间",
          "create-first": "创建您的第一个空间开始使用",
          "try-different": "尝试其他搜索词",
          "no-results": "未找到匹配的空间",
          "search-placeholder": "搜索空间...",
          "no-description": "暂无描述",
          "fetch-error": "加载空间列表失败",
          "favorite-updated": "收藏已更新",
          "favorite-error": "更新收藏失败",
          "grid-view": "网格视图",
          "list-view": "列表视图",
          "toggle-favorite": "切换收藏",
          "view-space": "查看空间",
          "goto-page": "跳转到第",
          "category-all": "全部",
          "category-app": "应用",
          "category-feature": "功能",
          "category-connector": "连接器",
          "clear-search": "清除搜索",
          "badge-owned": "我拥有的",
          "badge-joined": "我加入的",
          "badge-public": "公开"
        },
        "toc": {
          "title": "目录",
          "empty": "没有数据"
        },
        creation: {
          title: "创建空间",
          name: "名称",
          desc: "描述",
          cover: "封面 ",
          icon: "图标",
          submit: "创建空间",
          submitting: "创建中...",
          success: "空间创建成功",
          error: "创建空间失败",
          nameRequired: "请输入空间名称",
          nameTooLong: "空间名称过长（最多100个字符）",
          iconRequired: "请选择图标",
          coverRequired: "请选择封面",
          uploadError: "上传失败",
          namePlaceholder: "请输入空间名称",
          descPlaceholder: "请输入空间描述",
          moreCover: "更多封面",
          "type": "空间类型",
          "type-placeholder": "选择空间类型",
          "type-normal": "普通空间",
          "type-collaboration": "协作空间",
          "type-collab-desc": "团队工作区，支持成员管理、活动动态和实时协作",
          "type-normal-desc": "标准的知识组织和分享空间",
          "section-basic": "基本信息",
          "section-basic-desc": "设置新空间的基本信息",
          "section-appearance": "外观设置",
          "section-appearance-desc": "自定义空间的外观",
          "name-required": "空间名称不能为空",
          "name-placeholder": "输入空间名称",
          "name-help": "这是空间的显示名称",
          "desc-placeholder": "描述这个空间的用途",
          "desc-help": "简要描述帮助他人了解空间的用途",
          "icon-help": "选择一个 emoji 或图片作为空间图标",
          "cover-upload": "上传封面图片",
          "cover-browse": "点击选择",
          "cover-change": "更换封面",
          "cover-presets": "或从预设中选择",
          "cover-help": "封面图片让您的空间更容易识别",
          "dialog-desc": "创建一个新空间来组织内容并与他人协作。",
          "cancel": "取消",
          "creating": "创建中..."
        },
        "teamSpace": {
          "home": "团队首页",
          "overview": "总览",
          "settings": "设置",
          "newPage": "新建页面",
          "inviteMember": "邀请成员",
          "recentPages": "最近页面",
          "recentActivity": "最近动态",
          "recentlyEdited": "最近编辑",
          "activity": "动态",
          "pinned": "置顶",
          "untitled": "无标题",
          "noPages": "暂无页面，创建第一个页面吧！",
          "createFirst": "创建页面",
          "noPinned": "暂无置顶页面",
          "members": "成员",
          "manage": "管理",
          "viewAll": "查看全部 {{count}} 名成员",
          "noMembers": "暂无成员",
          "stat": {
            "pages": "页面",
            "members": "成员",
            "pinned": "置顶",
            "activities": "动态"
          }
        },
        "activity": {
          "empty": "暂无动态",
          "loadMore": "加载更多"
        },
        "comment": {
          "empty": "暂无评论，开始讨论吧！",
          "placeholder": "写评论... 使用 @ 提及他人",
          "replyPlaceholder": "写回复...",
          "submitError": "发表评论失败",
          "deleteError": "删除评论失败",
          "resolveError": "更新评论失败"
        },
        "tags": {
          "label": "标签",
          "addPlaceholder": "添加标签...",
          "saveError": "保存标签失败"
        },
        "space-settings": {
          "title": "空间设置",
          "subtitle": "管理 {{name}} 的设置和偏好",
          "basic": {
            "tab": "基本设置",
            "title": "基本信息",
            "basic-description": "更新空间的基本信息和外观",
            "name": {
              "label": "空间名称",
              "placeholder": "输入空间名称",
              "required": "空间名称是必填项",
              "help": "这是空间的显示名称"
            },
            "description": {
              "label": "描述",
              "placeholder": "为您的空间添加描述",
              "help": "帮助他人了解此空间的用途"
            },
            "icon": {
              "label": "空间图标",
              "help": "选择代表您空间的图标"
            },
            "cover": {
              "label": "封面图片",
              "help": "添加封面图片使您的空间更具视觉吸引力",
              "upload": "上传封面图片",
              "browse": "点击浏览文件",
              "change": "更改封面",
              "remove": "移除封面"
            },
            "save": "保存更改",
            "cancel": "取消",
            "saving": "保存中...",
            "retry": "请稍后重试。",
            "visibility": {
              "label": "可见性",
              "private": "私密",
              "private-desc": "仅成员可以访问此空间",
              "public": "公开",
              "public-desc": "工作区内的任何人都可以发现并阅读",
              "help": "公开空间对所有工作区用户以只读方式可见"
            }
          },
          "page": {
            "tab": "页面设置",
            "title": "页面设置",
            "description": "为此空间配置页面级设置和权限。",
            "management_title": "页面管理",
            "management_description": "管理和组织此空间中的页面。移动页面以调整页面结构。",
            "search_placeholder": "搜索页面...",
            "tree_title": "页面结构",
            "pages_count": "个页面",
            "empty": "此空间暂无页面",
            "load_error": "加载页面树失败",
            "move_title": "移动页面",
            "move_description": "为 \"{{name}}\" 选择新的父页面",
            "move_search": "搜索目标页面...",
            "move_to_root": "空间根目录（顶层）",
            "move_cancel": "取消",
            "move_confirm": "移动",
            "move_success": "页面移动成功",
            "move_error": "页面移动失败"
          },
          "member": {
            "tab": "成员设置",
            "title": "成员管理",
            "description": "添加、移除和管理有权访问此空间的成员。"
          },
          "templates": {
            "tab": "模板库"
          },
          "archive": {
            "tab": "归档",
            "title": "归档空间",
            "description": "归档空间将从主导航中隐藏它，同时保留所有内容。",
            "warning": "归档会发生什么？",
            "warning_list": {
              "hide_nav": "空间将从基本网站导航中隐藏",
              "preserve_content": "所有内容保持完整且可访问",
              "restore_anytime": "您可以随时恢复空间",
              "reduce_clutter": "归档空间有助于减少杂乱并改善组织结构"
            },
            "archive_btn": "归档空间",
            "restore_btn": "恢复空间",
            "archived_title": "此空间已归档",
            "archived_description": "该空间已从主导航中隐藏，所有内容保持完整。您可以随时恢复它。",
            "confirm_title": "归档此空间？",
            "confirm_description": "空间 \"{{name}}\" 将从主导航中隐藏，所有内容保留，可随时恢复。",
            "confirm_cancel": "取消",
            "success": "空间已归档",
            "restore_success": "空间已恢复",
            "error": "操作失败，请稍后重试"
          },
          "delete": {
            "tab": "删除",
            "title": "删除空间",
            "description": "永久删除此空间及其所有内容。此操作无法撤消。",
            "warning_title": "警告：此操作是永久性的",
            "warning_list": {
              "remove_immediately": "移动此空间到垃圾箱将立即删除所有内容",
              "admin_restore": "只有 Confluence 管理员可以从垃圾箱恢复空间",
              "all_content_deleted": "所有页面、附件和设置将被删除",
              "consider_archive": "如果您以后可能需要，请考虑归档空间"
            },
            "consider_title": "删除前请考虑：",
            "consider_list": {
              "backup": "您是否备份了任何重要内容？",
              "notify_members": "您是否通知了所有空间成员？",
              "archive_option": "归档是否是更好的选择？"
            },
            "delete_btn": "删除空间",
            "undo_warning": "此操作无法撤消",
            "confirm_title": "永久删除此空间？",
            "confirm_description": "空间 \"{{name}}\" 及其所有页面将被永久删除，此操作无法撤消。",
            "confirm_cancel": "取消",
            "success": "空间 \"{{name}}\" 已删除",
            "error": "删除空间失败，请稍后重试"
          },
          "appearance": {
            "title": "外观",
            "description": "自定义空间的外观"
          },
          "error": "保存设置失败"
        },
        "collaboration": {
          "title": "邀请协作",
          "description": "邀请他人协作此页面",
          "description-with-title": "与他人分享\"{{title}}\"",
          "tab-invite": "邀请",
          "tab-email": "邮件",
          "tab-manage": "管理",
          "search-placeholder": "按姓名或邮箱搜索...",
          "no-users-found": "未找到用户",
          "permission-view": "可查看",
          "permission-view-desc": "只能查看页面",
          "permission-edit": "可编辑",
          "permission-edit-desc": "可查看和编辑页面",
          "permission-admin": "完全访问",
          "permission-admin-desc": "可管理协作者",
          "invite-button": "邀请",
          "invite-sending": "发送中...",
          "invite-success": "成功邀请 {{count}} 位用户",
          "invite-error": "发送邀请失败",
          "invite-select-user": "请至少选择一位用户进行邀请",
          "email-label": "邮箱地址",
          "email-placeholder": "输入邮箱地址...",
          "email-hint": "按回车键或逗号添加每个邮箱",
          "email-send": "发送邀请",
          "email-sending": "发送中...",
          "email-success": "已向 {{count}} 个邮箱发送邀请",
          "email-error": "发送邮件邀请失败",
          "email-required": "请至少输入一个邮箱地址",
          "manage-no-collaborators": "暂无协作者",
          "manage-no-collaborators-hint": "邀请他人开始协作",
          "collaborator-removed": "已移除协作者",
          "collaborator-remove-error": "移除协作者失败",
          "permission-updated": "权限已更新",
          "permission-update-error": "更新权限失败",
          "share-link": "分享链接",
          "public": "公开",
          "private": "私密",
          "link-copied": "链接已复制到剪贴板",
          "link-copy-error": "复制链接失败"
        },
        "pageEditor": {
          "tabBar": {
            "close": "关闭",
            "closeOthers": "关闭其他",
            "closeRight": "关闭右侧标签",
            "closeAll": "关闭全部",
            "untitled": "无标题"
          }
        },
        "graph": {
          "title": "关系图谱",
          "stats": "{{nodes}} 个页面 · {{edges}} 条引用",
          "filter": "筛选页面...",
          "reset": "重置视图",
          "refresh": "刷新",
          "retry": "重试",
          "loading": "正在生成关系图谱...",
          "error": "加载关系图谱失败",
          "empty": "暂无页面关系",
          "emptyHint": "在页面中用 [[ ]] 或页面引用链接其他页面后，这里会显示它们之间的关系",
          "legend": "空间",
          "clearFocus": "取消聚焦",
          "zoomIn": "放大",
          "zoomOut": "缩小",
          "untitled": "未命名"
        },
        "recent": {
          "title": "最近访问"
        },
        "favorites": {
          "title": "收藏",
          "viewAll": "查看全部",
          "allFavorites": "全部收藏",
          "empty": "收藏页面以快速访问",
          "add": "添加到收藏"
        },
        "pages": {
          "title": "页面",
          "empty": "暂无页面"
        },
        "page": {
          "title": "页面",
          "create": "新建页面",
          "copyLink": "复制链接",
          "moveToTrash": "移动到回收站"
        },
        "editor": {
          "versionHistory": "版本历史",
          "asMarkdown": "导出为 Markdown",
          "exportMarkdownFailed": "导出 Markdown 失败",
          "version": {
            "current": "当前",
            "draft": "草稿",
            "empty": "暂无版本",
            "restore": "恢复",
            "cancel": "取消",
            "loadFailed": "加载版本历史失败",
            "restoreSuccess": "已恢复到版本 {{version}}",
            "restoreFailed": "恢复版本失败",
            "refreshFailed": "服务端已恢复，请刷新页面查看",
            "confirmTitle": "恢复到此版本？",
            "confirmDesc": "页面将恢复到版本 {{version}}。此操作会创建一个新版本，当前内容仍保留在历史记录中，不会丢失。"
          }
        },
        "template": {
          "title": "模板",
          "emptyTitle": "暂无团队模板",
          "emptyDesc": "将页面保存为模板以与团队共享。团队成员可以使用模板快速创建新页面。",
          "use": "使用模板",
          "useError": "从模板创建页面失败",
          "deleted": "模板已删除",
          "deleteError": "删除模板失败",
          "saveAsTemplate": "保存为模板",
          "untitled": "未命名模板",
          "selectTemplate": "选择模板",
          "allTemplates": "全部模板",
          "loadFailed": "加载模板失败",
          "deleteSuccess": "模板已删除",
          "deleteFailed": "删除模板失败",
          "useFailed": "使用模板失败",
          "dialogTitle": "保存为模板",
          "dialogDesc": "将当前页面保存为可重复使用的模板",
          "sectionInfo": "模板信息",
          "sectionInfoDesc": "填写模板的基本信息",
          "author": "作者",
          "nameLabel": "模板名称",
          "namePlaceholder": "输入模板名称",
          "nameRequired": "请输入模板名称",
          "cover": "封面",
          "description": "描述",
          "descPlaceholder": "输入模板描述",
          "cancel": "取消",
          "confirm": "保存",
          "saveSuccess": "模板保存成功",
          "saveFailed": "模板保存失败"
        },
        "import": {
          "title": "导入"
        },
        "export": {
          "title": "导出"
        },
        "settings": {
          "title": "设置"
        },
        "trash": {
          "title": "回收站",
          "empty": "回收站为空",
          "restore": "恢复"
        },
        "search": {
          "placeholder": "搜索页面和内容...",
          "empty": "未找到结果",
          "pages": "页面",
          "content": "内容",
          "searching": "搜索中...",
          "quickActions": "快捷操作"
        },
        "space": {
          "title": "空间",
          "personal": "个人空间"
        },
        "share": {
          "title": "分享",
          "description": "邀请他人协作此页面",
          "description-with-title": "分享“{{title}}”",
          "input-placeholder": "搜索用户或输入邮箱...",
          "invite": "邀请",
          "invite-empty": "请先选择用户或输入邮箱",
          "invite-success": "已发送 {{count}} 个邀请",
          "invite-error": "发送邀请失败",
          "invite-email": "邀请 {{email}}",
          "people-with-access": "有权限的人",
          "inherited-from-role": "继承自空间角色（{{role}}）",
          "no-access": "暂无协作者",
          "role-owner": "所有者",
          "role-admin": "管理员",
          "role-member": "成员",
          "role-guest": "访客",
          "link-title": "分享链接",
          "link-off": "关闭",
          "link-anyone-view": "任何拥有链接的人可查看",
          "link-anyone-edit": "任何拥有链接的人可编辑",
          "link-perm-view": "可查看",
          "link-perm-edit": "可编辑",
          "expiry-never": "永久有效",
          "expiry-7d": "7 天",
          "expiry-30d": "30 天",
          "reset-link": "重置链接",
          "reset-link-tip": "重置后旧链接将失效",
          "copy-link": "复制链接",
          "link-updated": "分享链接已更新",
          "link-disabled": "分享链接已关闭",
          "link-error": "操作分享链接失败",
          "expires-at": "{{time}} 过期"
        },
        "sharedPage": {
          "invalid-link": "无效的分享链接",
          "resolve-error": "无法打开分享链接",
          "loading": "正在加载分享页面...",
          "unavailable": "链接不可用",
          "back-home": "返回首页",
          "untitled": "无标题",
          "read-only": "只读",
          "expires-at": "{{time}} 过期",
          "enter-edit": "进入编辑"
        },
        "inviteLanding": {
          "title": "页面协作邀请",
          "subtitle": "{{name}} 邀请你协作编辑此页面",
          "inviter": "邀请人",
          "already-accepted": "你已接受此邀请",
          "open-page": "打开页面",
          "accept": "接受邀请",
          "expires-at": "{{time}} 过期"
        },
        "members": {
          "title": "空间成员",
          "subtitle": "管理谁可以访问此空间",
          "invite": "邀请",
          "inviteTitle": "邀请成员",
          "inviteDesc": "按姓名或邮箱搜索并邀请成员加入此空间。",
          "add": "添加",
          "allRoles": "全部角色",
          "cancel": "取消",
          "empty": "暂无成员",
          "emptyDesc": "邀请团队成员开始协作",
          "fetchError": "加载成员失败",
          "filterPlaceholder": "搜索成员...",
          "searchPlaceholder": "搜索用户...",
          "noResults": "未找到用户",
          "noMatch": "没有匹配的成员",
          "invited": "成员邀请成功",
          "inviteError": "邀请成员失败",
          "joined": "加入于",
          "invitedBy": "由 {{name}} 邀请",
          "pagePending": "页面：{{title}}",
          "spacePending": "空间邀请",
          "unknownInvitee": "未知受邀人",
          "pendingTitle": "待处理邀请",
          "noPending": "暂无待处理邀请",
          "revoke": "撤销",
          "invitationRevoked": "邀请已撤销",
          "revokeError": "撤销邀请失败",
          "makeAdmin": "设为管理员",
          "makeMember": "设为成员",
          "makeGuest": "设为访客",
          "remove": "移除",
          "removed": "成员已移除",
          "removeError": "移除成员失败",
          "roleUpdated": "角色已更新",
          "roleError": "更新角色失败",
          "transfer": "转让所有权",
          "transferTitle": "转让所有权？",
          "transferDesc": "将此空间的所有权转让给 {{name}}。你将变为管理员，且此操作无法由你撤销。",
          "transferConfirm": "转让",
          "transferred": "所有权已转让",
          "transferError": "转让所有权失败",
          "leave": "退出空间",
          "leaveTitle": "退出此空间？",
          "leaveDesc": "你将失去对此空间所有页面的访问权限，只能通过邀请重新加入。",
          "leaveConfirm": "退出",
          "left": "你已退出该空间",
          "leaveError": "退出空间失败",
          "you": "（你）"
        },
      }
    },
    "en": {
      translation: {
        home: {
          "title": "Good morning",
          "create-space": "Create Space",
          "rs": "Recent Spaces",
          "all": "View All",
          "recent-pages": "Recent Pages",
          "collaboration": "Collaboration Spaces",
          "team-spaces": "Team Spaces",
          "team-badge": "Team",
          "favorites": "Favorite Pages",
          "no-favorites": "No favorite pages yet",
          "no-favorites-hint": "Star pages to add them here",
          "no-spaces": "No spaces yet",
          "no-spaces-hint": "Create a space to get started",
          "no-recent-pages": "No recent pages",
          "no-recent-pages-hint": "Pages you visit will appear here",
          "learning": "Learn Knowledge",
          "coming-soon-desc": "This feature is coming soon, stay tuned!",
          "new-page": "New Page",
          "all-spaces": "All Spaces",
          "ai-assistant": "AI Assistant",
          "relation-graph": "Relation Graph",
          "last-update": "Last update",
          "week-stat": "{{count}} pages this week",
          "greeting": {
            "morning": "Good Morning",
            "afternoon": "Good Afternoon",
            "evening": "Good Evening"
          }
        },
        "space-hub": {
          "all-space": "All Spaces",
          "subtitle": "Manage and explore all your knowledge spaces",
          "create-space": "Create Space",
          "favorites": "Favorites",
          "all-spaces": "All Spaces",
          "tab-all": "All",
          "tab-normal": "Normal",
          "tab-team": "Team",
          "count": "{{n}} spaces",
          "stat-total": "Total Spaces",
          "stat-favorites": "Favorites",
          "stat-current": "Current Page",
          "stat-pages": "Total Pages",
          "no-favorites": "No favorite spaces yet",
          "no-favorites-hint": "Star a space to add it to your favorites",
          "no-spaces": "No spaces available",
          "create-first": "Create your first space to get started",
          "try-different": "Try a different search term",
          "no-results": "No spaces found matching your search",
          "search-placeholder": "Search spaces...",
          "no-description": "No description",
          "fetch-error": "Failed to load spaces",
          "favorite-updated": "Favorite updated",
          "favorite-error": "Failed to update favorite",
          "grid-view": "Grid view",
          "list-view": "List view",
          "toggle-favorite": "Toggle favorite",
          "view-space": "View space",
          "goto-page": "Go to page",
          "category-all": "All",
          "category-app": "App",
          "category-feature": "Feature",
          "category-connector": "Connector",
          "clear-search": "Clear search",
          "badge-owned": "Owned",
          "badge-joined": "Joined",
          "badge-public": "Public"
        },
        "toc": {
          "title": "Table of Contents",
          "empty": "No Content"
        },
        creation: {
          title: "Create a space",
          name: "Name",
          desc: "Description",
          cover: "Cover ",
          icon: "Icon",
          submit: "Create Space",
          submitting: "Creating...",
          success: "Space created successfully",
          error: "Failed to create space",
          nameRequired: "Space name is required",
          nameTooLong: "Name is too long (max 100 characters)",
          iconRequired: "Icon is required",
          coverRequired: "Cover is required",
          uploadError: "Failed to upload cover",
          namePlaceholder: "Name for the space",
          descPlaceholder: "Description for the space",
          moreCover: "More Cover",
          "type": "Space Type",
          "type-placeholder": "Select space type",
          "type-normal": "Normal Space",
          "type-collaboration": "Collaboration Space",
          "type-collab-desc": "Team workspace with member management, activity feed and real-time collaboration",
          "type-normal-desc": "Standard space for organizing and sharing knowledge",
          "section-basic": "Basic Information",
          "section-basic-desc": "Set the basic information for your new space",
          "section-appearance": "Appearance",
          "section-appearance-desc": "Customize how your space looks",
          "name-required": "Space name is required",
          "name-placeholder": "Enter space name",
          "name-help": "This is the display name for your space",
          "desc-placeholder": "Describe what this space is about",
          "desc-help": "A brief description helps others understand the purpose of this space",
          "icon-help": "Choose an emoji or image as the space icon",
          "cover-upload": "Upload cover image",
          "cover-browse": "Click to browse",
          "cover-change": "Change cover",
          "cover-presets": "Or choose from presets",
          "cover-help": "A cover image makes your space more recognizable",
          "dialog-desc": "Create a new space to organize your content and collaborate with others.",
          "cancel": "Cancel",
          "creating": "Creating..."
        },
        "teamSpace": {
          "home": "Team Home",
          "overview": "Overview",
          "settings": "Settings",
          "newPage": "New Page",
          "inviteMember": "Invite Member",
          "recentPages": "Recent Pages",
          "recentActivity": "Recent Activity",
          "recentlyEdited": "Recently Edited",
          "activity": "Activity",
          "pinned": "Pinned",
          "untitled": "Untitled",
          "noPages": "No pages yet. Create your first page!",
          "createFirst": "Create Page",
          "noPinned": "No pinned pages yet",
          "members": "Members",
          "manage": "Manage",
          "viewAll": "View all {{count}} members",
          "noMembers": "No members yet",
          "stat": {
            "pages": "Pages",
            "members": "Members",
            "pinned": "Pinned",
            "activities": "Activities"
          }
        },
        "activity": {
          "empty": "No activity yet",
          "loadMore": "Load more"
        },
        "comment": {
          "empty": "No comments yet. Start the conversation!",
          "placeholder": "Write a comment... Use @ to mention",
          "replyPlaceholder": "Write a reply...",
          "submitError": "Failed to post comment",
          "deleteError": "Failed to delete comment",
          "resolveError": "Failed to update comment"
        },
        "tags": {
          "label": "Tags",
          "addPlaceholder": "Add a tag...",
          "saveError": "Failed to save tags"
        },
        "space-settings": {
          "title": "Space Settings",
          "subtitle": "Manage settings and preferences for {{name}}",
          "basic": {
            "tab": "Basic",
            "title": "General Information",
            "basic-description": "Update your space's basic information and appearance",
            "name": {
              "label": "Space Name",
              "placeholder": "Enter space name",
              "required": "Space name is required",
              "help": "This is the display name for your space"
            },
            "description": {
              "label": "Description",
              "placeholder": "Add a description for your space",
              "help": "Help others understand what this space is about"
            },
            "icon": {
              "label": "Space Icon",
              "help": "Choose an icon that represents your space"
            },
            "cover": {
              "label": "Cover Image",
              "help": "Add a cover image to make your space more visually appealing",
              "upload": "Upload cover image",
              "browse": "Click to browse files",
              "change": "Change cover",
              "remove": "Remove cover"
            },
            "save": "Save Changes",
            "cancel": "Cancel",
            "saving": "Saving...",
            "retry": "Please try again later.",
            "visibility": {
              "label": "Visibility",
              "private": "Private",
              "private-desc": "Only members can access this space",
              "public": "Public",
              "public-desc": "Anyone in the workspace can discover and read",
              "help": "Public spaces are visible to all workspace users in read-only mode"
            }
          },
          "page": {
            "tab": "Pages",
            "title": "Page Settings",
            "description": "Configure page-level settings and permissions for this space.",
            "management_title": "Page Management",
            "management_description": "Manage and organize pages in this space. Move pages to reorder the structure.",
            "search_placeholder": "Search pages...",
            "tree_title": "Page Structure",
            "pages_count": "pages",
            "empty": "No pages in this space",
            "load_error": "Failed to load page tree",
            "move_title": "Move Page",
            "move_description": "Select a new parent for \"{{name}}\"",
            "move_search": "Search target page...",
            "move_to_root": "Space root (top level)",
            "move_cancel": "Cancel",
            "move_confirm": "Move",
            "move_success": "Page moved successfully",
            "move_error": "Failed to move page"
          },
          "member": {
            "tab": "Members",
            "title": "Member Management",
            "description": "Add, remove, and manage members with access to this space."
          },
          "templates": {
            "tab": "Templates"
          },
          "archive": {
            "tab": "Archive",
            "title": "Archive Space",
            "description": "Archiving a space will hide it from the main navigation while preserving all content.",
            "warning": "What happens when you archive?",
            "warning_list": {
              "hide_nav": "The space will be hidden from basic website navigation",
              "preserve_content": "All content remains intact and accessible",
              "restore_anytime": "You can restore the space at any time",
              "reduce_clutter": "Archived spaces help reduce clutter and improve organization"
            },
            "archive_btn": "Archive Space",
            "restore_btn": "Restore Space",
            "archived_title": "This space is archived",
            "archived_description": "The space is hidden from the main navigation while all content stays intact. You can restore it at any time.",
            "confirm_title": "Archive this space?",
            "confirm_description": "Space \"{{name}}\" will be hidden from the main navigation. All content is preserved and you can restore it at any time.",
            "confirm_cancel": "Cancel",
            "success": "Space archived",
            "restore_success": "Space restored",
            "error": "Operation failed, please try again later"
          },
          "delete": {
            "tab": "Delete",
            "title": "Delete Space",
            "description": "Permanently delete this space and all its content. This action cannot be undone.",
            "warning_title": "Warning: This action is permanent",
            "warning_list": {
              "remove_immediately": "Moving this space to trash will immediately remove all content",
              "admin_restore": "Only Confluence administrators can restore spaces from trash",
              "all_content_deleted": "All pages, attachments, and settings will be deleted",
              "consider_archive": "Consider archiving the space instead if you might need it later"
            },
            "consider_title": "Before deleting, consider:",
            "consider_list": {
              "backup": "Have you backed up any important content?",
              "notify_members": "Have you notified all space members?",
              "archive_option": "Would archiving be a better option?"
            },
            "delete_btn": "Delete Space",
            "undo_warning": "This action cannot be undone",
            "confirm_title": "Permanently delete this space?",
            "confirm_description": "Space \"{{name}}\" and all of its pages will be permanently deleted. This action cannot be undone.",
            "confirm_cancel": "Cancel",
            "success": "Space \"{{name}}\" deleted",
            "error": "Failed to delete space, please try again later"
          },
          "appearance": {
            "title": "Appearance",
            "description": "Customize how your space looks"
          },
          "error": "Failed to save settings"
        },
        "collaboration": {
          "title": "Invite to Edit",
          "description": "Invite people to collaborate on this page",
          "description-with-title": "Share \"{{title}}\" with others",
          "tab-invite": "Invite",
          "tab-email": "Email",
          "tab-manage": "Manage",
          "search-placeholder": "Search by name or email...",
          "no-users-found": "No users found",
          "permission-view": "Can view",
          "permission-view-desc": "Can only view the page",
          "permission-edit": "Can edit",
          "permission-edit-desc": "Can view and edit the page",
          "permission-admin": "Full access",
          "permission-admin-desc": "Can manage collaborators",
          "invite-button": "Invite",
          "invite-sending": "Sending...",
          "invite-success": "Successfully invited {{count}} user(s)",
          "invite-error": "Failed to send invitation",
          "invite-select-user": "Please select at least one user to invite",
          "email-label": "Email Addresses",
          "email-placeholder": "Enter email addresses...",
          "email-hint": "Press Enter or comma to add each email",
          "email-send": "Send Invitation",
          "email-sending": "Sending...",
          "email-success": "Invitation sent to {{count}} email(s)",
          "email-error": "Failed to send email invitation",
          "email-required": "Please enter at least one email address",
          "manage-no-collaborators": "No collaborators yet",
          "manage-no-collaborators-hint": "Invite people to start collaborating",
          "collaborator-removed": "Collaborator removed",
          "collaborator-remove-error": "Failed to remove collaborator",
          "permission-updated": "Permission updated",
          "permission-update-error": "Failed to update permission",
          "share-link": "Share Link",
          "public": "Public",
          "private": "Private",
          "link-copied": "Link copied to clipboard",
          "link-copy-error": "Failed to copy link"
        },
        "pageEditor": {
          "tabBar": {
            "close": "Close",
            "closeOthers": "Close Others",
            "closeRight": "Close Tabs to the Right",
            "closeAll": "Close All",
            "untitled": "Untitled"
          }
        },
        "graph": {
          "title": "Relation Graph",
          "stats": "{{nodes}} pages · {{edges}} links",
          "filter": "Filter pages...",
          "reset": "Reset view",
          "refresh": "Refresh",
          "retry": "Retry",
          "loading": "Building relation graph...",
          "error": "Failed to load relation graph",
          "empty": "No page relations yet",
          "emptyHint": "Link pages with [[ ]] or page references, and their relationships will show up here",
          "legend": "Spaces",
          "clearFocus": "Clear focus",
          "zoomIn": "Zoom in",
          "zoomOut": "Zoom out",
          "untitled": "Untitled"
        },
        "recent": {
          "title": "Recent"
        },
        "favorites": {
          "title": "Favorites",
          "viewAll": "View all",
          "allFavorites": "All Favorites",
          "empty": "Star pages for quick access",
          "add": "Add to favorites"
        },
        "pages": {
          "title": "Pages",
          "empty": "No pages yet"
        },
        "page": {
          "title": "Page",
          "create": "New Page",
          "copyLink": "Copy link",
          "moveToTrash": "Move to trash"
        },
        "editor": {
          "versionHistory": "Version history",
          "asMarkdown": "As Markdown",
          "exportMarkdownFailed": "Failed to export as Markdown",
          "version": {
            "current": "Current",
            "draft": "Draft",
            "empty": "No versions yet",
            "restore": "Restore",
            "cancel": "Cancel",
            "loadFailed": "Failed to load version history",
            "restoreSuccess": "Restored to version {{version}}",
            "restoreFailed": "Failed to restore version",
            "refreshFailed": "Restored on server — reload the page to see it",
            "confirmTitle": "Restore this version?",
            "confirmDesc": "The page will be restored to version {{version}}. This creates a new version — the current content is kept in history and nothing is lost."
          }
        },
        "template": {
          "title": "Templates",
          "emptyTitle": "No team templates yet",
          "emptyDesc": "Save any page as a template to share it with your team. Team members can use templates to create new pages quickly.",
          "use": "Use Template",
          "useError": "Failed to create page from template",
          "deleted": "Template deleted",
          "deleteError": "Failed to delete template",
          "saveAsTemplate": "Save as Template",
          "untitled": "Untitled Template",
          "selectTemplate": "Select Template",
          "allTemplates": "All Templates",
          "loadFailed": "Failed to load templates",
          "deleteSuccess": "Template deleted",
          "deleteFailed": "Failed to delete template",
          "useFailed": "Failed to use template",
          "dialogTitle": "Save as Template",
          "dialogDesc": "Save the current page as a reusable template",
          "sectionInfo": "Template Info",
          "sectionInfoDesc": "Fill in the template information",
          "author": "Author",
          "nameLabel": "Template Name",
          "namePlaceholder": "Enter template name",
          "nameRequired": "Template name is required",
          "cover": "Cover",
          "description": "Description",
          "descPlaceholder": "Enter template description",
          "cancel": "Cancel",
          "confirm": "Save",
          "saveSuccess": "Template saved successfully",
          "saveFailed": "Failed to save template"
        },
        "import": {
          "title": "Import"
        },
        "export": {
          "title": "Export"
        },
        "settings": {
          "title": "Settings"
        },
        "trash": {
          "title": "Trash",
          "empty": "Trash is empty",
          "restore": "Restore"
        },
        "search": {
          "placeholder": "Search pages and content...",
          "empty": "No results found.",
          "pages": "Pages",
          "content": "Content",
          "searching": "Searching...",
          "quickActions": "Quick Actions"
        },
        "space": {
          "title": "Space",
          "personal": "Personal Space"
        },
        "share": {
          "title": "Share",
          "description": "Invite people to collaborate on this page",
          "description-with-title": "Share \"{{title}}\"",
          "input-placeholder": "Search people or enter an email...",
          "invite": "Invite",
          "invite-empty": "Select a user or enter an email first",
          "invite-success": "Sent {{count}} invitation(s)",
          "invite-error": "Failed to send invitation",
          "invite-email": "Invite {{email}}",
          "people-with-access": "People with access",
          "inherited-from-role": "Inherited from space role ({{role}})",
          "no-access": "No collaborators yet",
          "role-owner": "Owner",
          "role-admin": "Admin",
          "role-member": "Member",
          "role-guest": "Guest",
          "link-title": "Share link",
          "link-off": "Off",
          "link-anyone-view": "Anyone with the link can view",
          "link-anyone-edit": "Anyone with the link can edit",
          "link-perm-view": "Can view",
          "link-perm-edit": "Can edit",
          "expiry-never": "Never expires",
          "expiry-7d": "7 days",
          "expiry-30d": "30 days",
          "reset-link": "Reset link",
          "reset-link-tip": "The old link will stop working after reset",
          "copy-link": "Copy link",
          "link-updated": "Share link updated",
          "link-disabled": "Share link disabled",
          "link-error": "Failed to update share link",
          "expires-at": "Expires {{time}}"
        },
        "sharedPage": {
          "invalid-link": "Invalid share link",
          "resolve-error": "Failed to open the share link",
          "loading": "Loading shared page...",
          "unavailable": "Link unavailable",
          "back-home": "Back to home",
          "untitled": "Untitled",
          "read-only": "Read-only",
          "expires-at": "Expires {{time}}",
          "enter-edit": "Open in editor"
        },
        "inviteLanding": {
          "title": "Page collaboration invitation",
          "subtitle": "{{name}} invited you to collaborate on this page",
          "inviter": "Invited by",
          "already-accepted": "You have already accepted this invitation",
          "open-page": "Open page",
          "accept": "Accept invitation",
          "expires-at": "Expires {{time}}"
        },
        "members": {
          "title": "Space Members",
          "subtitle": "Manage who has access to this space",
          "invite": "Invite",
          "inviteTitle": "Invite Members",
          "inviteDesc": "Search by name or email to invite members to this space.",
          "add": "Add",
          "allRoles": "All roles",
          "cancel": "Cancel",
          "empty": "No members yet",
          "emptyDesc": "Invite team members to start collaborating",
          "fetchError": "Failed to load members",
          "filterPlaceholder": "Search members...",
          "searchPlaceholder": "Search users...",
          "noResults": "No users found",
          "noMatch": "No members match the filter",
          "invited": "Member invited successfully",
          "inviteError": "Failed to invite member",
          "joined": "Joined",
          "invitedBy": "by {{name}}",
          "pagePending": "Page: {{title}}",
          "spacePending": "Space invitation",
          "unknownInvitee": "Unknown invitee",
          "pendingTitle": "Pending Invitations",
          "noPending": "No pending invitations",
          "revoke": "Revoke",
          "invitationRevoked": "Invitation revoked",
          "revokeError": "Failed to revoke invitation",
          "makeAdmin": "Make Admin",
          "makeMember": "Make Member",
          "makeGuest": "Make Guest",
          "remove": "Remove",
          "removed": "Member removed",
          "removeError": "Failed to remove member",
          "roleUpdated": "Role updated",
          "roleError": "Failed to update role",
          "transfer": "Transfer Ownership",
          "transferTitle": "Transfer ownership?",
          "transferDesc": "Transfer ownership of this space to {{name}}. You will become an Admin and this cannot be undone by you.",
          "transferConfirm": "Transfer",
          "transferred": "Ownership transferred",
          "transferError": "Failed to transfer ownership",
          "leave": "Leave Space",
          "leaveTitle": "Leave this space?",
          "leaveDesc": "You will lose access to all pages in this space. You can rejoin only by invitation.",
          "leaveConfirm": "Leave",
          "left": "You have left the space",
          "leaveError": "Failed to leave the space",
          "you": "(you)"
        },
      }
    },
  }
})
