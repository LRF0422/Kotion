import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Editor } from "@tiptap/core";
import { useHover, useSafeState } from "ahooks";
import React, { PropsWithChildren, useEffect, useRef } from "react";


export const EditorWrapper: React.FC<PropsWithChildren & { editor: Editor }> = ({ children, editor }) => {


    return <div className="h-full w-full">
        <div
            className=" h-[120px] w-full"
            style={{
                backgroundImage: `url('${editor.storage?.title?.cover}')`,
                backgroundSize: 'auto',
            }}
        />
        {children}
    </div>
}