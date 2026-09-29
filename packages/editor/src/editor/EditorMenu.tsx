import React, { ElementType, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ExtensionWrapper, MenuConfigItem, useTranslation } from "@kn/common";
import { Editor } from "@tiptap/core";
import { Button, Toggle } from "@kn/ui";
import { Separator } from "@kn/ui";
import { Popover, PopoverContent, PopoverTrigger } from "@kn/ui";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@kn/ui";
import { cn } from "@kn/ui";
import { isArray } from "lodash";
import { Undo2, Redo2, IconMore } from "@kn/icon";
import { BubbleMenu as ReactBubble } from "../components";
import { useSafeState } from "ahooks";
import { TextSelection } from "@tiptap/pm/state";

interface MenuItem {
    menu: ElementType;
    tooltip?: string;
}

interface MenuRecord {
    block: MenuItem[];
    inline: MenuItem[];
    custom: MenuItem[];
    mark: MenuItem[];
}

/** Logical clusters of the bar. Each keeps its own divider and folds into the
 *  overflow menu as a unit, so closely related commands never get separated. */
type ToolbarGroupId = "history" | "mark" | "inline" | "block";

interface ToolbarGroup {
    id: ToolbarGroupId;
    items: React.ReactNode[];
}

/** One laid-out cell of the bar: a menu item, or the divider before a group. */
interface ToolbarUnit {
    key: string;
    kind: "item" | "divider";
    group: ToolbarGroupId;
    node: React.ReactNode;
}

const ROW_GAP = 2; // gap-x-0.5
/** The "more" button (h-7 w-7) plus the fade in front of it. Reserved from the
 *  row width whenever something has to overflow. */
const MORE_RESERVE = 28 + 20 + 6 + 4;

export const EditorMenu: React.FC<{
    editor: Editor;
    extensionWrappers: ExtensionWrapper[];
    toolbar?: boolean;
}> = ({ editor, extensionWrappers, toolbar = true }) => {

    const { t } = useTranslation();
    const [bubbleMenu, setBubbleMenu] = useSafeState<ElementType[]>([]);
    const [flotMenu, setFlotMenu] = useSafeState<ElementType[]>([]);
    const [floatingUI, setFloatingUI] = useSafeState<ElementType[]>([]);
    const [record, setRecord] = useSafeState<MenuRecord>({
        block: [],
        inline: [],
        custom: [],
        mark: []
    });

    // Process extension wrappers and extract menu configurations
    useEffect(() => {
        if (!extensionWrappers || extensionWrappers.length === 0) {
            return;
        }

        const newRecord: MenuRecord = {
            block: [],
            inline: [],
            custom: [],
            mark: []
        };
        const newBubbleMenu: ElementType[] = [];
        const newFlotMenu: ElementType[] = [];
        const newFloatingUI: ElementType[] = [];

        extensionWrappers.forEach(wrapper => {
            // Process menu config
            if (wrapper.menuConfig) {
                if (isArray(wrapper.menuConfig)) {
                    wrapper.menuConfig.forEach((config: MenuConfigItem) => {
                        newRecord[config.group].push({ menu: config.menu, tooltip: config.tooltip });
                    });
                } else {
                    newRecord[wrapper.menuConfig.group].push({ menu: wrapper.menuConfig.menu, tooltip: wrapper.menuConfig.tooltip });
                }
            }

            // Process bubble menu
            if (wrapper.bubbleMenu) {
                if (isArray(wrapper.bubbleMenu)) {
                    newBubbleMenu.push(...wrapper.bubbleMenu);
                } else {
                    newBubbleMenu.push(wrapper.bubbleMenu);
                }
            }

            // Process float menu
            if (wrapper.flotMenuConfig) {
                newFlotMenu.push(...wrapper.flotMenuConfig);
            }

            // Process floating UI (standalone floating components like chat)
            if (wrapper.floatingUI) {
                newFloatingUI.push(wrapper.floatingUI);
            }
        });

        setRecord(newRecord);
        setBubbleMenu(newBubbleMenu);
        setFlotMenu(newFlotMenu);
        setFloatingUI(newFloatingUI);
    }, [extensionWrappers, setRecord, setBubbleMenu, setFlotMenu, setFloatingUI]);

    // Memoized render function for menu items — wraps in Tooltip when tooltip text is provided.
    // The trigger is a real <span>, never the menu component itself: extension menus
    // are plain function components (`React.FC<{ editor }>`) that neither forward a ref
    // nor spread props, so handing them to `<TooltipTrigger asChild>` silently dropped
    // both the ref and the pointer handlers and no tooltip ever opened.
    const renderItem = useCallback((items: MenuItem[], level: number): React.ReactNode[] => (
        items.map(({ menu: Com, tooltip }, index) => {
            const node = <Com key={`${level}-${index}`} editor={editor} />;
            if (!tooltip) return node;
            return (
                <TooltipProvider key={`${level}-${index}`} delayDuration={400}>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span className="inline-flex items-center">
                                {node}
                            </span>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">
                            {t(tooltip)}
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            );
        })
    ), [editor, t]);

    // Memoized shouldShow function for bubble menu
    const shouldShow = useCallback(() => {
        return editor.state.selection instanceof TextSelection &&
            !editor.state.selection.empty &&
            !editor.isActive('codeBlock');
    }, [editor]);

    // Check undo/redo availability
    const canUndo = editor.can().undo();
    const canRedo = editor.can().redo();

    // Memoized undo/redo handlers
    const handleUndo = useCallback(() => {
        editor.commands.undo();
    }, [editor]);

    const handleRedo = useCallback(() => {
        editor.commands.redo();
    }, [editor]);

    // ─── Toolbar layout ──────────────────────────────────────────────
    // The bar is always a single row. Whatever does not fit is folded into the
    // "more" popover instead of being clipped or scrolled out of reach — the
    // editor is also used in narrow hosts (agent side pane, table cells).
    const groups = useMemo<ToolbarGroup[]>(() => {
        const list: ToolbarGroup[] = [{
            id: "history",
            items: [
                <TooltipProvider key="history-undo" delayDuration={400}>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Toggle
                                onClick={handleUndo}
                                size="sm"
                                disabled={!canUndo}
                                aria-label="Undo"
                                className="h-7 w-7 p-0 rounded-md transition-colors hover:bg-muted data-[disabled=true]:opacity-40"
                            >
                                <Undo2 className="h-3.5 w-3.5" />
                            </Toggle>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">
                            {t('editor.tooltip.undo')}
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>,
                <TooltipProvider key="history-redo" delayDuration={400}>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Toggle
                                onClick={handleRedo}
                                size="sm"
                                disabled={!canRedo}
                                aria-label="Redo"
                                className="h-7 w-7 p-0 rounded-md transition-colors hover:bg-muted data-[disabled=true]:opacity-40"
                            >
                                <Redo2 className="h-3.5 w-3.5" />
                            </Toggle>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">
                            {t('editor.tooltip.redo')}
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>,
            ],
        }];

        if (record.mark.length > 0) list.push({ id: "mark", items: renderItem(record.mark, 1) });
        if (record.inline.length > 0) list.push({ id: "inline", items: renderItem(record.inline, 2) });
        if (record.block.length > 0) list.push({ id: "block", items: renderItem(record.block, 3) });
        return list;
    }, [canRedo, canUndo, handleRedo, handleUndo, record.block, record.inline, record.mark, renderItem, t]);

    // Flatten the groups into measurable cells, grouped the way the bar is
    // currently laid out (a divider between two groups).
    const units = useMemo<ToolbarUnit[]>(() => {
        const list: ToolbarUnit[] = [];
        groups.forEach((group, groupIndex) => {
            if (groupIndex > 0) {
                list.push({
                    key: `divider-${group.id}`,
                    kind: "divider",
                    group: group.id,
                    node: <Separator orientation="vertical" className="mx-1 h-4" />,
                });
            }
            group.items.forEach((node, index) => {
                list.push({ key: `${group.id}-${index}`, kind: "item", group: group.id, node });
            });
        });
        return list;
    }, [groups]);

    const rowRef = useRef<HTMLDivElement>(null);
    const unitRefs = useRef<(HTMLSpanElement | null)[]>([]);
    const rafRef = useRef<number | null>(null);
    // How many leading cells fit. Everything past it stays mounted (so it can
    // still be measured on the next resize) but is hidden and moved into the
    // overflow popover.
    const [visibleCount, setVisibleCount] = useState(units.length);
    const unitsRef = useRef(units);
    unitsRef.current = units;

    const measure = useCallback(() => {
        const row = rowRef.current;
        if (!row) return;
        const list = unitsRef.current;
        // Hidden cells keep their box (visibility, not display), so every width
        // stays measurable no matter how narrow the row gets.
        const widths = list.map((_, index) => unitRefs.current[index]?.offsetWidth ?? 0);
        const styles = window.getComputedStyle(row);
        const padding = (parseFloat(styles.paddingLeft) || 0) + (parseFloat(styles.paddingRight) || 0);
        const available = row.clientWidth - padding;
        const total = widths.reduce((sum, width, index) => sum + width + (index > 0 ? ROW_GAP : 0), 0);

        let count = list.length;
        if (total > available) {
            const fits = available - MORE_RESERVE;
            let used = 0;
            count = 0;
            for (let index = 0; index < widths.length; index++) {
                const next = count === 0 ? widths[index] : used + ROW_GAP + widths[index];
                if (next > fits) break;
                used = next;
                count = index + 1;
            }
            // A divider with nothing after it is just noise.
            while (count > 0 && list[count - 1].kind === "divider") count--;
        }
        setVisibleCount(previous => (previous === count ? previous : count));
    }, []);

    // Coalesce the re-measures triggered by resizes, typing and late webfonts.
    const scheduleMeasure = useCallback(() => {
        if (rafRef.current !== null) return;
        rafRef.current = requestAnimationFrame(() => {
            rafRef.current = null;
            measure();
        });
    }, [measure]);

    // Runs before paint, so the first frame is already laid out correctly.
    useLayoutEffect(() => {
        measure();
    }, [measure, units]);

    useEffect(() => {
        const row = rowRef.current;
        if (!row || typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(scheduleMeasure);
        observer.observe(row);
        return () => observer.disconnect();
    }, [scheduleMeasure]);

    // Dropdown labels ("Heading 1", font family…) change width with the
    // selection, so the fit has to be re-checked when the document moves.
    useEffect(() => {
        editor.on("selectionUpdate", scheduleMeasure);
        editor.on("update", scheduleMeasure);
        return () => {
            editor.off("selectionUpdate", scheduleMeasure);
            editor.off("update", scheduleMeasure);
        };
    }, [editor, scheduleMeasure]);

    useEffect(() => {
        const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
        if (!fonts?.ready) return;
        let cancelled = false;
        fonts.ready.then(() => { if (!cancelled) scheduleMeasure(); }).catch(() => { /* best-effort */ });
        return () => { cancelled = true; };
    }, [scheduleMeasure]);

    useEffect(() => () => {
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    }, []);

    const shown = Math.min(visibleCount, units.length);
    const hasOverflow = shown < units.length;

    // The hidden cells, still grouped, as they should appear in the popover.
    const overflowGroups = useMemo(() => {
        const list: { id: ToolbarGroupId; nodes: React.ReactNode[] }[] = [];
        units.slice(shown).forEach(unit => {
            if (unit.kind !== "item") return;
            const last = list[list.length - 1];
            if (last && last.id === unit.group) last.nodes.push(unit.node);
            else list.push({ id: unit.group, nodes: [unit.node] });
        });
        return list;
    }, [shown, units]);

    return (
        <>
            {toolbar && (
                <div
                    ref={rowRef}
                    className="relative z-20 flex w-full min-w-0 max-w-full shrink-0 flex-nowrap items-center gap-x-0.5 overflow-hidden border-b border-border/60 bg-background px-1.5 py-1"
                >
                    {units.map((unit, index) => (
                        <span
                            key={unit.key}
                            ref={(element) => { unitRefs.current[index] = element; }}
                            className={cn(
                                "inline-flex shrink-0 items-center",
                                index >= shown && "invisible",
                            )}
                        >
                            {unit.node}
                        </span>
                    ))}

                    {hasOverflow && (
                        <div className="absolute inset-y-0 right-0 z-10 flex items-center bg-gradient-to-l from-background via-background to-transparent pl-5 pr-1.5">
                            <Popover>
                                {/* Same tooltip the rest of the bar uses — a native
                                    `title` would be a second, differently-timed one.
                                    Radix throws unless it sits inside a provider. */}
                                <TooltipProvider delayDuration={400}>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <PopoverTrigger asChild>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    aria-label={t('editor.toolbar.more')}
                                                    className="h-7 w-7 p-0 text-muted-foreground transition-colors hover:text-foreground"
                                                >
                                                    <IconMore className="h-3.5 w-3.5" />
                                                </Button>
                                            </PopoverTrigger>
                                        </TooltipTrigger>
                                        <TooltipContent side="bottom" className="text-xs">
                                            {t('editor.toolbar.more')}
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                                <PopoverContent
                                    align="end"
                                    sideOffset={6}
                                    className="w-[min(20rem,calc(100vw-2rem))] p-2"
                                >
                                    <div className="flex flex-col gap-1.5">
                                        {overflowGroups.map((group, index) => (
                                            <React.Fragment key={group.id}>
                                                {index > 0 && <Separator className="bg-border/60" />}
                                                <div className="flex flex-wrap items-center gap-0.5">
                                                    {group.nodes}
                                                </div>
                                            </React.Fragment>
                                        ))}
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>
                    )}
                </div>
            )}
            {bubbleMenu.length > 0 && bubbleMenu.map((Com, index) => <Com key={`bubble-${index}`} editor={editor} />)}
            {flotMenu.length > 0 && (
                <ReactBubble
                    forNode
                    editor={editor}
                    shouldShow={shouldShow}
                    pluginKey="editor-menu"
                    options={{ placement: 'top' }}
                    // On narrow viewports the toolbar would overflow off-screen.
                    // Cap it to the viewport and let it scroll horizontally instead.
                    className="max-w-[calc(100vw-1rem)] overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                    <div className="flex flex-nowrap items-center gap-0.5 [&>*]:shrink-0">
                        {flotMenu.map((Menu, index) => (
                            <Menu key={`float-menu-${index}`} editor={editor} />
                        ))}
                    </div>
                </ReactBubble>
            )}
            {/* Floating UI components (always mounted, independent of bubble menu) */}
            {floatingUI.length > 0 && floatingUI.map((FloatingComponent, index) => (
                <FloatingComponent key={`floating-ui-${index}`} editor={editor} />
            ))}

        </>
    );
};
