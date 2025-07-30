import { Home } from './pages/Home'
import { Spaces } from './pages/Spaces'
import { SpaceDetail } from './pages/SpaceDetail'
import { PageViewer } from './pages/SpaceDetail/PageViewer'
import { PageEditor } from './pages/SpaceDetail/PageEditor'
import { SpaceSettings } from './pages/SpaceDetail/Settings'
import { KPlugin, PluginConfig } from '@kn/common'
import React from 'react'
import { LayoutGrid } from '@kn/icon'
import { TestExtension } from './editor-extensions/test-extension'
import "@kn/ui/globals.css"


interface DefaultPluginProps extends PluginConfig {
}
class DefaultPlugin extends KPlugin<DefaultPluginProps> {

}

export const DefaultPluginInstance = new DefaultPlugin({
  name: 'Default',
  status: 'ACTIVE',
  routes: [
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
  editorExtension: [TestExtension]
})
