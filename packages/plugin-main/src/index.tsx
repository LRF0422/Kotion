import { Home } from './pages/Home'
import { Spaces } from './pages/Spaces'
import { SpaceDetail } from './pages/SpaceDetail'
import { PageViewer } from './pages/SpaceDetail/PageViewer'
import { PageEditor } from './pages/SpaceDetail/PageEditor'
import { SpaceSettings } from './pages/SpaceDetail/Settings'
import { InviteCollaboration } from './pages/InviteCollaboration'
import { SpaceHub } from './pages/SpaceHub'
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
    {
      name: '/space-detail/:id',
      path: '/space-detail/:id',
      element: <SpaceDetail />,
      children: [
        {
          name: '/space-detail/:id/page/:pageId',
          path: '/space-detail/:id/page/:pageId',
          element: <PageViewer />
        },
        {
          name: '/space-detail/:id/page/edit/:pageId',
          path: '/space-detail/:id/page/edit/:pageId',
          element: <PageEditor />
        },
        {
          name: '/space-detail/:id/settings',
          path: '/space-detail/:id/settings',
          element: <SpaceSettings />
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
          "learning": "学习使用 Knowledge",
          "coming-soon-desc": "功能即将上线，敬请期待！",
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
          "no-description": "暂无描述"
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
          moreCover: "更多封面"
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
              "required": "空间名称是必填项"
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
            "saving": "保存中..."
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
            "archive_btn": "归档空间"
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
            "undo_warning": "此操作无法撤消"
          }
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
          "learning": "Learn Knowledge",
          "coming-soon-desc": "This feature is coming soon, stay tuned!",
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
          "no-description": "No description"
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
          moreCover: "More Cover"
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
              "required": "Space name is required"
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
            "saving": "Saving..."
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
            "archive_btn": "Archive Space"
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
            "undo_warning": "This action cannot be undone"
          }
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
      }
    },
  }
})
