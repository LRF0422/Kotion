import { PMNode as Node, mergeAttributes, ReactNodeViewRenderer } from '@kn/editor';
import { NeteaseMusicNodeView } from './NeteaseMusicNodeView';
import { ExtensionWrapper } from '@kn/common';
import { Music } from '@kn/icon';
import React from 'react';
import { neteaseMusicTools } from './tools';

declare module '@kn/editor' {
    interface Commands<ReturnType> {
        neteaseMusic: {
            setNeteaseMusic: (options: {
                musicId: string;
                musicType?: 'song' | 'playlist' | 'album';
                title?: string;
                artist?: string;
                coverUrl?: string;
            }) => ReturnType;
        };
    }
}

export const NeteaseMusicExtension = Node.create({
    name: 'neteaseMusic',

    group: 'block',

    atom: true,

    addAttributes() {
        return {
            musicId: {
                default: null,
                parseHTML: (element) => element.getAttribute('data-music-id'),
                renderHTML: (attributes) => ({
                    'data-music-id': attributes.musicId,
                }),
            },
            musicType: {
                default: 'song',
                parseHTML: (element) => element.getAttribute('data-music-type'),
                renderHTML: (attributes) => ({
                    'data-music-type': attributes.musicType,
                }),
            },
            title: {
                default: '',
                parseHTML: (element) => element.getAttribute('data-title'),
                renderHTML: (attributes) => ({
                    'data-title': attributes.title,
                }),
            },
            artist: {
                default: '',
                parseHTML: (element) => element.getAttribute('data-artist'),
                renderHTML: (attributes) => ({
                    'data-artist': attributes.artist,
                }),
            },
            coverUrl: {
                default: '',
                parseHTML: (element) => element.getAttribute('data-cover-url'),
                renderHTML: (attributes) => ({
                    'data-cover-url': attributes.coverUrl,
                }),
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: 'div[data-netease-music]',
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ['div', mergeAttributes({ 'data-netease-music': '' }, this.options.HTMLAttributes, HTMLAttributes), 0];
    },

    addCommands() {
        return {
            setNeteaseMusic: (options) => ({ commands }) => {
                return commands.insertContent({
                    type: this.name,
                    attrs: {
                        musicId: options.musicId,
                        musicType: options.musicType || 'song',
                        title: options.title || '',
                        artist: options.artist || '',
                        coverUrl: options.coverUrl || '',
                    },
                });
            },
        };
    },

    addNodeView() {
        return ReactNodeViewRenderer(NeteaseMusicNodeView);
    },
});

export const NeteaseMusicExt: ExtensionWrapper = {
    name: 'neteaseMusic',
    extendsion: NeteaseMusicExtension,
    slashConfig: [
        {
            text: 'Music',
            icon: <Music className='h-4 w-4' />,
            slash: '/music',
            action: (editor) => {
                editor.commands.setNeteaseMusic({ musicId: '' });
            }
        }
    ],
    tools: neteaseMusicTools,
};
