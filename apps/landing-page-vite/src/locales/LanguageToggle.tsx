import { supportedLngs, useNavigate, useTranslation } from "@kn/common"
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@kn/ui"
import React from "react"

// Language to flag emoji mapping
const languageFlags: Record<string, { flag: string; name: string }> = {
    'en': { flag: '🇺🇸', name: 'English' },
    'zh': { flag: '🇨🇳', name: '中文' },
}

export const LanguageToggle: React.FC = () => {

    const { i18n } = useTranslation()
    const navigate = useNavigate()
    const currentLang = i18n.language?.startsWith('zh') ? 'zh' : 'en'

    const switchLanguage = (lang: string) => {
        i18n.changeLanguage(lang)
        localStorage.setItem('language', lang)
        // 同步 URL 前缀：/xx/... -> /lang/...
        const stripped = window.location.pathname.replace(/^\/(zh|en)(?=\/|$)/, '') || '/'
        const next = `/${lang}${stripped === '/' ? '' : stripped}`
        navigate(next + window.location.search + window.location.hash)
    }
    const currentFlag = languageFlags[currentLang]?.flag || '🌐'

    return <DropdownMenu>
        <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="rounded-full text-base">
                {currentFlag}
                <span className="sr-only">Toggle language</span>
            </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
            {
                supportedLngs.map(lang => {
                    const langInfo = languageFlags[lang] || { flag: '🌐', name: lang }
                    const isActive = currentLang === lang
                    return <DropdownMenuItem
                        key={lang}
                        onClick={() => switchLanguage(lang)}
                        className={isActive ? 'bg-accent' : ''}
                    >
                        <span className="mr-2 text-base">{langInfo.flag}</span>
                        {langInfo.name}
                    </DropdownMenuItem>
                })
            }
        </DropdownMenuContent>
    </DropdownMenu>
}