import {
    Activity,
    AlignLeft,
    Ban,
    ClipboardList,
    Columns2,
    ExternalLink,
    FilePenLine,
    FilePlus2,
    FileText,
    FolderInput,
    FolderTree,
    Globe,
    Heading,
    Highlighter,
    Image,
    Link,
    ListChecks,
    ListTree,
    MessageCircle,
    Move,
    PenLine,
    Plus,
    Quote,
    RotateCcw,
    ScrollText,
    Search,
    Sparkles,
    SquarePen,
    Table2,
    Trash2,
    Type,
    WandSparkles,
    Wrench,
    type LucideIcon,
} from '@kn/icon'

/**
 * Per-tool icon for the activity timeline.
 *
 * Built-in tools carry a semantic icon so a long run reads as "read / edit /
 * page / table / web…" instead of a wall of identical wrenches. Plugin tools
 * fall back to a verb prefix heuristic and then to the wrench.
 */
const TOOL_ICONS: Record<string, LucideIcon> = {
    // Discovery / skills
    load_skill: Sparkles,
    // Context: what is the agent operating on?
    getCurrentTarget: Activity,

    // Read
    getDocumentStructure: ListTree,
    searchInDocument: Search,
    readChunk: FileText,
    readImage: Image,

    // Write
    updateTitle: Heading,
    write: PenLine,
    insertNear: Plus,
    replaceContent: FilePenLine,
    replaceRange: FilePenLine,
    replaceBlockById: FilePenLine,
    insertAtBlockId: Plus,
    applyEdits: WandSparkles,

    // Delete
    deleteText: Trash2,
    deleteBlocks: Trash2,
    deleteRange: Trash2,
    deleteBlocksBetween: Trash2,
    clearDocument: Trash2,

    // Layout / columns
    insertColumns: Columns2,
    getColumnsInfo: Columns2,
    updateColumnContent: Columns2,
    setColumnsLayout: Columns2,
    addColumnToLayout: Columns2,
    deleteColumn: Columns2,
    deleteColumnsLayout: Columns2,
    insertNestedColumns: Columns2,
    buildLayout: Columns2,
    setColumnWidths: Columns2,
    setColumnStyle: Columns2,
    setColumnsGap: Columns2,

    // Forms / interaction
    requestUserForm: ClipboardList,
    getFormRequest: ClipboardList,
    listFormRequests: ClipboardList,
    cancelFormRequest: ClipboardList,
    askUserChoice: MessageCircle,

    // Structure / formatting
    highlight: Highlighter,
    referenceBlocks: Quote,
    convertBlock: WandSparkles,
    moveBlock: Move,
    setBlockAlignment: AlignLeft,
    formatText: Type,

    // Tables
    insertTable: Table2,
    listTable: Table2,
    deleteTable: Table2,
    getTableInfo: Table2,
    editTable: Table2,
    editTableCell: Table2,

    // Pages / spaces
    createPage: FilePlus2,
    editPage: SquarePen,
    openPage: ExternalLink,
    renamePage: FilePenLine,
    movePage: FolderInput,
    deletePage: Trash2,
    restorePage: RotateCcw,
    listSpaces: FolderTree,
    getSpacePageTree: FolderTree,
    searchPages: Search,
    insertPageLink: Link,

    // Web / tasks
    web_search: Globe,
    update_todos: ListChecks,
    listBackgroundTasks: Activity,
    getBackgroundTask: Activity,
    cancelBackgroundTask: Ban,
    listLongTasks: Activity,
    getLongTask: Activity,
    getLongTaskLogs: ScrollText,
    cancelLongTask: Ban,
}

export function getToolIcon(toolName: string): LucideIcon {
    const exact = TOOL_ICONS[toolName]
    if (exact) return exact

    const normalized = toolName.toLowerCase()
    if (/(delete|remove|clear|cancel)/.test(normalized)) return Trash2
    if (/(search|find|query)/.test(normalized)) return Search
    if (/(table)/.test(normalized)) return Table2
    if (/(column|layout)/.test(normalized)) return Columns2
    if (/(page)/.test(normalized)) return FileText
    if (/(read|get|list|info|fetch)/.test(normalized)) return FileText
    if (/(create|insert|add|new)/.test(normalized)) return Plus
    if (/(update|edit|set|write|replace|rename)/.test(normalized)) return SquarePen
    return Wrench
}
