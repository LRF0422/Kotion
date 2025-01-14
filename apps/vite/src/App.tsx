import { Layout } from './pages/components/Layout'
import { Navigate, Route, RouterProvider, createBrowserRouter, createRoutesFromElements } from 'react-router-dom'
import { Home } from './pages/Home'
import { Provider } from 'react-redux'
import store from './store'
import { Setting } from './pages/Setting'
import { Spaces } from './pages/Spaces'
import { SpaceDetail } from './pages/SpaceDetail'
import { TemplateHub } from './pages/Templates'
import { Login } from './pages/Login'
import { Toaster } from '@repo/ui'
import { PageViewer } from './pages/SpaceDetail/PageViewer'
import { PageEditor } from './pages/SpaceDetail/PageEditor'
import { SpaceSettings } from './pages/SpaceDetail/Settings'
import { SignUpForm } from './pages/SignUp'
import { PageRoom } from './pages/PageRoom'
import { ThemeProvider } from '@repo/ui'
import { Journals } from './pages/Journals'
import { SpaceViewer } from './pages/SpaceViewer'



function App() {

  console.log('env', import.meta.env.PROD);


  const router = createBrowserRouter(createRoutesFromElements(
    [
      <Route path='/' element={<Layout />}>
        <Route path='/home' element={<Home />} />
        <Route path='/journals' element={<Journals />} />
        <Route path='/setting' element={<Setting />} />
        <Route path='/spaces' element={<Spaces />} />
        <Route path='/space-detail/:id' element={<SpaceDetail />} >
          <Route path='/space-detail/:id/page/:pageId' element={<PageViewer />} />
          <Route path='/space-detail/:id/page/edit/:pageId' element={<PageEditor />} />
          <Route path='/space-detail/:id/settings' element={<SpaceSettings />} />
        </Route>
        <Route path='/templates' element={<TemplateHub />} />
        <Route path='/' element={<Navigate to="/home" replace />} />
      </Route>,
      <Route path='/login' element={<Login />} />,
      <Route path='/spaceViewer/:spaceId' element={<SpaceViewer />} />,
      <Route path='/sign-up' element={<SignUpForm />} />,
      <Route path='/page-room/:pageId' element={<PageRoom />} />
    ]
  ))

  return <ThemeProvider>
    <Provider store={store}>
      <RouterProvider router={router} />
      <Toaster />
    </Provider>
  </ThemeProvider>

}

export default App
