/**
 * 解析当前主题的深浅色。
 *
 * 宿主把主题落在 <html class="dark"> 上（Tailwind 的 darkMode: 'class'），
 * 组件里只用到 tailwind 语义类，但 CodeMirror 的外观是命令式的，
 * 需要知道当前是深色还是浅色，并在主题切换时重新配置。
 */
import { useEffect, useState } from 'react'

function isDarkNow(): boolean {
    if (typeof document === 'undefined') return false
    return document.documentElement.classList.contains('dark')
}

export function useResolvedTheme(): boolean {
    const [dark, setDark] = useState<boolean>(isDarkNow)

    useEffect(() => {
        if (typeof document === 'undefined') return
        const target = document.documentElement
        // 观察 <html class> 的变化即可覆盖「浅 → 深 / 深 → 浅」与跟随系统两种切换路径。
        const observer = new MutationObserver(() => setDark(target.classList.contains('dark')))
        observer.observe(target, { attributes: true, attributeFilter: ['class'] })
        setDark(target.classList.contains('dark'))
        return () => observer.disconnect()
    }, [])

    return dark
}
