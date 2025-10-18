import { toast } from "@kn/ui"
import { duration } from "moment"

export const importScript = (() => {
    const cache: any = {}

    return (url: any, packageName: any, name: string) => {
        if (cache[url]) { return Promise.resolve(cache[url]) }

        return new Promise((resolve, reject) => {
            const script = document.createElement('script')

            script.setAttribute('src', url)
            document.head.appendChild(script)

            script.addEventListener('load', () => {
                document.head.removeChild(script)
                const Com = window[packageName]
                cache[url] = Com
                resolve(Com)
            })
            script.addEventListener('error', (error) => {
                toast.error("插件载入失败", {
                    description: `插件【${name}】加载失败，请将插件升级到最新版`,
                    duration: 10 * 1000
                })
                reject(error)
            })
        })
    }
})()