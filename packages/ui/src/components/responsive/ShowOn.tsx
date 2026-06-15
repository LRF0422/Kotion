import * as React from "react"
import { useResponsive } from "../../hooks/use-responsive"
import { DeviceType } from "../../hooks/breakpoints"

function normalize(device: DeviceType | DeviceType[]): DeviceType[] {
    return Array.isArray(device) ? device : [device]
}

/** Render children only on the given device tier(s). */
export const ShowOn: React.FC<{
    device: DeviceType | DeviceType[]
    children: React.ReactNode
}> = ({ device, children }) => {
    const { device: current } = useResponsive()
    return normalize(device).includes(current) ? <>{children}</> : null
}

/** Render children on every tier EXCEPT the given one(s). */
export const HideOn: React.FC<{
    device: DeviceType | DeviceType[]
    children: React.ReactNode
}> = ({ device, children }) => {
    const { device: current } = useResponsive()
    return normalize(device).includes(current) ? null : <>{children}</>
}
