/**
 * `getCurrentTarget` — the agent's query for "what am I operating on?".
 *
 * Deliberately generic: it does not assume a page. Core registers the page
 * provider; plugins (file manager, bitable, charts, mind maps, …) register their
 * own through `registerAgentOperationTargetProvider` / the React hook. The tool
 * returns the object's `kind`, identity, summary, capabilities and the TOOLS
 * that operate on it, so the model can act without guessing a type-specific
 * workflow.
 *
 * Editor-free and `scope: 'any'`: a workbench run with no document is exactly
 * where "what is selected?" matters (a file, a table row, a build artifact).
 */

import type { ToolExecutionContext, ToolsRecord } from '../types'
import {
    resolveAgentOperationTargets,
    serializeAgentOperationTargets,
} from '../agent-operation-target'

export const createCurrentTargetTools = (_editor?: unknown): ToolsRecord => ({
    getCurrentTarget: {
        description:
            '查询"当前正在操作的对象"是什么：类型（kind）、id、标题、是否可编辑、能力、以及可以调用的工具。'
            + '对象不一定是页面——可能是文件、表格、图表、思维导图节点、选区等插件对象。'
            + '不确定用户在指什么、或要操作非当前目标前，先调用它；不要凭猜测假设对象类型，也不要直接套用页面工具。',
        inputSchema: {
            type: 'object',
            properties: {
                includeAll: {
                    type: 'boolean',
                    description: '可选。是否返回所有已注册的当前对象（默认只返回主目标 + 少量候选）。',
                },
            },
        },
        readOnly: true,
        execute: async (
            args: { includeAll?: boolean },
            _callId?: string,
            execCtx?: ToolExecutionContext,
        ) => {
            const targets = resolveAgentOperationTargets({
                conversationId: execCtx?.conversationId ?? null,
                owner: execCtx?.owner ?? null,
                sessionBinding: execCtx?.sessionBinding ?? null,
                isToolAvailable: execCtx?.isToolAvailable,
            })
            const views = serializeAgentOperationTargets(targets)
            if (views.length === 0) {
                return {
                    success: true,
                    count: 0,
                    primary: null,
                    targets: [],
                    message:
                        '当前没有可识别的操作对象。'
                        + '如果用户说的是某个页面，先用 searchPages / getSpacePageTree 找到它，再 editPage；'
                        + '如果指的是文件、表格等插件对象，需要先在该插件的界面里选中它（插件会注册当前对象）。'
                        + '不要假设对象类型，也不要凭空编造 id。',
                }
            }
            const primary = views[0]
            return {
                success: true,
                count: views.length,
                primary,
                targets: args?.includeAll ? views : views.slice(0, 3),
                message:
                    `当前主操作对象：${primary.label ?? primary.kind}（kind: ${primary.kind}）「${primary.title ?? primary.id}」（id: ${primary.id}）。`
                    + (primary.operations?.length
                        ? '用它列出的 operations 里的工具操作；不要套用不适用于该类型的工具。'
                        : '该对象没有暴露专用工具：按 summary / attributes 回答用户，或询问下一步，不要凭空套用页面工具。')
                    + (views.length > 1 ? `另有 ${views.length - 1} 个候选对象，可传 includeAll 查看。` : ''),
            }
        },
    },
})