import React, { useCallback, useEffect, useRef } from "react"
import {
    Badge, Button, Input, cn, toast
} from "@kn/ui"
import { Plus, X, Tag } from "@kn/icon"
import { useSpacePageService, useTranslation, useSafeState } from "@kn/common"

interface PageTagsEditorProps {
    pageId: string
    spaceId: string
    initialTags?: string[]
    onTagsChange?: (tags: string[]) => void
    className?: string
}

export const PageTagsEditor: React.FC<PageTagsEditorProps> = ({
    pageId,
    spaceId,
    initialTags = [],
    onTagsChange,
    className
}) => {
    const { t } = useTranslation()
    const spacePageService = useSpacePageService()
    const [tags, setTags] = useSafeState<string[]>(initialTags)
    const [newTag, setNewTag] = useSafeState('')
    const [spaceTags, setSpaceTags] = useSafeState<string[]>([])
    const [showSuggestions, setShowSuggestions] = useSafeState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    // Fetch space tags for suggestions
    useEffect(() => {
        spacePageService.tags.getSpaceTags(spaceId)
            .then(result => setSpaceTags(result.map(tag => typeof tag === 'string' ? tag : tag.name)))
            .catch(() => { })
    }, [spaceId, spacePageService])

    // Sync initial tags
    useEffect(() => {
        setTags(initialTags)
    }, [initialTags])

    const saveTags = useCallback(async (updatedTags: string[]) => {
        try {
            await spacePageService.tags.updatePageTags({ pageId, tags: updatedTags })
            setTags(updatedTags)
            onTagsChange?.(updatedTags)
        } catch {
            toast.error(t('tags.saveError', 'Failed to save tags'))
        }
    }, [pageId, onTagsChange, spacePageService, t])

    const handleAddTag = useCallback(() => {
        const tag = newTag.trim()
        if (!tag || tags.includes(tag)) {
            setNewTag('')
            return
        }
        const updated = [...tags, tag]
        saveTags(updated)
        setNewTag('')
        setShowSuggestions(false)
    }, [newTag, tags, saveTags])

    const handleRemoveTag = useCallback((tagToRemove: string) => {
        const updated = tags.filter(t => t !== tagToRemove)
        saveTags(updated)
    }, [tags, saveTags])

    const handleSelectSuggestion = useCallback((tag: string) => {
        if (!tags.includes(tag)) {
            const updated = [...tags, tag]
            saveTags(updated)
        }
        setNewTag('')
        setShowSuggestions(false)
    }, [tags, saveTags])

    const filteredSuggestions = spaceTags.filter(
        st => !tags.includes(st) && st.toLowerCase().includes(newTag.toLowerCase())
    )

    return (
        <div className={cn("space-y-2", className)}>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Tag className="h-3 w-3" />
                <span>{t('tags.label', 'Tags')}</span>
            </div>

            {/* Current tags */}
            {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {tags.map(tag => (
                        <Badge
                            key={tag}
                            variant="secondary"
                            className="text-xs h-5 px-2 gap-1 cursor-default"
                        >
                            {tag}
                            <button
                                className="hover:text-destructive transition-colors"
                                onClick={() => handleRemoveTag(tag)}
                            >
                                <X className="h-2.5 w-2.5" />
                            </button>
                        </Badge>
                    ))}
                </div>
            )}

            {/* Add tag input */}
            <div className="relative">
                <div className="flex items-center gap-1.5">
                    <Input
                        ref={inputRef}
                        value={newTag}
                        onChange={(e) => {
                            setNewTag(e.target.value)
                            setShowSuggestions(e.target.value.length > 0)
                        }}
                        onFocus={() => newTag.length > 0 && setShowSuggestions(true)}
                        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault()
                                handleAddTag()
                            }
                            if (e.key === 'Escape') {
                                setShowSuggestions(false)
                            }
                        }}
                        placeholder={t('tags.addPlaceholder', 'Add a tag...')}
                        className="h-7 text-xs"
                    />
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 shrink-0"
                        disabled={!newTag.trim()}
                        onClick={handleAddTag}
                    >
                        <Plus className="h-3.5 w-3.5" />
                    </Button>
                </div>

                {/* Suggestions dropdown */}
                {showSuggestions && filteredSuggestions.length > 0 && (
                    <div className="absolute z-10 top-full left-0 right-0 mt-1 border rounded-md bg-popover shadow-md max-h-24 overflow-auto">
                        {filteredSuggestions.slice(0, 8).map(suggestion => (
                            <button
                                key={suggestion}
                                className="block w-full text-left px-2.5 py-1.5 text-xs hover:bg-muted transition-colors"
                                onMouseDown={(e) => {
                                    e.preventDefault()
                                    handleSelectSuggestion(suggestion)
                                }}
                            >
                                {suggestion}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
