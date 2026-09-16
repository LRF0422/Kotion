import ReactDOM from 'react-dom/client'
import React from 'react'
import "@kn/ui/globals.css"
import { App } from './App'
import { initAnalytics } from './ops/analytics'
import { preloadRemoteCopy } from './ops/content'

// 自托管埋点：会话/访客/归因初始化，失败不影响页面
initAnalytics()

/**
 * 先合并后端已发布文案（带超时兜底），再渲染，避免首屏文案跳动。
 * 后端不可达时直接使用内置 resources.ts。
 */
async function bootstrap() {
  try {
    await preloadRemoteCopy()
  } catch {
    /* 回退到内置文案 */
  }
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <App />
  )
}

void bootstrap()
