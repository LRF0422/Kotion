import { ReactNode } from "react"

export interface MenuConfig {

    name: string
    icon: ReactNode
    onClick: () => void
    children?: MenuConfig[]

}