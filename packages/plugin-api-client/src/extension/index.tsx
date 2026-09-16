import { ExtensionWrapper } from '@kn/common'
import React from 'react'
import { ApiRequestNode } from './api-request-node'

const SlashIcon = () => (
    <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="h-4 w-4"
        aria-hidden="true"
    >
        <path d="M5 7h14M5 12h9M5 17h6" strokeLinecap="round" />
        <circle cx="18" cy="17" r="3" />
    </svg>
)

export const ApiRequestExt: ExtensionWrapper = {
    name: 'apiRequest',
    extendsion: ApiRequestNode,
    slashConfig: [
        {
            text: '接口调试',
            icon: <SlashIcon />,
            slash: '/api',
            action: (editor) => {
                editor.commands.insertContent({
                    type: 'apiRequest',
                    attrs: {
                        method: 'GET',
                        url: 'https://api.github.com/zen',
                        headersText: 'Accept: application/json',
                    },
                })
            },
        },
    ],
}

export { ApiRequestNode }
