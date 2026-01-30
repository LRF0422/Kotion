// Extend Window interface to include custom __KN__ property
declare global {
    interface Window {
        ui: any,
        common: any,
        core: any,
        icon: any,
        editor: any
    }
}

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
                // Access plugin from scoped namespace
                const Com = (window as any)[packageName]
                if (!Com) {
                    reject(new Error(`Plugin ${packageName} not found in window scope`))
                    return
                }
                cache[url] = Com
                resolve(Com)
            })
            script.addEventListener('error', (error) => {
                reject(error)
            })
        })
    }
})()