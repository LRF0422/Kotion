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
          icon: "图标"
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
          icon: "Icon"
        },
      }
    },
  }
})
