import { EraserIcon } from "@kn/icon";
import { IconButton, cn } from "@kn/ui";
import { NodeViewContent, NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import React, { useRef, useCallback, useMemo, useState, useEffect } from "react";

interface ResizeState {
    isResizing: boolean;
    startX: number;
    startWidth: number;
    nextStartWidth: number;
}

export const ColumnView: React.FC<NodeViewProps> = React.memo((props) => {

    const { editor, getPos, node, updateAttributes } = props
    const ref = useRef<HTMLDivElement>(null)
    const resizeHandleRef = useRef<HTMLDivElement>(null)
    const [resizeState, setResizeState] = useState<ResizeState | null>(null)

    const currentWidth = node.attrs.width || 100 / node.attrs.cols;
    const isLastColumn = node.attrs.index === node.attrs.cols - 1;

    const handleDelete = useCallback(() => {
        const pos = getPos();
        if (pos !== undefined) {
            editor.commands.deleteRange({
                from: pos + 1,
                to: pos + node.nodeSize - 1
            })
        }
    }, [editor, getPos, node.nodeSize])

    const handleResizeStart = useCallback((e: React.MouseEvent) => {
        if (!editor.isEditable || isLastColumn) return;

        e.preventDefault();
        e.stopPropagation();

        // Find the parent column-view element (decorated by ProseMirror)
        const currentColumnView = ref.current?.closest('.column-view') as HTMLElement;
        const nextColumnView = currentColumnView?.nextElementSibling as HTMLElement;

        if (!currentColumnView || !nextColumnView) {
            console.log('Could not find column views');
            return;
        }

        setResizeState({
            isResizing: true,
            startX: e.clientX,
            startWidth: currentColumnView.offsetWidth,
            nextStartWidth: nextColumnView.offsetWidth
        });
    }, [editor.isEditable, isLastColumn]);

    useEffect(() => {
        if (!resizeState?.isResizing) return;

        // Add body class for global cursor change
        document.body.classList.add('is-resizing-column');

        // Get references to the column-view elements
        const currentColumnView = ref.current?.closest('.column-view') as HTMLElement;
        const nextColumnView = currentColumnView?.nextElementSibling as HTMLElement;

        if (!currentColumnView || !nextColumnView) {
            document.body.classList.remove('is-resizing-column');
            setResizeState(null);
            return;
        }

        const handleMouseMove = (e: MouseEvent) => {
            if (!resizeState) return;

            const delta = e.clientX - resizeState.startX;
            const containerWidth = currentColumnView.parentElement?.offsetWidth || 0;

            const newWidth = resizeState.startWidth + delta;
            const newWidthPercent = (newWidth / containerWidth) * 100;

            const nextNewWidth = resizeState.nextStartWidth - delta;
            const nextWidthPercent = (nextNewWidth / containerWidth) * 100;

            // Minimum width constraint (10%)
            if (newWidthPercent < 10 || nextWidthPercent < 10) return;

            // Update current column width with !important to override decoration styles
            currentColumnView.style.cssText = `flex-basis: ${newWidthPercent}% !important; height: auto;`;
            nextColumnView.style.cssText = `flex-basis: ${nextWidthPercent}% !important; height: auto;`;
        };

        const handleMouseUp = () => {
            // Remove body class
            document.body.classList.remove('is-resizing-column');

            if (!resizeState) {
                setResizeState(null);
                return;
            }

            const containerWidth = currentColumnView.parentElement?.offsetWidth || 0;
            const finalWidth = currentColumnView.offsetWidth;
            const finalWidthPercent = (finalWidth / containerWidth) * 100;

            const nextFinalWidth = nextColumnView.offsetWidth;
            const nextFinalWidthPercent = (nextFinalWidth / containerWidth) * 100;

            // Update attributes to persist the new widths
            const pos = getPos();
            if (pos !== undefined && updateAttributes) {
                updateAttributes({ width: finalWidthPercent });

                // Update next sibling's width
                const nextPos = pos + node.nodeSize;
                const nextNode = editor.state.doc.nodeAt(nextPos);
                if (nextNode) {
                    editor.view.dispatch(
                        editor.state.tr.setNodeMarkup(nextPos, undefined, {
                            ...nextNode.attrs,
                            width: nextFinalWidthPercent
                        })
                    );
                }
            }

            setResizeState(null);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.classList.remove('is-resizing-column');
        };
    }, [resizeState, editor, getPos, node.nodeSize, updateAttributes]);

    const wrapperClassName = useMemo(() =>
        cn("prose-p:m-1 w-full relative p-1 ",
            editor.isEditable ? "outline rounded-sm" : " h-full",
            resizeState?.isResizing && "select-none"
        ), [editor.isEditable, resizeState?.isResizing]
    )

    return <NodeViewWrapper
        ref={ref}
        className={wrapperClassName}
    >
        {editor.isEditable && <IconButton
            onClick={handleDelete}
            className="absolute z-auto top-0 right-0"
            icon={<EraserIcon className="h-4 w-4" />} />}
        <NodeViewContent className="h-full w-auto" />
        {editor.isEditable && !isLastColumn && (
            <div
                ref={resizeHandleRef}
                className={cn(
                    "resize-handle",
                    resizeState?.isResizing && "resizing"
                )}
                onMouseDown={handleResizeStart}
            />
        )}
    </NodeViewWrapper>
}, (prevProps, nextProps) => {
    // Custom comparison for better performance
    return (
        prevProps.node === nextProps.node &&
        prevProps.editor.isEditable === nextProps.editor.isEditable &&
        prevProps.selected === nextProps.selected
    )
})