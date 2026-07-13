import React, {
    useCallback,
    useEffect,
    useReducer,
    useRef,
    useState,
} from "react";
import { Editor } from "@tiptap/core";
import type { Transaction } from "@tiptap/pm/state";
import { useDebounceFn } from "ahooks";
import {
    ArrowDown,
    ArrowUp,
    CaseSensitive,
    Regex,
    Search,
    WholeWord,
    X,
} from "@kn/icon";
import {
    Button,
    Input,
    Toggle,
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
    cn,
} from "@kn/ui";

import { event as rawEvent } from "@kn/common";
import { ON_SEARCH_RESULTS, ON_SEARCH_TOGGLE } from "./events";
import type { SearchOptions, SearchStorage } from "./search";

const event = rawEvent as unknown as {
    on: (name: string, fn: (...args: any[]) => void) => unknown;
    off: (name: string, fn?: (...args: any[]) => void) => unknown;
};

interface SearchExtState {
    options: SearchOptions;
    storage: SearchStorage;
}

const readState = (editor: Editor): SearchExtState => {
    const ext = editor.extensionManager.extensions.find((e) => e.name === "search");
    const options = (ext?.options ?? {}) as SearchOptions;
    const storage = (editor.storage.search ?? {}) as SearchStorage;
    return { options, storage };
};

export const SearchPanel: React.FC<{ editor: Editor }> = ({ editor }) => {
    // Track open state via event bus (flipped by open/close commands).
    const [open, setOpen] = useState<boolean>(
        () => (editor.storage.search as SearchStorage | undefined)?.panelOpen === true
    );
    // Force re-render when results change (counter, navigation highlight).
    const [renderKey, forceRender] = useReducer((n: number) => n + 1, 0);

    const searchInputRef = useRef<HTMLInputElement | null>(null);

    // Local UI state mirrors extension options so inputs feel responsive.
    const initial = readState(editor);
    const [searchValue, setSearchValue] = useState<string>(initial.options.searchTerm || "");
    const [replaceValue, setReplaceValue] = useState<string>(initial.options.replaceTerm || "");
    const [caseSensitive, setCaseSensitive] = useState<boolean>(!!initial.options.caseSensitive);
    const [useRegex, setUseRegex] = useState<boolean>(!initial.options.disableRegex);
    const [wholeWord, setWholeWord] = useState<boolean>(!!initial.options.wholeWord);

    // Subscribe to open/close toggle events.
    useEffect(() => {
        const syncOpen = () => {
            const next = editor.storage.search?.panelOpen === true;
            setOpen(next);
        };
        event.on(ON_SEARCH_TOGGLE, syncOpen);
        return () => {
            event.off(ON_SEARCH_TOGGLE, syncOpen);
        };
    }, [editor]);

    // Subscribe to result-set changes for counter updates.
    useEffect(() => {
        const onResults = () => forceRender();
        event.on(ON_SEARCH_RESULTS, onResults);
        // Also re-render on any doc- or selection-affecting transaction so
        // the index/counter stays fresh when navigation or replace completes
        // via the plugin state. Skip Tiptap's focus/blur meta transactions:
        // they carry no relevant change and are dispatched every time a Radix
        // Dialog / Sheet / DropdownMenu opens, which would otherwise churn a
        // useless re-render of the search panel on every menu open.
        const onTx = ({ transaction }: { transaction: Transaction }) => {
            const isFocusBlurOnly =
                !transaction.docChanged &&
                !transaction.selectionSet &&
                (transaction.getMeta("focus") != null ||
                    transaction.getMeta("blur") != null);
            if (isFocusBlurOnly) return;
            forceRender();
        };
        editor.on("transaction", onTx);
        return () => {
            event.off(ON_SEARCH_RESULTS, onResults);
            editor.off("transaction", onTx);
        };
    }, [editor]);

    // Auto-focus and select when panel opens.
    useEffect(() => {
        if (open) {
            requestAnimationFrame(() => {
                searchInputRef.current?.focus();
                searchInputRef.current?.select();
            });
        }
    }, [open]);

    const { run: runSearch } = useDebounceFn(
        (term: string) => {
            editor.chain().setSearchTerm(term).run();
        },
        { wait: 150 }
    );

    const handleSearchChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const value = e.target.value;
            setSearchValue(value);
            runSearch(value);
        },
        [runSearch]
    );

    const handleReplaceChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const value = e.target.value;
            setReplaceValue(value);
            editor.chain().setReplaceTerm(value).run();
        },
        [editor]
    );

    const goNext = useCallback(() => {
        editor.chain().goToNextSearchResult().run();
    }, [editor]);

    const goPrev = useCallback(() => {
        editor.chain().goToPrevSearchResult().run();
    }, [editor]);

    const doReplace = useCallback(() => {
        editor.chain().setReplaceTerm(replaceValue).replace().run();
    }, [editor, replaceValue]);

    const doReplaceAll = useCallback(() => {
        editor.chain().setReplaceTerm(replaceValue).replaceAll().run();
    }, [editor, replaceValue]);

    const close = useCallback(() => {
        editor.chain().closeSearchPanel().run();
    }, [editor]);

    const handleSearchKey = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "Enter") {
                e.preventDefault();
                if (e.shiftKey) goPrev();
                else goNext();
            } else if (e.key === "Escape") {
                e.preventDefault();
                close();
            }
        },
        [goNext, goPrev, close]
    );

    const toggleCase = useCallback(() => {
        const next = !caseSensitive;
        setCaseSensitive(next);
        editor.chain().setSearchOptions({ caseSensitive: next }).run();
    }, [caseSensitive, editor]);

    const toggleRegex = useCallback(() => {
        const next = !useRegex;
        setUseRegex(next);
        editor.chain().setSearchOptions({ disableRegex: !next }).run();
    }, [useRegex, editor]);

    const toggleWholeWord = useCallback(() => {
        const next = !wholeWord;
        setWholeWord(next);
        editor.chain().setSearchOptions({ wholeWord: next }).run();
    }, [wholeWord, editor]);

    // No memoisation: deps include `renderKey` so every event-driven
    // re-render recomputes from the latest storage snapshot.
    void renderKey;
    const storage = editor.storage.search;
    const total = storage?.results.length ?? 0;
    const current = storage?.currentIndex ?? -1;
    const counter = !searchValue
        ? ""
        : total === 0
            ? "0/0"
            : `${current + 1}/${total}`;

    if (!open) return null;

    return (
        <div
            className={cn(
                "search-panel",
                "fixed top-16 right-4 z-50 w-[360px]",
                "bg-background border rounded-md shadow-lg p-2",
                "flex flex-col gap-2"
            )}
            onMouseDown={(e) => e.stopPropagation()}
        >
            {/* Row 1: search + counter + navigation + close */}
            <div className="flex items-center gap-1">
                <Search className="h-4 w-4 text-muted-foreground shrink-0 ml-1" />
                <Input
                    ref={searchInputRef}
                    value={searchValue}
                    placeholder="Find"
                    className="h-8 flex-1"
                    onChange={handleSearchChange}
                    onKeyDown={handleSearchKey}
                />
                <span className="text-xs text-muted-foreground tabular-nums min-w-[40px] text-center">
                    {counter}
                </span>
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={goPrev} aria-label="Previous match">
                                <ArrowUp className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">Previous (Shift+Enter)</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={goNext} aria-label="Next match">
                                <ArrowDown className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">Next (Enter)</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={close} aria-label="Close">
                                <X className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">Close (Esc)</TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </div>

            {/* Row 2: replace */}
            <div className="flex items-center gap-1">
                <span className="w-4 shrink-0 ml-1" />
                <Input
                    value={replaceValue}
                    placeholder="Replace"
                    className="h-8 flex-1"
                    onChange={handleReplaceChange}
                />
                <Button size="sm" variant="outline" className="h-8" onClick={doReplace}>
                    Replace
                </Button>
                <Button size="sm" variant="outline" className="h-8" onClick={doReplaceAll}>
                    All
                </Button>
            </div>

            {/* Row 3: toggles */}
            <div className="flex items-center gap-1 pl-5">
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Toggle size="sm" pressed={caseSensitive} onClick={toggleCase} aria-label="Case sensitive">
                                <CaseSensitive className="h-4 w-4" />
                            </Toggle>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">Match case</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Toggle size="sm" pressed={wholeWord} onClick={toggleWholeWord} aria-label="Whole word">
                                <WholeWord className="h-4 w-4" />
                            </Toggle>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">Match whole word</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Toggle size="sm" pressed={useRegex} onClick={toggleRegex} aria-label="Regular expression">
                                <Regex className="h-4 w-4" />
                            </Toggle>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">Use regular expression</TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </div>
        </div>
    );
};
