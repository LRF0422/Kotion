/** Application identity and standard user directories. */
export interface DesktopAppInfo {
    version: string
    name: string
    platform: string
    arch: string
    userDataPath: string
    locale: string
}

export interface DesktopPaths {
    userData: string
    downloads: string
    documents: string
    desktop: string
    temp: string
}
