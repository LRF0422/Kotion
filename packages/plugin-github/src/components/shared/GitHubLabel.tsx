import React from 'react'

interface GitHubLabelProps {
    name: string
    color: string
}

function getContrastColor(hexColor: string): string {
    const r = parseInt(hexColor.slice(0, 2), 16)
    const g = parseInt(hexColor.slice(2, 4), 16)
    const b = parseInt(hexColor.slice(4, 6), 16)
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return luminance > 0.5 ? '#000000' : '#ffffff'
}

export const GitHubLabel: React.FC<GitHubLabelProps> = ({ name, color }) => {
    const bgColor = `#${color}`
    const textColor = getContrastColor(color)

    return (
        <span
            className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[11px] font-medium leading-tight"
            style={{ backgroundColor: bgColor, color: textColor }}
        >
            {name}
        </span>
    )
}
