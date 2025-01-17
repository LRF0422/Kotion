import { ReactNode } from "react"

export interface RouteConfig {
    path: string
    name: string
    element?: ReactNode
    children?: RouteConfig[]
}