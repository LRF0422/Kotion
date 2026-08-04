import { Editor } from "@tiptap/react";
import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@kn/ui";
import { AiOutlineLineHeight } from "@kn/icon";

// 默认行高（清除 lineHeight 属性，回退到编辑器 CSS 的 1.6）
const DEFAULT = "default";

const LINE_HEIGHTS: { label: string; value: string }[] = [
    { label: "默认", value: DEFAULT },
    { label: "1.0", value: "1.0" },
    { label: "1.15", value: "1.15" },
    { label: "1.25", value: "1.25" },
    { label: "1.5", value: "1.5" },
    { label: "1.75", value: "1.75" },
    { label: "2.0", value: "2.0" },
];

export const LineHeightStaticMenu: React.FC<{ editor: Editor }> = ({ editor }) => {
    const current = editor.getAttributes("paragraph").lineHeight || editor.getAttributes("heading").lineHeight;
    // 只有命中预设值才回显，否则回落为默认
    const value = LINE_HEIGHTS.some((l) => l.value === current) ? current : DEFAULT;

    const onChange = (v: string) => {
        if (v === DEFAULT) {
            editor.chain().focus().unsetLineHeight().run();
        } else {
            editor.chain().focus().setLineHeight(v).run();
        }
    };

    return <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-[100px] h-8 outline-none border-none">
            <div className="flex items-center gap-2">
                <AiOutlineLineHeight className="h-4 w-4" />
                <SelectValue />
            </div>
        </SelectTrigger>
        <SelectContent>
            {LINE_HEIGHTS.map((l) => (
                <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
            ))}
        </SelectContent>
    </Select>;
};
