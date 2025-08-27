import { Editor } from "@tiptap/react";
import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@kn/ui";
import { AiOutlineLineHeight } from "@kn/icon";

export const LineHeightStaticMenu: React.FC<{ editor: Editor }> = ({ editor }) => {

    const value = editor.getAttributes("textStyle").lineHeight || "1.5"

    return <Select value={value} onValueChange={(v) => {
        console.log('changed', v);

        editor.chain().focus().toggleTextStyle({ lineHeight: v }).run()
    }}>
        <SelectTrigger className="w-[100px] h-8 outline-none border-none">
            <div className="flex items-center gap-2">
                <AiOutlineLineHeight className="h-4 w-4" />
                <SelectValue />
            </div>
        </SelectTrigger>
        <SelectContent>
            <SelectItem value="1.0">1.0</SelectItem>
            <SelectItem value="1.5">1.5</SelectItem>
        </SelectContent>
    </Select>
}