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



interface DefaultPluginProps extends PluginConfig {

}
class DefaultPlugin extends KPlugin<DefaultPluginProps> {

}

export const DefaultPluginInstance = new DefaultPlugin({
  name: 'Default',
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
      }
    },
  }
})
