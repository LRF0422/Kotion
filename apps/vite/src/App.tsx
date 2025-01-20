import { Home } from './pages/Home'
import { Spaces } from './pages/Spaces'
import { SpaceDetail } from './pages/SpaceDetail'
import { PageViewer } from './pages/SpaceDetail/PageViewer'
import { PageEditor } from './pages/SpaceDetail/PageEditor'
import { SpaceSettings } from './pages/SpaceDetail/Settings'
import { KPlugin, PluginConfig } from '@repo/common'
import React from 'react'
import "@repo/ui/src/globals.css"


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
  ]
})

// function App() {

//   const router = createBrowserRouter(createRoutesFromElements(
//     [
//       <Route path='/' element={<Layout />}>
//         <Route path='/home' element={<Home />} />
//         <Route path='/journals' element={<Journals />} />
//         <Route path='/setting' element={<Setting />} />
//         <Route path='/spaces' element={<Spaces />} />
//         <Route path='/space-detail/:id' element={<SpaceDetail />} >
//           <Route path='/space-detail/:id/page/:pageId' element={<PageViewer />} />
//           <Route path='/space-detail/:id/page/edit/:pageId' element={<PageEditor />} />
//           <Route path='/space-detail/:id/settings' element={<SpaceSettings />} />
//         </Route>
//         <Route path='/templates' element={<TemplateHub />} />
//         <Route path='/' element={<Navigate to="/home" replace />} />
//       </Route>,
//       <Route path='/login' element={<Login />} />,
//       <Route path='/spaceViewer/:spaceId' element={<SpaceViewer />} />,
//       <Route path='/sign-up' element={<SignUpForm />} />,
//       <Route path='/page-room/:pageId' element={<PageRoom />} />
//     ]
//   ))

//   return <ThemeProvider>
//     <Provider store={store}>
//       <RouterProvider router={router} />
//       <Toaster />
//     </Provider>
//   </ThemeProvider>

// }

// export default App
