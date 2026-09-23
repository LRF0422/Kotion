/**
 * Host-owned "publish a new version" dialog, extracted from PluginList so the
 * plugin studio can open it through pluginMarketplace.openPublisher({ pluginId }).
 *
 * Same UI, validation and API as the plugin center's own flow.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { APIS, useApi, useUploadFile } from '@kn/common'
import {
    Avatar,
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogTitle,
    IconButton,
    Input,
    Label,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
    toast,
} from '@kn/ui'
import { CheckCircleIcon, Loader2Icon, PlusIcon, UploadIcon, XIcon } from '@kn/icon'
import { CollaborationEditor } from '@kn/editor'
import { useTranslation } from '@kn/common'

import { hasDocumentationContent } from '../plugin-model'

interface PluginVersion {
    label: string
    content: any
}

interface PluginRecord {
    id: string | number
    name?: string
    icon?: string
    developer?: string
    maintainer?: string
    key?: string
    currentVersion?: { version?: string; versionDescription?: PluginVersion[] }
}

export interface PluginVersionPublisherProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    pluginId?: string | number
    /** Artifact already uploaded by the caller (dev build). */
    initialArtifact?: { resourcePath: string; integrity?: string }
    onPublished?: () => void
}

const nextPatchVersion = (value?: string): string => {
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value ?? '')
    if (!match) return '1.0.0'
    return match[1] + '.' + match[2] + '.' + (Number(match[3]) + 1)
}

const toVersionContentString = (content: any): string => {
    if (typeof content === 'string') {
        const trimmed = content.trim()
        if (!trimmed) return '{}'
        try {
            return JSON.stringify(JSON.parse(trimmed))
        } catch {
            return '{}'
        }
    }
    return JSON.stringify(content ?? {})
}

const resolveEditorContent = (content: any): any => {
    if (content && typeof content === 'object') return content
    if (typeof content === 'string') {
        try {
            const parsed = JSON.parse(content)
            return parsed && typeof parsed === 'object' ? parsed : {}
        } catch {
            return {}
        }
    }
    return {}
}

const DEFAULT_DESCRIPTIONS: PluginVersion[] = [
    { label: 'Feature', content: {} },
    { label: 'Detail', content: {} },
    { label: 'ChangeLog', content: {} },
]

const pickPluginFile = () =>
    new Promise<File | null>((resolve) => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.js,application/javascript,text/javascript'
        input.onchange = () => resolve(input.files?.[0] ?? null)
        input.addEventListener('cancel', () => resolve(null))
        input.click()
    })

export const PluginVersionPublisher: React.FC<PluginVersionPublisherProps> = ({
    open,
    onOpenChange,
    pluginId,
    initialArtifact,
    onPublished,
}) => {
    const { t } = useTranslation()
    const { usePath, uploadPluginFile } = useUploadFile()

    const [plugin, setPlugin] = useState<PluginRecord | undefined>()
    const [file, setFile] = useState<{ name: string; originalName: string; integrity?: string } | undefined>()
    const [version, setVersion] = useState('1.0.0')
    const [descriptions, setDescriptions] = useState<PluginVersion[]>(DEFAULT_DESCRIPTIONS)
    const [activeTab, setActiveTab] = useState('Feature')
    const [addingTab, setAddingTab] = useState(false)
    const [newTabName, setNewTabName] = useState('')
    const [loading, setLoading] = useState(false)
    const [publishing, setPublishing] = useState(false)
    const editorRefs = useRef<Record<number, any>>({})

    useEffect(() => {
        if (!open || pluginId === undefined || pluginId === null) return
        let cancelled = false
        setLoading(true)
        setFile(
            initialArtifact?.resourcePath
                ? { name: initialArtifact.resourcePath, originalName: 'bundle.js', integrity: initialArtifact.integrity }
                : undefined,
        )
        useApi(APIS.GET_PLUGIN, { id: pluginId })
            .then((res: any) => {
                if (cancelled) return
                const record: PluginRecord = res.data ?? {}
                const descs: PluginVersion[] = record.currentVersion?.versionDescription?.length
                    ? record.currentVersion.versionDescription
                    : DEFAULT_DESCRIPTIONS
                setPlugin(record)
                setVersion(nextPatchVersion(record.currentVersion?.version))
                setDescriptions(descs)
                setActiveTab(descs[0]?.label ?? 'Feature')
                editorRefs.current = {}
            })
            .catch((error: unknown) => {
                if (!cancelled) toast.error(String((error as Error)?.message ?? error))
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [open, pluginId, initialArtifact])

    const handleAddTab = useCallback(() => {
        const label = newTabName.trim()
        if (!label) {
            toast.error(t('pluginManager.tabNameEmpty'))
            return
        }
        if (descriptions.some((item) => item.label === label)) {
            toast.error(t('pluginManager.tabNameExists'))
            return
        }
        setDescriptions((prev) => [...prev, { label, content: {} }])
        setActiveTab(label)
        setNewTabName('')
        setAddingTab(false)
    }, [newTabName, descriptions, t])

    const handleRemoveTab = useCallback(
        (index: number) => {
            if (descriptions.length <= 1) {
                toast.error(t('pluginManager.cannotRemoveLastTab'))
                return
            }
            setDescriptions((prev) => prev.filter((_, i) => i !== index))
        },
        [descriptions, t],
    )

    const publish = useCallback(async () => {
        if (!pluginId) return
        if (!file) {
            toast.error(t('pluginManager.uploadFile'))
            return
        }
        if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
            toast.error(t('pluginUploader.validation.versionFormat'))
            return
        }
        const synchronized = descriptions.map((item, index) => {
            const editor = editorRefs.current[index]
            return editor && typeof editor.getJSON === 'function'
                ? { ...item, content: editor.getJSON() }
                : item
        })
        const labels = synchronized.map((item) => item.label.trim().toLowerCase())
        if (
            !synchronized.length ||
            synchronized.length > 20 ||
            labels.some((label) => !label) ||
            new Set(labels).size !== labels.length ||
            !synchronized.some((item) => hasDocumentationContent(item.content))
        ) {
            toast.error(t('pluginUploader.validation.descriptionContent'))
            return
        }
        const versionDescs = synchronized
            .filter((item) => item.label.trim() && hasDocumentationContent(item.content))
            .map((item) => ({ label: item.label.trim(), content: toVersionContentString(item.content) }))
        setPublishing(true)
        try {
            await useApi(APIS.PUBLISH_PLUGIN_VERSION, { id: pluginId }, {
                version,
                resourcePath: file.name,
                integrity: file.integrity,
                versionDescs,
            })
            toast.success(t('pluginManager.publishSuccess'))
            onPublished?.()
            onOpenChange(false)
        } catch (error) {
            console.error('Failed to publish plugin version:', error)
            toast.error(t('pluginManager.operationFailed'))
        } finally {
            setPublishing(false)
        }
    }, [pluginId, file, version, descriptions, onOpenChange, onPublished, t])

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[85vh] w-full max-w-4xl flex flex-col">
                <DialogTitle className="flex flex-shrink-0 items-center gap-3">
                    <Avatar className="h-10 w-10">
                        <img src={usePath(plugin?.icon || '')} alt={plugin?.name || ''} />
                    </Avatar>
                    <div className="min-w-0 flex-1">
                        <div className="truncate">{plugin?.name}</div>
                        <div className="text-sm font-normal text-muted-foreground">
                            {t('pluginManager.publishVersion')}
                        </div>
                    </div>
                </DialogTitle>
                <DialogDescription />

                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-2">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>{t('pluginManager.developer')}</Label>
                            <Input value={plugin?.developer || ''} disabled />
                        </div>
                        <div className="space-y-2">
                            <Label>{t('pluginManager.maintainer')}</Label>
                            <Input value={plugin?.maintainer || ''} disabled />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>{t('pluginManager.version')}</Label>
                        <Input
                            value={version}
                            onChange={(event) => setVersion(event.target.value)}
                            placeholder="1.0.0"
                            className="font-mono"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                            {t('pluginManager.uploadPluginFile')}
                            <span className="text-xs text-muted-foreground">({t('pluginManager.required')})</span>
                        </Label>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                disabled={loading}
                                onClick={async () => {
                                    const selected = await pickPluginFile()
                                    if (!selected) return
                                    try {
                                        const uploaded = await uploadPluginFile(selected)
                                        setFile({
                                            name: uploaded.name,
                                            originalName: uploaded.originalName,
                                            integrity: uploaded.integrity,
                                        })
                                        toast.success(t('pluginManager.fileUploaded'))
                                    } catch {
                                        toast.error(t('pluginManager.operationFailed'))
                                    }
                                }}
                            >
                                <UploadIcon className="mr-2 h-4 w-4" />
                                {t('pluginManager.chooseFile')}
                            </Button>
                            {file ? (
                                <div className="flex flex-1 items-center gap-2 rounded-md bg-muted px-3 py-2">
                                    <CheckCircleIcon className="h-4 w-4 shrink-0 text-green-500" />
                                    <span className="flex-1 truncate text-sm">{file.originalName}</span>
                                    <IconButton icon={<XIcon className="h-4 w-4" />} onClick={() => setFile(undefined)} />
                                </div>
                            ) : null}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>{t('pluginManager.versionDescription')}</Label>
                        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                                <TabsList className="flex-shrink-0">
                                    {descriptions.map((item, index) => (
                                        <TabsTrigger key={index} value={item.label}>
                                            {item.label}
                                        </TabsTrigger>
                                    ))}
                                </TabsList>
                                {addingTab ? (
                                    <div className="flex flex-shrink-0 items-center gap-2">
                                        <Input
                                            placeholder="Tab name"
                                            value={newTabName}
                                            onChange={(event) => setNewTabName(event.target.value)}
                                            className="h-8 w-28"
                                            onKeyDown={(event) => {
                                                if (event.key === 'Enter') handleAddTab()
                                            }}
                                        />
                                        <IconButton icon={<CheckCircleIcon className="h-4 w-4" />} onClick={handleAddTab} />
                                        <IconButton
                                            icon={<XIcon className="h-4 w-4" />}
                                            onClick={() => {
                                                setAddingTab(false)
                                                setNewTabName('')
                                            }}
                                        />
                                    </div>
                                ) : (
                                    <IconButton
                                        icon={<PlusIcon className="h-4 w-4" />}
                                        onClick={() => setAddingTab(true)}
                                        className="flex-shrink-0"
                                    />
                                )}
                            </div>
                            <div className="overflow-hidden rounded-md border">
                                {descriptions.map((item, index) => (
                                    <TabsContent key={index} value={item.label} className="m-0 p-0">
                                        <div className="flex items-center justify-between border-b bg-muted/30 px-3 py-2">
                                            <span className="text-sm font-medium">{item.label}</span>
                                            {descriptions.length > 1 ? (
                                                <IconButton
                                                    icon={<XIcon className="h-4 w-4" />}
                                                    onClick={() => handleRemoveTab(index)}
                                                />
                                            ) : null}
                                        </div>
                                        <CollaborationEditor
                                            ref={(editor: any) => {
                                                editorRefs.current[index] = editor
                                            }}
                                            id=""
                                            content={resolveEditorContent(item.content)}
                                            isEditable
                                            width="w-full"
                                            withTitle={false}
                                            toc={false}
                                            toolbar
                                            user={null}
                                            token=""
                                            className="prose-sm h-[250px]"
                                            onBlur={(editor: any) => {
                                                const next = editor.getJSON()
                                                setDescriptions((data) =>
                                                    data.map((it, i) => (i === index ? { ...it, content: next } : it)),
                                                )
                                            }}
                                        />
                                    </TabsContent>
                                ))}
                            </div>
                        </Tabs>
                    </div>
                </div>

                <DialogFooter className="mt-4 flex-shrink-0 border-t pt-4">
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={publishing}>
                        {t('pluginManager.cancel')}
                    </Button>
                    <Button onClick={() => void publish()} disabled={publishing || !file}>
                        {publishing ? (
                            <>
                                <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                                {t('pluginManager.publishing')}
                            </>
                        ) : (
                            t('pluginManager.publish')
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
