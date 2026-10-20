/**
 * 左侧连接树（对标 DBX 的 Connections 侧栏）。
 *
 * 三层：连接 → 库 → 表。展开连接时按需拉 schema（autoLoadTables 关掉也允许手动刷新），
 * 点表直接在右侧查询标签里打开一条默认查询。
 *
 * 纯展示组件：所有数据与副作用（加载、删除、编辑）由 Panel 以回调注入。
 */
import React from 'react'
import { useTranslation } from '@kn/common'
import type { ConnectionConfig, SchemaMeta, TableMeta } from '../core/types'
import { catalogEntryForKind } from '../core/catalog'
import type { SavedConnection } from '../core/storage'
import { CLS, TypeBadge } from './ui'

export interface ConnectionTreeProps {
    connections: SavedConnection[]
    activeId: string | null
    expanded: Record<string, boolean>
    schemas: Record<string, SchemaMeta | null>
    loadingId: string | null
    schemaErrors: Record<string, string | undefined>
    onSelect: (id: string) => void
    onToggle: (id: string) => void
    onRefresh: (id: string) => void
    onEdit: (id: string) => void
    onDelete: (id: string) => void
    onNew: () => void
    onOpenTable: (id: string, table: TableMeta) => void
}

/** 连接自身的一行：颜色点 + 类型徽标 + 名称 + 主机。 */
const ConnectionRow: React.FC<{
    item: SavedConnection
    active: boolean
    expanded: boolean
    onSelect: () => void
    onToggle: () => void
    onRefresh: () => void
    onEdit: () => void
    onDelete: () => void
}> = ({ item, active, expanded, onSelect, onToggle, onRefresh, onEdit, onDelete }) => {
    const { t } = useTranslation()
    const entry = catalogEntryForKind(item.config.kind)
    const config: ConnectionConfig = item.config
    const host = [config.host, config.port].filter(Boolean).join(':')

    return (
        <div
            className={[
                'group flex items-center gap-1.5 rounded-md px-1.5 py-1.5 text-[13px] cursor-pointer',
                active ? 'bg-black/[0.06] dark:bg-white/[0.10]' : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.06]',
            ].join(' ')}
            onClick={onSelect}
            onDoubleClick={onToggle}
            title={host || entry?.label || config.kind}
        >
            <button
                type="button"
                className="w-4 shrink-0 text-[10px] opacity-60 hover:opacity-100"
                onClick={(e) => {
                    e.stopPropagation()
                    onToggle()
                }}
                aria-label={expanded ? 'collapse' : 'expand'}
            >
                {expanded ? '▾' : '▸'}
            </button>
            <TypeBadge abbr={entry?.abbr ?? config.kind.slice(0, 2).toUpperCase()} color={config.color ?? entry?.color} size="sm" />
            <span className="min-w-0 flex-1 truncate">{config.name || entry?.label || config.kind}</span>
            {config.advanced?.readOnly ? <span className="shrink-0 text-[10px] opacity-50">RO</span> : null}
            <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                <button
                    type="button"
                    className="rounded px-1 text-[11px] opacity-60 hover:opacity-100"
                    title={t('dbConnector.treeRefresh')}
                    onClick={(e) => {
                        e.stopPropagation()
                        onRefresh()
                    }}
                >
                    ⟳
                </button>
                <button
                    type="button"
                    className="rounded px-1 text-[11px] opacity-60 hover:opacity-100"
                    title={t('dbConnector.treeEdit')}
                    onClick={(e) => {
                        e.stopPropagation()
                        onEdit()
                    }}
                >
                    ✎
                </button>
                <button
                    type="button"
                    className="rounded px-1 text-[11px] opacity-60 hover:text-red-500 hover:opacity-100"
                    title={t('dbConnector.treeDelete')}
                    onClick={(e) => {
                        e.stopPropagation()
                        onDelete()
                    }}
                >
                    ✕
                </button>
            </span>
        </div>
    )
}

export const ConnectionTree: React.FC<ConnectionTreeProps> = ({
    connections,
    activeId,
    expanded,
    schemas,
    loadingId,
    schemaErrors,
    onSelect,
    onToggle,
    onRefresh,
    onEdit,
    onDelete,
    onNew,
    onOpenTable,
}) => {
    const { t } = useTranslation()

    return (
        <aside className="flex w-60 shrink-0 flex-col border-r border-black/[0.08] dark:border-white/[0.10]">
            <div className="flex items-center justify-between px-2.5 py-2">
                <span className="text-xs font-medium uppercase tracking-wide opacity-60">
                    {t('dbConnector.treeTitle')}
                </span>
                <button
                    type="button"
                    className="rounded px-1.5 text-sm leading-5 opacity-70 hover:bg-black/[0.06] hover:opacity-100 dark:hover:bg-white/[0.10]"
                    title={t('dbConnector.treeNew')}
                    onClick={onNew}
                >
                    ＋
                </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
                {connections.length === 0 ? (
                    <p className={CLS.hint + ' px-1.5 py-3'}>{t('dbConnector.treeEmpty')}</p>
                ) : null}

                {connections.map((item) => {
                    const isOpen = !!expanded[item.id]
                    const schema = schemas[item.id] ?? null
                    const error = schemaErrors[item.id]
                    const loading = loadingId === item.id

                    return (
                        <div key={item.id} className="mb-0.5">
                            <ConnectionRow
                                item={item}
                                active={activeId === item.id}
                                expanded={isOpen}
                                onSelect={() => onSelect(item.id)}
                                onToggle={() => onToggle(item.id)}
                                onRefresh={() => onRefresh(item.id)}
                                onEdit={() => onEdit(item.id)}
                                onDelete={() => onDelete(item.id)}
                            />

                            {isOpen ? (
                                <div className="ml-4 border-l border-black/[0.08] pl-1.5 dark:border-white/[0.10]">
                                    {loading ? (
                                        <p className={CLS.hint + ' py-1'}>{t('dbConnector.treeLoading')}</p>
                                    ) : error ? (
                                        <p className="py-1 pr-1 text-[11px] leading-4 text-red-500">{error}</p>
                                    ) : !schema ? (
                                        <p className={CLS.hint + ' py-1'}>{t('dbConnector.treeNotLoaded')}</p>
                                    ) : (
                                        <>
                                            <div className="flex items-center gap-1 py-1 text-[11px] opacity-60">
                                                <span className="truncate">{schema.database || item.config.database || 'default'}</span>
                                                <span className="shrink-0 opacity-70">({schema.tables.length})</span>
                                            </div>
                                            {schema.tables.length === 0 ? (
                                                <p className={CLS.hint + ' py-1'}>{t('dbConnector.treeEmptySchema')}</p>
                                            ) : null}
                                            {schema.tables.map((table) => (
                                                <button
                                                    key={table.name}
                                                    type="button"
                                                    className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-[12px] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                                                    onClick={() => onOpenTable(item.id, table)}
                                                    title={table.type ?? 'table'}
                                                >
                                                    <span className="opacity-40">▦</span>
                                                    <span className="min-w-0 flex-1 truncate">{table.name}</span>
                                                </button>
                                            ))}
                                        </>
                                    )}
                                </div>
                            ) : null}
                        </div>
                    )
                })}
            </div>
        </aside>
    )
}
