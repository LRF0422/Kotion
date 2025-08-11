export const importScript = (() => {
    const cache: any = {}

    return (url: any) => {
        if (cache[url]) { return Promise.resolve(cache[url]) }

        return new Promise((resolve, reject) => {
            const lastWindowKey = Object.keys(window).pop()

            const script = document.createElement('script')

            script.setAttribute('src', url)
            document.head.appendChild(script)

            script.addEventListener('load', () => {
                document.head.removeChild(script)
                const newLastWindowKey: any = Object.keys(window).pop()

                const res: any = lastWindowKey !== newLastWindowKey
                    ? window[newLastWindowKey]
                    : {}

                const Com = res.default ? res.default : res

                cache[url] = Com

                resolve(Com)
            })
            script.addEventListener('error', (error) => {
                reject(error)
            })
        })
    }
})()