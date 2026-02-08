import React from 'react'
import { FileText, Wand2, PenLine, Search } from '@kn/icon'
import { Button } from '@kn/ui'

const PROMPTS = [
    { icon: FileText, label: '帮我总结文档', prompt: '请帮我总结当前文档的主要内容' },
    { icon: Wand2, label: '改进文档结构', prompt: '请帮我分析并改进当前文档的结构' },
    { icon: PenLine, label: '润色文档', prompt: '请帮我润色当前文档，使其更加通顺自然' },
    { icon: Search, label: '检查错误', prompt: '请帮我检查当前文档中的错误和不一致之处' },
] as const

interface QuickPromptsProps {
    onSubmit: (prompt: string) => void
}

export const QuickPrompts = React.memo(function QuickPrompts({ onSubmit }: QuickPromptsProps) {
    return (
        <div className="mx-4 my-3">
            <p className="text-xs text-muted-foreground mb-3 text-center">试试以下快捷操作</p>
            <div className="grid grid-cols-2 gap-2">
                {PROMPTS.map(({ icon: Icon, label, prompt }) => (
                    <Button
                        key={label}
                        variant="outline"
                        size="sm"
                        className="h-auto py-3 px-3 flex flex-col items-center gap-1.5 text-xs font-normal hover:bg-indigo-50 dark:hover:bg-indigo-950/30 hover:border-indigo-200 dark:hover:border-indigo-800 transition-all"
                        onClick={() => onSubmit(prompt)}
                    >
                        <Icon className="h-4 w-4 text-indigo-500" />
                        <span>{label}</span>
                    </Button>
                ))}
            </div>
        </div>
    )
})
