import { PMNode as Node, mergeAttributes, ReactNodeViewRenderer } from '@kn/editor';
import { BilibiliNodeView } from './BilibiliNodeView';
import { ExtensionWrapper } from '@kn/common';
import { RiBilibiliFill } from '@kn/icon';
import React from 'react';
import { bilibiliTools } from './tools';

declare module '@kn/editor' {
    interface Commands<ReturnType> {
        bilibili: {
            setBilibili: (options: { bvid: string; startTime?: number }) => ReturnType;
        };
    }
}

export const BilibiliExtension = Node.create({
    name: 'bilibili',

    group: 'block',

    atom: true,

    addAttributes() {
        return {
            bvid: {
                default: null,
                parseHTML: (element) => element.getAttribute('data-bvid'),
                renderHTML: (attributes) => ({
                    'data-bvid': attributes.bvid,
                }),
            },
            startTime: {
                default: null,
                parseHTML: (element) => element.getAttribute('data-start-time'),
                renderHTML: (attributes) => ({
                    'data-start-time': attributes.startTime,
                }),
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: 'div[data-bilibili]',
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ['div', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
    },

    addCommands() {
        return {
            setBilibili: (options) => ({ commands }) => {
                return commands.insertContent({
                    type: this.name,
                    attrs: options,
                });
            },
        };
    },

    addNodeView() {
        return ReactNodeViewRenderer(BilibiliNodeView);
    },
});


export const BilibiliExt: ExtensionWrapper = {
    name: 'bilibili',
    extendsion: BilibiliExtension,
    slashConfig: [
        {
            text: 'Bilibili',
            icon: <RiBilibiliFill className='h-4 w-4' />,
            slash: '/bilibili',
            action: (editor) => {
                editor.commands.setBilibili({ bvid: '' });
            }
        }
    ],
    tools: bilibiliTools
}