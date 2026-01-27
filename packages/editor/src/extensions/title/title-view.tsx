import { EmojiPicker, EmojiPickerContent, EmojiPickerSearch, Separator, cn, Button } from "@kn/ui";
import { Popover, PopoverContent, PopoverTrigger } from "@kn/ui";
import { NodeViewProps } from "@tiptap/core";
import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import { Clock, Plus, X, Image, ImagePlus, Trash2, Move, GripVertical } from "@kn/icon";
import React, { useContext, useState, useMemo, useCallback, useRef } from "react";
import { PageContext } from "@editor/editor/context";
import { AppContext, FileService } from "@kn/common";

// Cover image configuration interface
interface CoverConfig {
	url: string;
	position: number; // Vertical position percentage (0-100), default 50
}

export const TitleView: React.FC<NodeViewProps> = (props) => {

	const { createTime, updateTime } = useContext(PageContext)
	const { pluginManager } = useContext(AppContext)
	const [isHovered, setIsHovered] = useState(false)
	const [isCoverHovered, setIsCoverHovered] = useState(false)
	const [isTitleAreaHovered, setIsTitleAreaHovered] = useState(false)
	const [isDragging, setIsDragging] = useState(false)
	const [isUploading, setIsUploading] = useState(false)
	const coverRef = useRef<HTMLDivElement>(null)
	const dragStartY = useRef<number>(0)
	const dragStartPosition = useRef<number>(50)

	// Get file service from plugin manager
	const fileService = pluginManager?.pluginServices?.fileService as FileService | undefined

	// Check if icon is configured
	const hasIcon = !!props.node.attrs?.icon?.icon

	// Check if cover is configured
	const cover = props.node.attrs?.cover as CoverConfig | null
	const hasCover = !!cover?.url

	// Check if title is empty
	const isTitleEmpty = useMemo(() => {
		const titleNode = props.node.firstChild
		if (!titleNode) return true
		return titleNode.textContent?.trim() === ''
	}, [props.node])

	// Get cover image URL
	const getCoverUrl = useCallback((url: string) => {
		if (!url) return ""
		if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) {
			return url
		}
		if (fileService) {
			return fileService.getDownloadUrl(url)
		}
		// Fallback download URL
		return `https://kotion.top:888/api/knowledge-resource/oss/endpoint/download?fileName=${url}`
	}, [fileService])

	// Handle cover upload
	const handleUploadCover = useCallback(async () => {
		if (!fileService) {
			console.warn("FileService not available")
			return
		}
		try {
			setIsUploading(true)
			const result = await fileService.upload({ mimeTypes: ["image/*"] })
			props.updateAttributes({
				...props.node.attrs,
				cover: {
					url: result.name,
					position: 50
				}
			})
		} catch (error) {
			console.error("Failed to upload cover:", error)
		} finally {
			setIsUploading(false)
		}
	}, [fileService, props])

	// Handle remove cover
	const handleRemoveCover = useCallback(() => {
		props.updateAttributes({
			...props.node.attrs,
			cover: null
		})
	}, [props])

	// Handle cover position change via dragging
	const handleDragStart = useCallback((e: React.MouseEvent) => {
		if (!props.editor.isEditable) return
		e.preventDefault()
		setIsDragging(true)
		dragStartY.current = e.clientY
		dragStartPosition.current = cover?.position ?? 50
	}, [props.editor.isEditable, cover?.position])

	const handleDragMove = useCallback((e: MouseEvent) => {
		if (!isDragging || !coverRef.current) return
		const coverHeight = coverRef.current.offsetHeight
		const deltaY = e.clientY - dragStartY.current
		const deltaPercent = (deltaY / coverHeight) * 100
		const newPosition = Math.max(0, Math.min(100, dragStartPosition.current + deltaPercent))

		props.updateAttributes({
			...props.node.attrs,
			cover: {
				...cover,
				position: newPosition
			}
		})
	}, [isDragging, cover, props])

	const handleDragEnd = useCallback(() => {
		setIsDragging(false)
	}, [])

	// Add global mouse event listeners for dragging
	React.useEffect(() => {
		if (isDragging) {
			window.addEventListener('mousemove', handleDragMove)
			window.addEventListener('mouseup', handleDragEnd)
			return () => {
				window.removeEventListener('mousemove', handleDragMove)
				window.removeEventListener('mouseup', handleDragEnd)
			}
		}
	}, [isDragging, handleDragMove, handleDragEnd])

	return <NodeViewWrapper className="flex flex-col items-start w-full" style={{ overflow: 'clip' }}>
		{/* Cover Image Section - Full bleed design */}
		{hasCover && (
			<div
				ref={coverRef}
				className={cn(
					"relative h-[30vh] min-h-[200px] max-h-[400px] overflow-hidden",
					"bg-muted/30",
					isDragging && "cursor-grabbing select-none"
				)}
				style={{
					width: '100vw',
					position: 'relative',
					left: '50%',
					transform: 'translateX(-50%)',
				}}
				onMouseEnter={() => setIsCoverHovered(true)}
				onMouseLeave={() => setIsCoverHovered(false)}
				contentEditable={false}
			>
				{/* Cover Image */}
				<img
					src={getCoverUrl(cover!.url)}
					alt="Cover"
					className="w-full h-full object-cover"
					style={{ objectPosition: `center ${cover!.position ?? 50}%` }}
					draggable={false}
				/>

				{/* Cover Controls - Only show in edit mode and when hovered */}
				{props.editor.isEditable && isCoverHovered && !isDragging && (
					<div
						className="absolute inset-0 flex items-end justify-center pointer-events-none"
						contentEditable={false}
					>
						<div className="w-full max-w-4xl px-4 pb-3 flex justify-end pointer-events-auto">
							<div className="flex items-center gap-2">
								{/* Reposition hint */}
								<Button
									variant="secondary"
									size="sm"
									className="h-8 gap-1.5 bg-background/80 backdrop-blur-sm hover:bg-background/90 shadow-lg border"
									onMouseDown={handleDragStart}
								>
									<GripVertical className="h-4 w-4" />
									<span className="text-xs">Reposition</span>
								</Button>

								{/* Change cover button */}
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

								{/* Remove cover button */}
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

				{/* Drag indicator overlay */}
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

		{/* Content area with proper padding */}
		<div
			className={cn(
				"flex flex-col gap-4 w-full",
				hasCover ? "pt-6 pb-6" : "pt-12 pb-6"
			)}
			onMouseEnter={() => setIsTitleAreaHovered(true)}
			onMouseLeave={() => setIsTitleAreaHovered(false)}
		>
			{/* Add icon and cover buttons - Show when no icon/cover and in edit mode */}
			{props.editor.isEditable && (!hasIcon || !hasCover) && (
				<div
					className={cn(
						"flex items-center gap-2",
						"opacity-0 transition-opacity duration-200",
						isTitleAreaHovered && "opacity-100"
					)}
					contentEditable={false}
				>
					{/* Add icon button */}
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
									onEmojiSelect={({ emoji }) => {
										props.updateAttributes({
											...props.node.attrs,
											icon: {
												type: 'EMOJI',
												icon: emoji
											}
										})
									}}>
									<EmojiPickerSearch />
									<EmojiPickerContent />
								</EmojiPicker>
							</PopoverContent>
						</Popover>
					)}
					{/* Add cover button */}
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

			{/* Icon/Emoji Section - Only show when icon exists */}
			{hasIcon && (
				<div
					className="relative group"
					onMouseEnter={() => setIsHovered(true)}
					onMouseLeave={() => setIsHovered(false)}
				>
					<Popover>
						<PopoverTrigger disabled={!props.editor.isEditable}>
							<div
								contentEditable={false}
								className={cn(
									"relative flex items-center justify-center cursor-pointer",
									"h-20 w-20 rounded-xl transition-all duration-300",
									"hover:bg-muted/50",
									props.editor.isEditable && "hover:scale-[1.02] active:scale-[0.98]"
								)}
							>
								<div className="text-[56px] transition-transform duration-300 group-hover:scale-105" contentEditable={false}>
									{props.node.attrs?.icon?.icon}
								</div>
								{/* Remove icon button */}
								{props.editor.isEditable && (
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
											props.updateAttributes({
												...props.node.attrs,
												icon: null
											})
										}}
									>
										<X className="h-3 w-3" />
									</button>
								)}
							</div>
						</PopoverTrigger>
						<PopoverContent side="right" align="start" className="p-0 border-none shadow-2xl" >
							<EmojiPicker
								className="h-[380px] rounded-xl border shadow-xl w-full"
								onEmojiSelect={({ emoji }) => {
									props.updateAttributes({
										...props.node.attrs,
										icon: {
											type: 'EMOJI',
											icon: emoji
										}
									})
								}} >
								<EmojiPickerSearch />
								<EmojiPickerContent />
							</EmojiPicker>
						</PopoverContent>
					</Popover>
				</div>
			)}

			{/* Title Content */}
			<div className="w-full relative">
				<NodeViewContent className="w-full prose-h1:mb-2 prose-h1:mt-0 prose-h1:font-bold" />
				{/* Placeholder when title is empty */}
				{isTitleEmpty && props.editor.isEditable && (
					<div
						className="absolute top-0 left-0 pointer-events-none text-muted-foreground/50 text-4xl font-bold"
						contentEditable={false}
					>
						Untitled
					</div>
				)}
			</div>

			{/* Metadata Section */}
			{(!props.editor.isEditable) && (
				<div className="flex flex-wrap items-center gap-2 mt-2 w-full">
					{/* Create Time */}
					<div className="group flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50 hover:bg-muted transition-all duration-200 border border-transparent hover:border-border/50">
						<Clock className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
						<div className="flex items-center gap-1.5">
							<span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">Created</span>
							<span className="text-xs text-muted-foreground/80">{createTime}</span>
						</div>
					</div>

					<Separator orientation="vertical" className="h-5" />

					{/* Update Time */}
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
	</NodeViewWrapper>
}
