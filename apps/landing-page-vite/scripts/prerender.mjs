#!/usr/bin/env node
/**
 * 构建期 SEO 预渲染（P1-2 / P1-4）。
 *
 * 背景：落地页是 Vite SPA，nginx 用 `try_files $uri /index.html` 兜底，因此
 *   1) 所有路由共享同一份 `<title>/<meta>/<link rel=canonical>`，爬虫看到的是重复内容；
 *   2) 任意不存在的路径都返回 200，形成软 404。
 *
 * 做法（不引入 headless 浏览器）：
 *   - 读取 `vite build` 产物 `dist/index.html` 作为模板；
 *   - 为「路由白名单」中的每个路由 + 语言变体生成 `dist/<route>/index.html`，
 *     注入该路由专属的 title/description/canonical/hreflang/OG/Twitter 与
 *     BreadcrumbList 结构化数据；
 *   - 生成 `dist/sitemap.xml`（含分语言 alternates）与 `dist/404.html`。
 *
 * 说明：这是「meta 级预渲染」，解决元信息重复与发现性问题；首屏正文仍由
 * 客户端渲染。若后续需要正文也可被抓取，可在此基础上接 headless 渲染，
 * 或在 P2 评估整站 SSG。
 *
 * 默认元信息与 landing app 内置的 `src/ops/seo.ts` 保持一致：当后台 CMS 已为
 * 某路由配置了 SEO，运行时动态 head 会覆盖这里的静态值。
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const DIST = path.join(ROOT, 'dist')
const ORIGIN = process.env.LANDING_ORIGIN || 'https://kotion.top'

/** 需要产出静态 HTML 的路由白名单（同时作为软 404 的判定依据）。 */
const ROUTES = [
  { path: '/', changefreq: 'weekly', priority: '1.0' },
  { path: '/templates', changefreq: 'weekly', priority: '0.8' },
  { path: '/plugins', changefreq: 'weekly', priority: '0.8' },
  { path: '/doc', changefreq: 'weekly', priority: '0.6' },
  { path: '/changelog', changefreq: 'weekly', priority: '0.6' },
]

/** 每个路由的内置元信息（zh / en）。 */
const COPY = {
  '/': {
    zh: {
      title: 'Kotion · 一体化知识管理与协作工作台',
      description:
        'Kotion 是开源的一体化知识工作台：文档、多维表格、白板、AI 与实时协作，支持自托管。20+ 插件，MIT 协议。',
    },
    en: {
      title: 'Kotion · All-in-one knowledge & collaboration workspace',
      description:
        'Kotion is an open-source knowledge workspace: docs, databases, whiteboards, AI and realtime collaboration. Self-hostable, 20+ plugins, MIT licensed.',
    },
  },
  '/templates': {
    zh: { title: '模板库 · Kotion', description: '开箱即用的文档、项目管理、学习与生活模板，一键复制到你的 Kotion 工作区。' },
    en: { title: 'Templates · Kotion', description: 'Ready-to-use doc, project, study and life templates. Copy any template into your Kotion workspace in one click.' },
  },
  '/plugins': {
    zh: { title: '插件市场 · Kotion', description: '20+ 官方与社区插件：多维表格、白板、思维导图、图表、AI 与开发者工具，按需扩展你的工作台。' },
    en: { title: 'Plugin marketplace · Kotion', description: '20+ first-party and community plugins: databases, whiteboards, mind maps, diagrams, AI and developer tools.' },
  },
  '/doc': {
    zh: { title: '文档 · Kotion', description: '从入门到自托管部署的完整文档：核心概念、编辑器、插件开发、AI 能力与 API 参考。' },
    en: { title: 'Documentation · Kotion', description: 'Everything from quick start to self-hosting: core concepts, editor, plugin development, AI features and API reference.' },
  },
  '/changelog': {
    zh: { title: '更新日志 · Kotion', description: 'Kotion 每个版本的发布说明与新特性。' },
    en: { title: 'Changelog · Kotion', description: 'Release notes and new features for every Kotion version.' },
  },
}

const LOCALES = [
  { key: 'zh', htmlLang: 'zh-CN', pathPrefix: '' },
  { key: 'en', htmlLang: 'en', pathPrefix: '/en' },
]

/** 路由在某个语言下的绝对路径。 */
const localizedPath = (locale, routePath) => {
  if (locale.pathPrefix === '') return routePath
  return routePath === '/' ? `${locale.pathPrefix}` : `${locale.pathPrefix}${routePath}`
}

const absolute = (p) => `${ORIGIN}${p === '/' ? '/' : p}`

const escapeHtml = (value) =>
  String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** 生成 canonical 目标：中文无前缀，英文带 /en。 */
const canonicalFor = (routePath, locale) =>
  absolute(locale.key === 'en' ? localizedPath(locale, routePath) : routePath)

const alternateLinks = (routePath) =>
  [
    `<link rel="alternate" hreflang="zh-CN" href="${absolute(routePath)}"/>`,
    `<link rel="alternate" hreflang="en" href="${absolute(localizedPath(LOCALES[1], routePath))}"/>`,
    `<link rel="alternate" hreflang="x-default" href="${absolute(routePath)}"/>`,
  ].join('\n    ')

const breadcrumb = (routePath, locale, title) => {
  if (routePath === '/') return null
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: locale.key === 'zh' ? '首页' : 'Home', item: absolute(localizedPath(locale, '/')) },
      { '@type': 'ListItem', position: 2, name: title, item: canonicalFor(routePath, locale) },
    ],
  }
}

/**
 * 用路由专属的 head 替换模板中的 head 片段。
 * 依赖 index.html 中存在 `<!--seo-head-->` 锚点；缺失时退化为正则替换。
 */
const buildHtml = (template, routePath, locale) => {
  const copy = (COPY[routePath] || COPY['/'])[locale.key]
  const canonical = canonicalFor(routePath, locale)
  const ogImage = `${ORIGIN}/og-image.png`
  const jsonLd = breadcrumb(routePath, locale, copy.title)

  const head = [
    `<title>${escapeHtml(copy.title)}</title>`,
    `<meta name="description" content="${escapeHtml(copy.description)}"/>`,
    `<link rel="canonical" href="${canonical}"/>`,
    alternateLinks(routePath),
    `<meta property="og:type" content="website"/>`,
    `<meta property="og:site_name" content="Kotion"/>`,
    `<meta property="og:title" content="${escapeHtml(copy.title)}"/>`,
    `<meta property="og:description" content="${escapeHtml(copy.description)}"/>`,
    `<meta property="og:url" content="${canonical}"/>`,
    `<meta property="og:image" content="${ogImage}"/>`,
    `<meta property="og:locale" content="${locale.key === 'zh' ? 'zh_CN' : 'en_US'}"/>`,
    `<meta name="twitter:card" content="summary_large_image"/>`,
    `<meta name="twitter:title" content="${escapeHtml(copy.title)}"/>`,
    `<meta name="twitter:description" content="${escapeHtml(copy.description)}"/>`,
    `<meta name="twitter:image" content="${ogImage}"/>`,
    jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : '',
  ]
    .filter(Boolean)
    .join('\n    ')

  let html = template
  // 1) 替换标题
  html = html.replace(/<title>[\s\S]*?<\/title>/, '')
  // 2) 移除模板里已有的 description / canonical / hreflang / og / twitter，避免重复标签
  html = html.replace(/\s*<meta\s+name="description"[\s\S]*?\/?>/g, '')
  html = html.replace(/\s*<link\s+rel="canonical"[\s\S]*?\/?>/g, '')
  html = html.replace(/\s*<link\s+rel="alternate"[\s\S]*?\/?>/g, '')
  html = html.replace(/\s*<meta\s+property="og:[^"]*"[\s\S]*?\/?>/g, '')
  html = html.replace(/\s*<meta\s+name="twitter:[^"]*"[\s\S]*?\/?>/g, '')
  // 3) 移除模板里的 SoftwareApplication JSON-LD（保留为首页专属）
  html = html.replace(/\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '')
  // 4) 注入本路由 head
  html = html.replace('</head>', `  ${head}\n  </head>`)
  // 5) html lang
  html = html.replace(/<html\s+lang="[^"]*"/, `<html lang="${locale.htmlLang}"`)
  return html
}

const buildSitemap = () => {
  const entries = []
  for (const route of ROUTES) {
    const lastmod = new Date().toISOString().slice(0, 10)
    for (const locale of LOCALES) {
      const loc = absolute(localizedPath(locale, route.path))
      entries.push(
        [
          '  <url>',
          `    <loc>${loc}</loc>`,
          `    <xhtml:link rel="alternate" hreflang="zh-CN" href="${absolute(route.path)}"/>`,
          `    <xhtml:link rel="alternate" hreflang="en" href="${absolute(localizedPath(LOCALES[1], route.path))}"/>`,
          `    <lastmod>${lastmod}</lastmod>`,
          `    <changefreq>${route.changefreq}</changefreq>`,
          `    <priority>${route.priority}</priority>`,
          '  </url>',
        ].join('\n'),
      )
    }
  }
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...entries,
    '</urlset>',
    '',
  ].join('\n')
}

const buildRobots = () =>
  ['User-agent: *', 'Allow: /', 'Disallow: /api/', 'Disallow: /c/', '', `Sitemap: ${ORIGIN}/sitemap.xml`, ''].join('\n')

const build404 = (template) => buildHtml(template, '/', LOCALES[0])

const main = async () => {
  const indexPath = path.join(DIST, 'index.html')
  if (!existsSync(indexPath)) {
    console.error(`[prerender] 未找到 ${indexPath}，请先执行 vite build`)
    process.exit(1)
  }
  const template = await readFile(indexPath, 'utf8')
  let count = 0

  for (const route of ROUTES) {
    for (const locale of LOCALES) {
      const localized = localizedPath(locale, route.path)
      const html = buildHtml(template, route.path, locale)
      if (localized === '/') {
        await writeFile(indexPath, html, 'utf8')
      } else {
        const target = path.join(DIST, localized.replace(/^\//, ''), 'index.html')
        await mkdir(path.dirname(target), { recursive: true })
        await writeFile(target, html, 'utf8')
      }
      count++
    }
  }

  await writeFile(path.join(DIST, 'sitemap.xml'), buildSitemap(), 'utf8')
  await writeFile(path.join(DIST, 'robots.txt'), buildRobots(), 'utf8')
  await writeFile(path.join(DIST, '404.html'), build404(template), 'utf8')

  console.log(`[prerender] 生成 ${count} 个路由 HTML + sitemap.xml + robots.txt + 404.html`)
}

main().catch((error) => {
  console.error('[prerender] 失败：', error)
  process.exit(1)
})
