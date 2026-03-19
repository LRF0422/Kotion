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
        <div className="mx-4 my-4 p-4 rounded-2xl bg-gradient-to-br from-indigo-50/50 to-purple-50/50 dark:from-indigo-950/20 dark:to-purple-950/20 border border-indigo-200/30 dark:border-indigo-800/30">
            <p className="text-xs text-muted-foreground mb-4 text-center font-medium">试试以下快捷操作</p>
            <div className="grid grid-cols-2 gap-3">
                {PROMPTS.map(({ icon: Icon, label, prompt }) => (
                    <Button
                        key={label}
                        variant="outline"
                        size="sm"
                        className="h-auto py-3.5 px-4 flex flex-col items-center gap-2 text-xs font-normal rounded-xl border-indigo-200/50 dark:border-indigo-800/50 hover:bg-indigo-50/80 dark:hover:bg-indigo-950/40 hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-md hover:shadow-indigo-500/10 transition-all"
                        onClick={() => onSubmit(prompt)}
                    >
                        <div className="p-1.5 rounded-lg bg-gradient-to-br from-indigo-100/80 to-purple-100/80 dark:from-indigo-900/50 dark:to-purple-900/50">
                            <Icon className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <span className="text-foreground/80">{label}</span>
                    </Button>
                ))}
            </div>
        </div>
    )
})
