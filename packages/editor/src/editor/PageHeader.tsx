import { EmojiPicker, EmojiPickerContent, EmojiPickerSearch, Separator, cn, Button } from "@kn/ui";
import { Popover, PopoverContent, PopoverTrigger } from "@kn/ui";
import { Clock, Plus, X, Image, ImagePlus, Trash2, Move, GripVertical } from "@kn/icon";
import React, { useContext, useState, useCallback, useRef, useEffect } from "react";
import type { Editor } from "@tiptap/core";
import { PageContext } from "@editor/editor/context";
import { FileService, useOptionalService } from "@kn/common";

/**
 * 页面头部（封面 / 图标 / 添加按钮 / 只读元数据）。
 *
 * 这些 UI 原先在 title 节点的 React NodeView（TitleView）里渲染，与可编辑的
 * NodeViewContent 共处一棵 React 子树，导致在 Safari 中文输入法下，合成期间的
 * 重渲染会打断输入法、使文字逃逸到正文。现在把它们移到编辑器【外部】，标题文字
 * 退回为原生 ProseMirror 文本块，从根上消除该问题。
 *
 * 封面/图标仍存储在 title 节点的 attrs 上：本组件通过 editor 事务读写它们，因此
 * 既有的“DirtyTracker → PATCH → 后端 syncPageTitleFromPatch（标题/图标入库）”
 * 同步链保持不变，协作（Yjs）也照常同步。
 */

interface CoverConfig {
	url: string;
	position: number; // 0-100 垂直位置百分比，默认 50
}

interface PageHeaderProps {
	editor: Editor;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ editor }) => {
	const { createTime, updateTime } = useContext(PageContext)

	const [isHovered, setIsHovered] = useState(false)
	const [isCoverHovered, setIsCoverHovered] = useState(false)
	const [isTitleAreaHovered, setIsTitleAreaHovered] = useState(false)
	const [isDragging, setIsDragging] = useState(false)
	const [isUploading, setIsUploading] = useState(false)
	const coverRef = useRef<HTMLDivElement>(null)
	const dragStartY = useRef<number>(0)
	const dragStartPosition = useRef<number>(50)

	const fileService = useOptionalService("fileService") as FileService | undefined
	const isEditable = editor.isEditable

	// 订阅 title 节点的 attrs：每次事务（含本地编辑 / 远端协作）后重读。
	const readTitleAttrs = useCallback(() => {
		const node = editor.state.doc.firstChild
		return node && node.type.name === 'title' ? node.attrs : {}
	}, [editor])

	const [attrs, setAttrs] = useState<Record<string, any>>(() => readTitleAttrs())

	useEffect(() => {
		const update = () => setAttrs(readTitleAttrs())
		update()
		editor.on('transaction', update)
		return () => { editor.off('transaction', update) }
	}, [editor, readTitleAttrs])

	// 写回 title 节点 attrs（pos 0 恒为 title 节点）。会让 title 块标脏，触发既有同步链。
	const setTitleAttrs = useCallback((patch: Record<string, any>) => {
		const node = editor.state.doc.firstChild
		if (!node || node.type.name !== 'title') return
		editor.chain().command(({ tr }) => {
			tr.setNodeMarkup(0, undefined, { ...node.attrs, ...patch })
			return true
		}).run()
	}, [editor])

	const hasIcon = !!attrs?.icon?.icon
	const cover = (attrs?.cover ?? null) as CoverConfig | null
	const hasCover = !!cover?.url

	const getCoverUrl = useCallback((url: string) => {
		if (!url) return ""
		if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) {
			return url
		}
		if (fileService) {
			return fileService.getDownloadUrl(url)
		}
		return `https://kotion.top:888/api/knowledge-resource/oss/endpoint/download?fileName=${url}`
	}, [fileService])

	const handleUploadCover = useCallback(async () => {
		if (!fileService) {
			console.warn("FileService not available")
			return
		}
		try {
			setIsUploading(true)
			const result = await fileService.upload({ mimeTypes: ["image/*"] })
			setTitleAttrs({ cover: { url: result.name, position: 50 } })
		} catch (error) {
			console.error("Failed to upload cover:", error)
		} finally {
			setIsUploading(false)
		}
	}, [fileService, setTitleAttrs])

	const handleRemoveCover = useCallback(() => {
		setTitleAttrs({ cover: null })
	}, [setTitleAttrs])

	const handleDragStart = useCallback((e: React.MouseEvent) => {
		if (!isEditable) return
		e.preventDefault()
		setIsDragging(true)
		dragStartY.current = e.clientY
		dragStartPosition.current = cover?.position ?? 50
	}, [isEditable, cover?.position])

	const handleDragMove = useCallback((e: MouseEvent) => {
		if (!isDragging || !coverRef.current) return
		const coverHeight = coverRef.current.offsetHeight
		const deltaY = e.clientY - dragStartY.current
		const deltaPercent = (deltaY / coverHeight) * 100
		const newPosition = Math.max(0, Math.min(100, dragStartPosition.current + deltaPercent))
		setTitleAttrs({ cover: { ...(cover ?? { url: '' }), position: newPosition } })
	}, [isDragging, cover, setTitleAttrs])

	const handleDragEnd = useCallback(() => {
		setIsDragging(false)
	}, [])

	useEffect(() => {
		if (isDragging) {
			window.addEventListener('mousemove', handleDragMove)
			window.addEventListener('mouseup', handleDragEnd)
			return () => {
				window.removeEventListener('mousemove', handleDragMove)
				window.removeEventListener('mouseup', handleDragEnd)
			}
		}
	}, [isDragging, handleDragMove, handleDragEnd])

	const setIcon = useCallback((emoji: string) => {
		setTitleAttrs({ icon: { type: 'EMOJI', icon: emoji } })
	}, [setTitleAttrs])

	const removeIcon = useCallback(() => {
		setTitleAttrs({ icon: null })
	}, [setTitleAttrs])

	// 既没有封面/图标可显示，又不可编辑（无添加入口）时，整个头部无内容可渲染。
	if (!hasCover && !hasIcon && !isEditable && !createTime && !updateTime) {
		return null
	}

	return (
		<div className="page-header flex flex-col w-full">
			{/* Cover Image Section - spans the full width of the editor pane (Notion-style),
			    flush with the top. Rendered outside StyledEditor's centred 900px column so
			    `w-full` resolves to the whole scroll container, not the text column. */}
			{hasCover && (
				<div
					ref={coverRef}
					className={cn(
						"relative w-full h-[30vh] min-h-[200px] max-h-[400px] overflow-hidden",
						"bg-muted/30",
						isDragging && "cursor-grabbing select-none"
					)}
					onMouseEnter={() => setIsCoverHovered(true)}
					onMouseLeave={() => setIsCoverHovered(false)}
				>
					<img
						src={getCoverUrl(cover!.url)}
						alt="Cover"
						className="w-full h-full object-cover"
						style={{ objectPosition: `center ${cover!.position ?? 50}%` }}
						draggable={false}
					/>

					{isEditable && isCoverHovered && !isDragging && (
						<div className="absolute inset-0 flex items-end justify-center pointer-events-none">
							<div className="w-full max-w-4xl px-4 pb-3 flex justify-end pointer-events-auto">
								<div className="flex items-center gap-2">
									<Button
										variant="secondary"
										size="sm"
										className="h-8 gap-1.5 bg-background/80 backdrop-blur-sm hover:bg-background/90 shadow-lg border"
										onMouseDown={handleDragStart}
									>
										<GripVertical className="h-4 w-4" />
										<span className="text-xs">Reposition</span>
									</Button>

									<Button
										variant="secondary"
										size="sm"
										className="h-8 gap-1.5 bg-background/80 backdrop-blur-sm hover:bg-background/90 shadow-lg border"
										onClick={handleUploadCover}
										disabled={isUploading}
									>
										<Image className="h-4 w-4" />
										<span className="text-xs">{isUploading ? "Uploading..." : "Change cover"}</span>
									</Button>

									<Button
										variant="secondary"
										size="sm"
										className="h-8 gap-1.5 bg-background/80 backdrop-blur-sm hover:bg-destructive hover:text-destructive-foreground shadow-lg border"
										onClick={handleRemoveCover}
									>
										<Trash2 className="h-4 w-4" />
										<span className="text-xs">Remove</span>
									</Button>
								</div>
							</div>
						</div>
					)}

					{isDragging && (
						<div className="absolute inset-0 bg-black/20 flex items-center justify-center">
							<div className="bg-background/90 px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
								<Move className="h-4 w-4" />
								<span className="text-sm font-medium">Drag to reposition</span>
							</div>
						</div>
					)}
				</div>
			)}

			{/* Icon / Add buttons / metadata area — kept aligned with the centred
			    text column below (mirrors StyledEditor: max-w 900px, 40px / 16px padding). */}
			<div
				className={cn(
					"flex flex-col gap-4 w-full mx-auto max-w-[900px] px-4 md:px-10",
					hasCover ? "pt-6 pb-1" : "pt-12 pb-1"
				)}
				onMouseEnter={() => setIsTitleAreaHovered(true)}
				onMouseLeave={() => setIsTitleAreaHovered(false)}
			>
				{/* Add icon / Add cover buttons */}
				{isEditable && (!hasIcon || !hasCover) && (
					<div
						className={cn(
							"flex items-center gap-2",
							"opacity-0 transition-opacity duration-200",
							isTitleAreaHovered && "opacity-100"
						)}
					>
						{!hasIcon && (
							<Popover>
								<PopoverTrigger asChild>
									<Button
										variant="ghost"
										size="sm"
										className="h-7 gap-1.5 text-muted-foreground hover:text-foreground"
									>
										<Plus className="h-4 w-4" />
										<span className="text-sm">Add icon</span>
									</Button>
								</PopoverTrigger>
								<PopoverContent side="bottom" align="start" className="p-0 border-none shadow-2xl">
									<EmojiPicker
										className="h-[380px] rounded-xl border shadow-xl w-full"
										onEmojiSelect={({ emoji }) => setIcon(emoji)}>
										<EmojiPickerSearch />
										<EmojiPickerContent />
									</EmojiPicker>
								</PopoverContent>
							</Popover>
						)}
						{!hasCover && (
							<Button
								variant="ghost"
								size="sm"
								className="h-7 gap-1.5 text-muted-foreground hover:text-foreground"
								onClick={handleUploadCover}
								disabled={isUploading || !fileService}
							>
								<ImagePlus className="h-4 w-4" />
								<span className="text-sm">{isUploading ? "Uploading..." : "Add cover"}</span>
							</Button>
						)}
					</div>
				)}

				{/* Icon / Emoji */}
				{hasIcon && (
					<div
						className="relative group"
						onMouseEnter={() => setIsHovered(true)}
						onMouseLeave={() => setIsHovered(false)}
					>
						<Popover>
							<PopoverTrigger disabled={!isEditable}>
								<div
									className={cn(
										"relative flex items-center justify-center cursor-pointer",
										"h-20 w-20 rounded-xl transition-all duration-300",
										"hover:bg-muted/50",
										isEditable && "hover:scale-[1.02] active:scale-[0.98]"
									)}
								>
									<div className="text-[56px] transition-transform duration-300 group-hover:scale-105">
										{attrs?.icon?.icon}
									</div>
									{isEditable && (
										<button
											type="button"
											className={cn(
												"absolute -top-1 -right-1 p-1 rounded-full",
												"bg-muted hover:bg-destructive/90 hover:text-destructive-foreground",
												"opacity-0 group-hover:opacity-100 transition-all duration-200",
												"shadow-sm hover:shadow-md"
											)}
											onClick={(e) => {
												e.stopPropagation()
												e.preventDefault()
												removeIcon()
											}}
										>
											<X className="h-3 w-3" />
										</button>
									)}
								</div>
							</PopoverTrigger>
							<PopoverContent side="right" align="start" className="p-0 border-none shadow-2xl">
								<EmojiPicker
									className="h-[380px] rounded-xl border shadow-xl w-full"
									onEmojiSelect={({ emoji }) => setIcon(emoji)}>
									<EmojiPickerSearch />
									<EmojiPickerContent />
								</EmojiPicker>
							</PopoverContent>
						</Popover>
					</div>
				)}

				{/* Metadata (read-only) */}
				{!isEditable && (createTime || updateTime) && (
					<div className="flex flex-wrap items-center gap-2 w-full">
						<div className="group flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50 hover:bg-muted transition-all duration-200 border border-transparent hover:border-border/50">
							<Clock className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
							<div className="flex items-center gap-1.5">
								<span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">Created</span>
								<span className="text-xs text-muted-foreground/80">{createTime}</span>
							</div>
						</div>

						<Separator orientation="vertical" className="h-5" />

						<div className="group flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50 hover:bg-muted transition-all duration-200 border border-transparent hover:border-border/50">
							<Clock className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
							<div className="flex items-center gap-1.5">
								<span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">Updated</span>
								<span className="text-xs text-muted-foreground/80">{updateTime}</span>
							</div>
						</div>
					</div>
				)}
			</div>
		</div>
	)
}
