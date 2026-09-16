import ReactDOM from 'react-dom/client'
import "@kn/ui/globals.css"
import { App } from './App'
import { initAnalytics, initOpsConsentGated } from './ops/analytics'
import { initVitals } from './ops/vitals'
import { preloadRemoteCopy } from './ops/content'
import { loadOpsConfig } from './ops/config'
import { disableAnalyticsInPreview } from './ops/preview'

// 预览模式（?kn_preview=...）必须早于 initAnalytics：命中时全局关闭埋点
disableAnalyticsInPreview()

// 自托管埋点：会话/访客/归因初始化，失败不影响页面
initAnalytics()
// 同意门控：未授权先不采集，用户授权后补初始化
initOpsConsentGated()
// Core Web Vitals：仅在页面隐藏/卸载时上报一次
try {
  initVitals()
} catch {
  /* 性能采集失败不影响页面 */
}

/** 与 App.tsx 一致：/zh、/en 路径前缀优先决定初始语言，其次 localStorage / navigator。 */
function resolveInitialLocale(): string {
  try {
    const fromPath = window.location.pathname.match(/^\/(zh|en)(?=\/|$)/)?.[1]
    if (fromPath) return fromPath
    const stored = window.localStorage.getItem('language')
    if (stored && stored.startsWith('en')) return 'en'
    if (stored && stored.startsWith('zh')) return 'zh'
    return navigator.language?.toLowerCase().startsWith('en') ? 'en' : 'zh'
  } catch {
    return 'zh'
  }
}

/**
 * 先合并后端已发布文案与运营配置（两者都有超时兜底），再渲染，
 * 避免首屏文案/SEO 跳动。后端不可达时直接使用内置默认值。
 */
async function bootstrap() {
  try {
    await Promise.allSettled([preloadRemoteCopy(), loadOpsConfig(resolveInitialLocale())])
  } catch {
    /* 回退到内置文案与默认配置 */
  }
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <App />
  )
}

void bootstrap()
