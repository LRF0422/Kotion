import { Home } from './pages/Home'
import { Spaces } from './pages/Spaces'
import { SpaceDetail } from './pages/SpaceDetail'
import { PageViewer } from './pages/SpaceDetail/PageViewer'
import { PageEditor } from './pages/SpaceDetail/PageEditor'
import { SpaceSettings } from './pages/SpaceDetail/Settings'
import { KPlugin, PluginConfig } from '@kn/common'
import React from 'react'
import { LayoutGrid } from '@kn/icon'
import "@kn/ui/globals.css"
import { spaceService } from './service/space-service'
export * from "./service"
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
    },
  ]
  ,
  editorExtension: [],
  services: {
    spaceService: spaceService
  },
  locales: {
    "zh": {
      translation: {
        home: {
          "title": "早上好",
          "create-space": "创建空间",
          "rs": "从最近的空间开始",
          "all": "查看全部空间",
          "greeting": {
            "morning": "早上好",
            "afternoon": "下午好",
            "evening": "晚上好"
          }
        },
        "space-hub": {
          "all-space": "所有空间"
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
            "description": "为此空间配置页面级设置和权限。"
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
      }
    },
    "en": {
      translation: {
        home: {
          "title": "Good morning",
          "create-space": "Create a space",
          "rs": "Start from recent space",
          "all": "all spaces",
          "greeting": {
            "morning": "Good Morning",
            "afternoon": "Good Afternoon",
            "evening": "Good Evening"
          }
        },
        "space-hub": {
          "all-space": "All Spaces"
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
            "description": "Configure page-level settings and permissions for this space."
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
      }
    },
  }
})
