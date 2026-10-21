/**
 * The pre-mount boot splash: markup + styles injected into `index.html` by
 * {@link bootSplashPlugin}, so something on-brand paints **before** the app's
 * (very large) module graph and plugin bundles finish loading.
 *
 * Visual source of truth: `design/boot-splash-flat/` — the flat version of the
 * "Lumen" direction (brand tile, KOTION, stage line, flat progress rule; solid
 * colour fields, no shadows/glows/gradients). Keep `./boot-splash.ts` in sync
 * with the ids/classes declared here. This file must stay dependency-free and
 * side-effect free: the Vite and electron-vite configs import it from Node.
 *
 * Design constraints the CSS relies on:
 * - Base surfaces are the app's own tokens (`#ffffff` / `#191919`), so there is
 *   no brightness jump when the shell appears.
 * - The only theme switch is `html.dark`, applied by the inline pre-paint script
 *   in `index.html`; language comes from `html[lang^="zh"]`.
 * - `prefers-reduced-motion` disables every animation while leaving the
 *   composition complete (and the progress rule lit).
 * - The slow-loader hint reveals itself after 8s with CSS only; the retry button
 *   is a plain inline `onclick` so it works before any module has executed.
 */

export const bootSplashMarkup = String.raw`<div id="kn-boot" class="kn-boot" role="status" aria-live="polite">

  <div class="kn-boot__content">
    <div class="kn-boot__mark" aria-hidden="true">
      <div class="kn-boot__tile"><span class="kn-boot__monogram">KN</span></div>
      <svg class="kn-boot__sparkle kn-boot__sparkle--s1" viewBox="0 0 21 21"><path fill="currentColor" d="M9.82531.843845C10.0553.215178 10.9446.215178 11.1746.843845L11.8618 2.72026C12.4006 4.19229 12.3916 6.39157 13.5 7.5C14.6084 8.60843 16.8077 8.59935 18.2797 9.13822L20.1561 9.82534C20.7858 10.0553 20.7858 10.9447 20.1561 11.1747L18.2797 11.8618C16.8077 12.4007 14.6084 12.3916 13.5 13.5C12.3916 14.6084 12.4006 16.8077 11.8618 18.2798L11.1746 20.1562C10.9446 20.7858 10.0553 20.7858 9.82531 20.1562L9.13819 18.2798C8.59932 16.8077 8.60843 14.6084 7.5 13.5C6.39157 12.3916 4.19225 12.4007 2.72023 11.8618L.843814 11.1747C.215148 10.9447.215148 10.0553.843814 9.82534L2.72023 9.13822C4.19225 8.59935 6.39157 8.60843 7.5 7.5C8.60843 6.39157 8.59932 4.19229 9.13819 2.72026L9.82531.843845Z"/></svg>
      <svg class="kn-boot__sparkle kn-boot__sparkle--s2" viewBox="0 0 21 21"><path fill="currentColor" d="M9.82531.843845C10.0553.215178 10.9446.215178 11.1746.843845L11.8618 2.72026C12.4006 4.19229 12.3916 6.39157 13.5 7.5C14.6084 8.60843 16.8077 8.59935 18.2797 9.13822L20.1561 9.82534C20.7858 10.0553 20.7858 10.9447 20.1561 11.1747L18.2797 11.8618C16.8077 12.4007 14.6084 12.3916 13.5 13.5C12.3916 14.6084 12.4006 16.8077 11.8618 18.2798L11.1746 20.1562C10.9446 20.7858 10.0553 20.7858 9.82531 20.1562L9.13819 18.2798C8.59932 16.8077 8.60843 14.6084 7.5 13.5C6.39157 12.3916 4.19225 12.4007 2.72023 11.8618L.843814 11.1747C.215148 10.9447.215148 10.0553.843814 9.82534L2.72023 9.13822C4.19225 8.59935 6.39157 8.60843 7.5 7.5C8.60843 6.39157 8.59932 4.19229 9.13819 2.72026L9.82531.843845Z"/></svg>
      <svg class="kn-boot__sparkle kn-boot__sparkle--s3" viewBox="0 0 21 21"><path fill="currentColor" d="M9.82531.843845C10.0553.215178 10.9446.215178 11.1746.843845L11.8618 2.72026C12.4006 4.19229 12.3916 6.39157 13.5 7.5C14.6084 8.60843 16.8077 8.59935 18.2797 9.13822L20.1561 9.82534C20.7858 10.0553 20.7858 10.9447 20.1561 11.1747L18.2797 11.8618C16.8077 12.4007 14.6084 12.3916 13.5 13.5C12.3916 14.6084 12.4006 16.8077 11.8618 18.2798L11.1746 20.1562C10.9446 20.7858 10.0553 20.7858 9.82531 20.1562L9.13819 18.2798C8.59932 16.8077 8.60843 14.6084 7.5 13.5C6.39157 12.3916 4.19225 12.4007 2.72023 11.8618L.843814 11.1747C.215148 10.9447.215148 10.0553.843814 9.82534L2.72023 9.13822C4.19225 8.59935 6.39157 8.60843 7.5 7.5C8.60843 6.39157 8.59932 4.19229 9.13819 2.72026L9.82531.843845Z"/></svg>
      <svg class="kn-boot__sparkle kn-boot__sparkle--s4" viewBox="0 0 21 21"><path fill="currentColor" d="M9.82531.843845C10.0553.215178 10.9446.215178 11.1746.843845L11.8618 2.72026C12.4006 4.19229 12.3916 6.39157 13.5 7.5C14.6084 8.60843 16.8077 8.59935 18.2797 9.13822L20.1561 9.82534C20.7858 10.0553 20.7858 10.9447 20.1561 11.1747L18.2797 11.8618C16.8077 12.4007 14.6084 12.3916 13.5 13.5C12.3916 14.6084 12.4006 16.8077 11.8618 18.2798L11.1746 20.1562C10.9446 20.7858 10.0553 20.7858 9.82531 20.1562L9.13819 18.2798C8.59932 16.8077 8.60843 14.6084 7.5 13.5C6.39157 12.3916 4.19225 12.4007 2.72023 11.8618L.843814 11.1747C.215148 10.9447.215148 10.0553.843814 9.82534L2.72023 9.13822C4.19225 8.59935 6.39157 8.60843 7.5 7.5C8.60843 6.39157 8.59932 4.19229 9.13819 2.72026L9.82531.843845Z"/></svg>
    </div>

    <div class="kn-boot__wordmark">KOTION</div>

    <div class="kn-boot__status">
      <div id="kn-boot-stage" class="kn-boot__stage">
        <span class="kn-boot__stage-zh">正在启动…</span><span class="kn-boot__stage-en">Starting…</span>
      </div>
      <div id="kn-boot-bar" class="kn-boot__bar" role="progressbar" aria-label="Loading">
        <div id="kn-boot-bar-fill" class="kn-boot__bar-fill"></div>
      </div>
      <div id="kn-boot-hint" class="kn-boot__hint">
        <span class="kn-boot__hint-zh">启动时间比平常久一些。<button type="button" class="kn-boot__retry" onclick="location.reload()">重新加载</button></span>
        <span class="kn-boot__hint-en">Taking a little longer than usual.<button type="button" class="kn-boot__retry" onclick="location.reload()">Reload</button></span>
      </div>
    </div>
  </div>
</div>`

export const bootSplashStyle = String.raw`/* Kotion boot splash — FLAT restyle of the "Lumen" direction.
   Same composition as before (brand tile, KOTION, stage line, progress rule),
   but flat: solid colour fields, hard edges, no shadows, no glows, no grain,
   no gradient ramps. Dark base is the app's real #191919, light is #ffffff. */

html, body { margin: 0; padding: 0; background-color: #ffffff; }
html.dark, html.dark body { background-color: #191919; }

.kn-boot {
  --bg: #ffffff;
  --fg: #26231e;
  --muted: #787774;
  --track: rgba(38, 35, 30, 0.10);
  --accent: #ec4899;
  --accent-warm: #fb923c;
  --spark-neutral: rgba(38, 35, 30, 0.45);
  position: fixed;
  inset: 0;
  z-index: 2147483600;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: var(--bg);
  color: var(--fg);
  font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  user-select: none;
  -webkit-user-select: none;
  transition: opacity 200ms linear;
}
html.dark .kn-boot {
  --bg: #191919;
  --fg: #e6e2da;
  --muted: #9a968e;
  --track: rgba(230, 226, 218, 0.12);
  --spark-neutral: rgba(230, 226, 218, 0.5);
}
.kn-boot * { box-sizing: border-box; }
.kn-boot--leaving { opacity: 0; pointer-events: none; }

.kn-boot__content {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px;
  animation: kn-flat-in 520ms cubic-bezier(0.2, 0.7, 0.3, 1) both;
}

/* ---- brand tile: flat two-colour block, hard edge, no depth ---- */
.kn-boot__mark {
  position: relative;
  width: 104px;
  height: 104px;
}
.kn-boot__tile {
  width: 100%;
  height: 100%;
  border-radius: 30px;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, var(--accent-warm) 0 50%, var(--accent) 50% 100%);
}
.kn-boot__monogram {
  font-size: 38px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.03em;
  padding-top: 1px;
  color: #fff;
}

/* ---- flat sparkles: solid glyphs, opacity only ---- */
.kn-boot__sparkle {
  position: absolute;
  display: block;
  opacity: 0;
  animation: kn-flat-twinkle 4.2s ease-in-out infinite;
}
.kn-boot__sparkle--s1 { top: -13px; right: -12px; width: 16px; height: 16px; color: var(--accent-warm); animation-delay: 0.3s; }
.kn-boot__sparkle--s2 { top: 9px; right: -30px; width: 10px; height: 10px; color: var(--accent); animation-delay: 1.5s; }
.kn-boot__sparkle--s3 { bottom: 4px; left: -20px; width: 9px; height: 9px; color: var(--accent); animation-delay: 2.6s; }
.kn-boot__sparkle--s4 { top: 2px; left: -18px; width: 10px; height: 10px; color: var(--spark-neutral); animation-delay: 3.4s; }

/* ---- labels ---- */
.kn-boot__wordmark {
  margin-top: 24px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.18em;
  text-indent: 0.18em;
  color: var(--muted);
}
.kn-boot__status {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 12px;
}
.kn-boot__stage {
  font-size: 13px;
  line-height: 1.4;
  letter-spacing: 0.01em;
  color: var(--muted);
}
.kn-boot__stage-zh,
.kn-boot__hint-zh { display: none; }
.kn-boot__stage-en,
.kn-boot__hint-en { display: inline; }
html[lang^="zh"] .kn-boot__stage-zh,
html[lang^="zh"] .kn-boot__hint-zh { display: inline; }
html[lang^="zh"] .kn-boot__stage-en,
html[lang^="zh"] .kn-boot__hint-en { display: none; }

/* ---- progress rule: flat track + one solid travelling segment ---- */
.kn-boot__bar {
  position: relative;
  width: 200px;
  height: 3px;
  margin-top: 14px;
  border-radius: 99px;
  background: var(--track);
  overflow: hidden;
}
.kn-boot__bar-fill {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 16%;
  border-radius: inherit;
  background: var(--accent-warm);
  animation: kn-flat-creep 3.4s ease-in-out infinite alternate;
  transition: width 620ms cubic-bezier(0.2, 0.7, 0.3, 1);
}
.kn-boot[data-phase="plugins"] .kn-boot__bar-fill {
  width: 46%;
  animation: none;
}
.kn-boot[data-phase="workspace"] .kn-boot__bar-fill {
  width: 78%;
  animation: none;
}
.kn-boot[data-state="done"] .kn-boot__bar-fill {
  width: 100%;
  animation: none;
  transition-duration: 420ms;
}

/* ---- slow-loader hint ---- */
.kn-boot__hint {
  margin-top: 16px;
  min-height: 18px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--muted);
  opacity: 0;
  animation: kn-flat-hint 300ms linear 8s forwards;
}
.kn-boot__retry {
  appearance: none;
  margin: 0 0 0 3px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--fg);
  font: inherit;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}
.kn-boot__retry:hover { color: var(--accent); }

@keyframes kn-flat-in {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}
@keyframes kn-flat-creep {
  from { width: 10%; }
  to { width: 22%; }
}
@keyframes kn-flat-twinkle {
  0%, 100% { opacity: 0; }
  35%, 60% { opacity: 1; }
}
@keyframes kn-flat-hint {
  from { opacity: 0; }
  to { opacity: 1; }
}

@media (max-width: 680px) {
  .kn-boot__mark { width: 86px; height: 86px; }
  .kn-boot__tile { border-radius: 25px; }
  .kn-boot__monogram { font-size: 31px; }
  .kn-boot__wordmark { margin-top: 21px; }
  .kn-boot__bar { width: 172px; }
}
@media (max-height: 560px) {
  .kn-boot__mark { width: 74px; height: 74px; }
  .kn-boot__tile { border-radius: 22px; }
  .kn-boot__monogram { font-size: 27px; }
  .kn-boot__wordmark { margin-top: 18px; }
}

@media (prefers-reduced-motion: reduce) {
  .kn-boot,
  .kn-boot * {
    animation: none !important;
    transition: none !important;
  }
  .kn-boot__sparkle { opacity: 0.9; }
  .kn-boot__bar-fill { width: 62%; animation: none; }
  .kn-boot__hint { opacity: 1; }
}
`

/** Minimal Vite/electron-vite plugin: inject the splash before the app module graph. */
export function bootSplashPlugin(): {
  name: string
  transformIndexHtml(html: string, ctx?: { filename?: string }): { html: string; tags: [] }
} {
  return {
    name: 'kn-boot-splash',
    transformIndexHtml(html: string, ctx?: { filename?: string }) {
      // The desktop app builds three HTML entries: the shell (`index.html`), the
      // region-capture overlay and the frameless consent window. Only the shell
      // boots the workspace — the other two are transparent/black overlays that
      // must never get a full-screen splash.
      const filename = (ctx?.filename ?? '').replace(/\\/g, '/')
      if (filename && !/(^|\/)index\.html$/.test(filename)) return { html, tags: [] }
      // Idempotent: a hot reload may re-run the hook with the same source.
      const markup = html.includes('id="kn-boot"') ? '' : bootSplashMarkup
      const withMarkup = markup
        ? html.replace(/<body([^>]*)>/i, (match: string) => `${match}\n${markup}`)
        : html
      const withStyle = withMarkup.includes('data-kn-boot')
        ? withMarkup
        : withMarkup.replace(/<\/head>/i, `<style data-kn-boot>${bootSplashStyle}</style>\n</head>`)
      return { html: withStyle, tags: [] }
    },
  }
}
