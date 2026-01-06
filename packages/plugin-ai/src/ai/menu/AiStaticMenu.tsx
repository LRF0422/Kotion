import { Button } from "@kn/ui";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@kn/ui";
import { Editor } from "@kn/editor";
import { ChevronDown, Circle, Languages, MessageCircleMore, PencilLine, SmilePlus, Sparkles } from "@kn/icon";
import React from "react";
import { aiText } from "../utils";
import { useEditorAgent } from "@kn/core";



export const AiStaticMenu: React.FC<{ editor: Editor }> = ({ editor }) => {

    const agent = useEditorAgent(editor)

    return <DropdownMenu>
        <DropdownMenuTrigger>
            <Button size="sm" variant="ghost" className="flex flex-row gap-1 items-center text-purple-500 hover:text-purple-500"><Sparkles className="h-4 w-4" /> AI Tools <ChevronDown className="h-3 w-3" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-[200px]" align="start">
            <DropdownMenuItem className="flex flex-row gap-1 items-center" onClick={() => {
                aiText(editor, "请为给出的内容续写")
            }}><PencilLine className="h-4 w-4" /> 续写</DropdownMenuItem>
            <DropdownMenuItem className="flex flex-row gap-1 items-center" onClick={() => aiText(editor, '将给出内容进行简化')}><Circle className="h-4 w-4" /> 简化</DropdownMenuItem>
            <DropdownMenuItem className="flex flex-row gap-1 items-center"
                onClick={() => aiText(editor, "为给出的内容添加emoji表情")}
            ><SmilePlus className="h-4 w-4" /> 插入表情</DropdownMenuItem>
            <DropdownMenuItem onClick={() => agent.generateText("总结一下这篇文章")}>总结</DropdownMenuItem>
            <DropdownMenuItem onClick={() => agent.generateText("找出错别字的位置，并标记出来")}>查错</DropdownMenuItem>
            <DropdownMenuItem onClick={() => agent.generateText("阅读整篇文章，根据你的理解在合适的地方给文章插入表情")}>表情</DropdownMenuItem>
            <DropdownMenuSub>
                <DropdownMenuSubTrigger className="flex flex-row gap-1 items-center">
                    <MessageCircleMore className="h-4 w-4" /> 改变语气
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-[200px]">
                    <DropdownMenuItem onClick={() => aiText(editor, "用和蔼的语气重写")}>和蔼</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => aiText(editor, "用官方的语气重写")}>官方</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => aiText(editor, "用通俗的语言重写")}>通俗</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => aiText(editor, "用书面语言重写")}>书面</DropdownMenuItem>
                </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
                <DropdownMenuSubTrigger className="flex flex-row gap-1 items-center"> <Languages className="h-4 w-4" /> 翻译</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-[200px]">
                    <DropdownMenuItem onClick={() => aiText(editor, "翻译成简体中文")}>简体中文</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => aiText(editor, "翻译成繁体中文")}>繁体中文</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => aiText(editor, "翻译成英文")}>英文</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => aiText(editor, "翻译成德语")}>德语</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => aiText(editor, "翻译成日语")}>日文</DropdownMenuItem>
                </DropdownMenuSubContent>
            </DropdownMenuSub>
        </DropdownMenuContent>
    </DropdownMenu>
}