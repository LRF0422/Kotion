import { Editor } from "@tiptap/react";
import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@kn/ui";
import { RiFontFamily } from "@kn/icon";

// 默认字体（跟随主题/继承样式），选中时清除 fontFamily
const DEFAULT = "default";

export const FONT_FAMILIES: { label: string; value: string }[] = [
    { label: "默认", value: DEFAULT },
    { label: "无衬线", value: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" },
    { label: "衬线", value: "ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif" },
    { label: "等宽", value: "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace" },
    { label: "微软雅黑", value: "'Microsoft YaHei', '微软雅黑', sans-serif" },
    { label: "黑体", value: "SimHei, '黑体', sans-serif" },
    { label: "宋体", value: "SimSun, '宋体', serif" },
    { label: "楷体", value: "KaiTi, '楷体', STKaiti, serif" },
];

export const FontFamilyStaticMenu: React.FC<{ editor: Editor }> = ({ editor }) => {

    const current = editor.getAttributes("textStyle").fontFamily || DEFAULT;
    // 只有命中预设字体才回显，否则回落为默认
    const value = FONT_FAMILIES.some((f) => f.value === current) ? current : DEFAULT;

    const onChange = (v: string) => {
        if (v === DEFAULT) {
            editor.chain().focus().unsetFontFamily().run();
        } else {
            editor.chain().focus().setFontFamily(v).run();
        }
    };

    return <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-[120px] h-8 outline-none border-none">
            <div className="flex items-center gap-2">
                <RiFontFamily className="h-4 w-4" />
                <SelectValue />
            </div>
        </SelectTrigger>
        <SelectContent>
            {FONT_FAMILIES.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                    <span style={{ fontFamily: f.value === DEFAULT ? undefined : f.value }}>{f.label}</span>
                </SelectItem>
            ))}
        </SelectContent>
    </Select>;
};
