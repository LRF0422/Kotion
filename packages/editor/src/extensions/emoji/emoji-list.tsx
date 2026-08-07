import React, {
    forwardRef,
    useEffect,
    useImperativeHandle,
    useRef,
    useState,
} from "react";
import { cn, FlatEmoji } from "@kn/ui";
import { createT } from "../../i18n";
import type { EmojiItem } from "./emoji-data";

interface EmojiListProps {
    items: EmojiItem[];
    command: (item: EmojiItem) => void;
}

/**
 * ":" 联想的下拉列表，Notion 风格行式布局：
 * FlatEmoji 图标 + 中文标签，↑↓ 导航、Enter 选中、鼠标 hover 同步高亮。
 */
const EmojiList = forwardRef((props: EmojiListProps, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const listRef = useRef<HTMLDivElement>(null);

    const selectItem = (index: number) => {
        const item = props.items[index];
        if (item) {
            props.command(item);
        }
    };

    useEffect(() => {
        setSelectedIndex(0);
    }, [props.items]);

    // 键盘导航时保持选中行可见
    useEffect(() => {
        listRef.current?.children[selectedIndex]?.scrollIntoView({ block: "nearest" });
    }, [selectedIndex]);

    useImperativeHandle(ref, () => ({
        onKeyDown: ({ event }: { event: KeyboardEvent }) => {
            if (!props.items.length) return false;

            if (event.key === "ArrowUp") {
                setSelectedIndex((selectedIndex + props.items.length - 1) % props.items.length);
                return true;
            }

            if (event.key === "ArrowDown") {
                setSelectedIndex((selectedIndex + 1) % props.items.length);
                return true;
            }

            if (event.key === "Enter") {
                selectItem(selectedIndex);
                return true;
            }

            return false;
        },
    }));

    if (!props.items.length) {
        return (
            <div className="w-64 rounded-md border bg-popover px-3 py-2 text-center text-xs text-muted-foreground shadow-md">
                {createT()("emoji.noResults")}
            </div>
        );
    }

    return (
        <div
            ref={listRef}
            className="max-h-72 w-64 overflow-y-auto rounded-md border bg-popover p-1 shadow-md"
        >
            {props.items.map((item, index) => (
                <button
                    key={item.unicode}
                    type="button"
                    className={cn(
                        "flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-sm",
                        index === selectedIndex && "bg-accent"
                    )}
                    onMouseEnter={() => setSelectedIndex(index)}
                    onClick={() => selectItem(index)}
                >
                    <FlatEmoji emoji={item.unicode} size={18} className="flex-shrink-0" />
                    <span className="truncate">{item.label}</span>
                </button>
            ))}
        </div>
    );
});

EmojiList.displayName = "EmojiList";

export default EmojiList;
