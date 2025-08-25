import { supportedLngs, useTranslation } from "@kn/common"
import { LanguagesIcon } from "@kn/icon"
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@kn/ui"
import React from "react"

export const LanguageToggle: React.FC = () => {

    const { i18n } = useTranslation()

    return <DropdownMenu>
        <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className=" rounded-full">
                <LanguagesIcon className="h-[1.2rem] w-[1.2rem]" />
                <span className="sr-only">Toggle language</span>
            </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
            {
                supportedLngs.map(lang => {
                    return <DropdownMenuItem key={lang} onClick={() => {
                        i18n.changeLanguage(lang)
                        localStorage.setItem('language', lang)
                    }}>
                        {lang}
                    </DropdownMenuItem>
                })
            }
        </DropdownMenuContent>
    </DropdownMenu>
}