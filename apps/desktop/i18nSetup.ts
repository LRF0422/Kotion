import { i18n } from '@kn/common'
import { locales } from './locales'
import { extraLocales } from './locales.extra'

/**
 * 主动注册本插件文案：即使宿主未注入（或热重载后未重新注入），也能保证 t('dbConnector.*') 命中。
 *
 * i18n 是宿主共享实例（@kn/common 为外部模块），addResourceBundle 幂等；
 * 注意语言键下直接放 translation 命名空间内容（dbConnector.*），不要再套一层 translation，
 * 否则宿主 App.tsx 的 addResourceBundle(lng, 'translation', res[lng]) 会多包一层导致回显原始 key。
 *
 * 任何在「模块加载期」就要取文案的模块，必须先 import 本文件（本插件的 i18n.ts 已 import）。
 */
i18n.addResourceBundle('en', 'translation', locales.en, true, true)
i18n.addResourceBundle('zh', 'translation', locales.zh, true, true)

// 向导 / 查询工作区新增文案（locales.extra.ts）——注册到同一个 bundle，deep merge 不会互相覆盖。
i18n.addResourceBundle('en', 'translation', extraLocales.en, true, true)
i18n.addResourceBundle('zh', 'translation', extraLocales.zh, true, true)
