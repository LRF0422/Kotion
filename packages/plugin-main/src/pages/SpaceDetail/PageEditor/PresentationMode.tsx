import { Button, cn } from "@kn/ui";
import { Editor, EditorRender } from "@kn/editor";
import { useTranslation } from "@kn/common";
import { ChevronLeft, ChevronRight, Presentation, X } from "@kn/icon";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * 页面放映模式（Presentation Mode）。
 *
 * 把当前页面像 PPT 一样全屏逐页放映：按 H1/H2 标题和分割线把文档切分为
 * 幻灯片，隐藏一切编辑 UI，用只读编辑器渲染每一页（自定义块 —— 图表、
 * mermaid、bitable 等照常渲染）。
 *
 * 交互：← → / 空格 / PageUp / PageDown 翻页，Home/End 跳首尾，Esc 退出；
 * 控制条在鼠标静止约 3 秒后自动隐藏。挂载即打开（宿主用条件渲染控制）。
 */

interface SlideDef {
    kind: 'cover' | 'content'
    blocks: any[]
}

/** 递归拼接节点内所有文本（用于封面标题）。 */
const collectText = (node: any): string => {
    if (!node) return ''
    if (node.type === 'text') return node.text || ''
    return (node.content || []).map(collectText).join('')
}

/** 段落/块是否有实际内容（跳过纯空段落组成的幻灯片）。 */
const isEmptyBlock = (node: any): boolean =>
    node.type === 'paragraph' && !(node.content && node.content.length > 0)

const isSlideEmpty = (blocks: any[]): boolean => blocks.every(isEmptyBlock)

/**
 * 把文档 JSON 切分为幻灯片：
 * - title 节点 → 封面页（标题 + emoji 图标）
 * - H1/H2 标题开启新的一页；分割线（horizontalRule）强制分页且不渲染
 * - 首个标题之前的内容自成一页
 */
const splitSlides = (doc: any): { cover: { title: string; icon?: string } | null; slides: SlideDef[] } => {
    const nodes: any[] = doc?.content || []
    let cover: { title: string; icon?: string } | null = null
    let rest = nodes

    if (nodes[0]?.type === 'title') {
        const titleNode = nodes[0]
        const iconAttr = titleNode.attrs?.icon
        cover = {
            title: collectText(titleNode) || 'Untitled',
            // IMAGE 图标存的是文件名，无法直接当 emoji 渲染
            icon: iconAttr?.type === 'IMAGE' ? undefined : iconAttr?.icon ?? undefined,
        }
        rest = nodes.slice(1)
    }

    const slides: SlideDef[] = []
    let current: any[] = []
    const flush = () => {
        if (current.length > 0 && !isSlideEmpty(current)) {
            slides.push({ kind: 'content', blocks: current })
        }
        current = []
    }

    for (const node of rest) {
        const isBreakHeading = node.type === 'heading' && (node.attrs?.level ?? 1) <= 2
        if (isBreakHeading) {
            flush()
            current.push(node)
        } else if (node.type === 'horizontalRule') {
            flush()
        } else {
            current.push(node)
        }
    }
    flush()

    return { cover, slides }
}

export interface PresentationModeProps {
    editor: Editor | null
    onClose: () => void
}

export const PresentationMode: React.FC<PresentationModeProps> = ({ editor, onClose }) => {
    const { t } = useTranslation()
    const [index, setIndex] = useState(0)
    const [controlsVisible, setControlsVisible] = useState(true)
    const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // 打开时对文档做一次快照切分；放映期间不跟随协作编辑实时变化。
    const { cover, slides } = useMemo(() => {
        const json = editor?.getJSON()
        return splitSlides(json)
    }, [editor])

    // 封面 + 内容页组成完整放映序列
    const total = (cover ? 1 : 0) + slides.length
    const contentIndex = cover ? index - 1 : index
    const onCover = !!cover && index === 0
    const currentSlide = !onCover && contentIndex >= 0 ? slides[contentIndex] : null

    const goTo = useCallback((next: number) => {
        setIndex(Math.max(0, Math.min(total - 1, next)))
    }, [total])

    // 进入时请求浏览器全屏（失败则仅覆盖层放映）；退出时还原。
    useEffect(() => {
        const el = document.documentElement
        let entered = false
        el.requestFullscreen?.().then(() => { entered = true }).catch(() => { /* 覆盖层放映 */ })
        return () => {
            if (entered && document.fullscreenElement) {
                document.exitFullscreen?.().catch(() => { })
            }
        }
    }, [])

    // 用户通过浏览器手势退出全屏（如 Esc 被全屏层拦截）时同步关闭放映
    useEffect(() => {
        let wasFullscreen = false
        const onChange = () => {
            if (document.fullscreenElement) {
                wasFullscreen = true
            } else if (wasFullscreen) {
                onClose()
            }
        }
        document.addEventListener('fullscreenchange', onChange)
        return () => document.removeEventListener('fullscreenchange', onChange)
    }, [onClose])

    // 键盘导航
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            switch (e.key) {
                case 'Escape':
                    e.preventDefault()
                    onClose()
                    break
                case 'ArrowRight':
                case 'ArrowDown':
                case 'PageDown':
                case ' ':
                    e.preventDefault()
                    goTo(index + 1)
                    break
                case 'ArrowLeft':
                case 'ArrowUp':
                case 'PageUp':
                    e.preventDefault()
                    goTo(index - 1)
                    break
                case 'Home':
                    e.preventDefault()
                    goTo(0)
                    break
                case 'End':
                    e.preventDefault()
                    goTo(total - 1)
                    break
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [index, total, goTo, onClose])

    // 鼠标静止约 3 秒后隐藏控制条，移动即恢复
    const wakeControls = useCallback(() => {
        setControlsVisible(true)
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
        hideTimerRef.current = setTimeout(() => setControlsVisible(false), 3000)
    }, [])

    useEffect(() => {
        wakeControls()
        return () => {
            if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
        }
    }, [wakeControls])

    // 当前内容页的独立文档（只读渲染）
    const slideContent = useMemo(() => {
        if (!currentSlide) return undefined
        return { type: 'doc', content: currentSlide.blocks }
    }, [currentSlide])

    return createPortal(
        <div
            className="fixed inset-0 z-[9998] flex flex-col bg-background"
            onMouseMove={wakeControls}
        >
            {/* 放映专用排版：放大只读内容的字号/行距，接近幻灯片观感 */}
            <style>{`
                @keyframes kn-slide-in {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .kn-presentation-slide { animation: kn-slide-in 0.25s ease both; }
                .kn-presentation .ProseMirror { font-size: 1.35rem; line-height: 1.7; }
                .kn-presentation .ProseMirror h1 { font-size: 2.6rem; }
                .kn-presentation .ProseMirror h2 { font-size: 2.1rem; }
                .kn-presentation .ProseMirror h3 { font-size: 1.7rem; }
            `}</style>

            {/* 顶部控制条 —— 自动隐藏 */}
            <div
                className={cn(
                    "absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 py-2",
                    "bg-gradient-to-b from-background/95 to-transparent transition-opacity duration-300",
                    controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"
                )}
            >
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Presentation className="h-4 w-4" />
                    <span className="max-w-[40vw] truncate">{cover?.title || t('editor.presentation', '演示模式')}</span>
                </div>
                <div className="flex items-center gap-3">
                    <span className="hidden sm:inline text-xs text-muted-foreground">
                        {t('editor.presentationHint', '← → 翻页 · Esc 退出')}
                    </span>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 px-2 text-muted-foreground hover:text-foreground"
                        onClick={onClose}
                    >
                        <X className="h-3.5 w-3.5" />
                        <span className="text-xs">{t('editor.presentationExit', '退出放映')}</span>
                    </Button>
                </div>
            </div>

            {/* 幻灯片内容 */}
            <div className="flex-1 min-h-0 overflow-y-auto">
                {onCover ? (
                    <div key="cover" className="kn-presentation-slide flex h-full flex-col items-center justify-center gap-6 px-8 text-center">
                        {cover?.icon && <span className="text-7xl leading-none">{cover.icon}</span>}
                        <h1 className="max-w-[80vw] text-4xl font-bold tracking-tight sm:text-6xl">
                            {cover?.title}
                        </h1>
                    </div>
                ) : (
                    slideContent && (
                        <div key={index} className="kn-presentation kn-presentation-slide mx-auto flex min-h-full w-full max-w-5xl flex-col justify-center px-8 py-16">
                            <EditorRender
                                id="presentation-slide"
                                content={slideContent as any}
                                isEditable={false}
                                withTitle={false}
                                toc={false}
                                width="w-full"
                                pageInfo={{}}
                            />
                        </div>
                    )
                )}
            </div>

            {/* 左右翻页按钮 + 页码 —— 自动隐藏 */}
            <div
                className={cn(
                    "absolute inset-x-0 bottom-0 z-10 flex items-center justify-center gap-3 px-4 py-3",
                    "bg-gradient-to-t from-background/95 to-transparent transition-opacity duration-300",
                    controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"
                )}
            >
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={index <= 0}
                    onClick={() => goTo(index - 1)}
                    aria-label={t('editor.presentationPrev', '上一页')}
                >
                    <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="min-w-[3.5rem] text-center text-xs tabular-nums text-muted-foreground">
                    {index + 1} / {Math.max(total, 1)}
                </span>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={index >= total - 1}
                    onClick={() => goTo(index + 1)}
                    aria-label={t('editor.presentationNext', '下一页')}
                >
                    <ChevronRight className="h-4 w-4" />
                </Button>
            </div>

            {/* 底部进度条 */}
            <div className="absolute inset-x-0 bottom-0 h-0.5 bg-muted/40">
                <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${total > 0 ? ((index + 1) / total) * 100 : 0}%` }}
                />
            </div>
        </div>,
        document.body
    )
}
