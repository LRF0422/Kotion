import {
    GlobalState,
    logger,
    type Space,
    useSelector,
    useSpacePageService,
    useTranslation,
    useUploadFile,
} from "@kn/common";
import { LoaderCircle } from "@kn/icon";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel,
    AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
    AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger, Avatar, Controller, Field,
    FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet, FileUploader, Input, ScrollArea, Textarea, cn, toast, useForm, z, zodResolver
} from "@kn/ui";
import React, { PropsWithChildren, useMemo, useRef, useState } from "react";
import { getUploadedCoverNames, resolveTemplateCover, type TemplateCoverContent } from "./template-cover";


type PageMode = {
    mode: 'page'
    pageId: string
    defaultName?: string
    beforeSave?: () => Promise<void>
    getCoverContent?: () => TemplateCoverContent
}

type SpaceMode = {
    mode: 'space'
    space: Space
}

export type TemplateCreatorProps = PropsWithChildren<{
    className?: string
} & (PageMode | SpaceMode)>

const formSchema = z.object({
    name: z.string().min(1, "模板名称不能为空"),
    description: z.string().optional().default(""),
    cover: z.array(z.string()).optional().default([]),
    categories: z.array(z.object({
        id: z.string(),
        text: z.string()
    })).optional().default([]),
})

type FormValues = z.infer<typeof formSchema>

const toCoverArray = (cover: unknown): string[] =>
    Array.isArray(cover) ? cover as string[] : (cover ? [cover as string] : [])

export const TemplateCreator: React.FC<TemplateCreatorProps> = (props) => {
    const { className } = props
    const { t } = useTranslation()
    const service = useSpacePageService()
    const { userInfo } = useSelector((state: GlobalState) => state)
    const { usePath, uploadFile } = useUploadFile()
    const [open, setOpen] = useState(false)
    const [coverFiles, setCoverFiles] = useState<File[]>([])
    const coverFilesRef = useRef<File[]>([])
    const initialCoverRef = useRef<string[]>([])
    const uploadedCoverByFileRef = useRef(new Map<File, string>())
    const [manualCoverUploading, setManualCoverUploading] = useState(false)

    // Localize the validation message (schema literals can't call t()).
    const localizedSchema = useMemo(
        () => formSchema.extend({ name: z.string().min(1, t('template.nameRequired')) }),
        [t]
    )

    const getInitialValues = (): FormValues => {
        if (props.mode === 'space') {
            return {
                name: props.space.name || '',
                description: props.space.description || '',
                cover: toCoverArray(props.space.cover),
                categories: props.space.categories || [],
            }
        }

        const content = props.getCoverContent?.()
        return {
            name: content?.title || props.defaultName || '',
            description: '',
            cover: [],
            categories: [],
        }
    }

    const form = useForm<FormValues>({
        resolver: zodResolver(localizedSchema),
        defaultValues: getInitialValues()
    })
    const busy = manualCoverUploading || form.formState.isSubmitting

    const resetManualCoverSelection = () => {
        coverFilesRef.current = []
        uploadedCoverByFileRef.current.clear()
        setCoverFiles([])
    }

    const handleOpenChange = (nextOpen: boolean) => {
        if (!nextOpen && busy) return
        if (nextOpen) {
            const initialValues = getInitialValues()
            initialCoverRef.current = initialValues.cover
            form.reset(initialValues)
            resetManualCoverSelection()
        }
        setOpen(nextOpen)
    }

    const onSubmit = async (values: FormValues) => {
        if (manualCoverUploading) return

        let usedFallbackCover = false
        try {
            if (props.mode === 'space') {
                const payload = { ...values, title: values.name, name: values.name }
                await service.templates.saveSpaceAsTemplate({
                    ...payload,
                    // Space templates use `screenShot` for the cover images.
                    screenShot: values.cover,
                    spaceId: props.space.id,
                })
            } else {
                await props.beforeSave?.()
                const content = props.getCoverContent?.() ?? {}
                const coverResult = await resolveTemplateCover({
                    existingCover: values.cover,
                    title: values.name.trim() || content.title || t('template.untitled'),
                    summary: content.summary?.trim() || values.description?.trim() || t('template.coverEmptySummary'),
                    fileNameSeed: props.pageId,
                }, { uploadFile })

                if (coverResult.source === 'generated') {
                    form.setValue('cover', coverResult.cover, { shouldDirty: false })
                } else if (coverResult.source === 'fallback') {
                    usedFallbackCover = true
                    logger.warn('[TemplateCreator] automatic cover generation failed', coverResult.error)
                }

                await service.templates.savePageAsTemplate({
                    ...values,
                    pageId: props.pageId,
                    title: values.name,
                    name: values.name,
                    cover: coverResult.cover,
                })
            }

            toast.success(t(usedFallbackCover ? 'template.coverFallbackSaved' : 'template.saveSuccess'))
            setOpen(false)
            resetManualCoverSelection()
            form.reset(getInitialValues())
        } catch (error) {
            logger.error('[TemplateCreator] failed to save template', error)
            toast.error(t('template.saveFailed'))
        }
    }

    return <AlertDialog open={open} onOpenChange={handleOpenChange}>
        <AlertDialogTrigger className={className}>{props.children}</AlertDialogTrigger>
        <AlertDialogContent className={cn("max-w-none w-[80%] max-h-[90%] 3xl:w-[60%]")}>
            <AlertDialogHeader>
                <AlertDialogTitle>{t('template.dialogTitle')}</AlertDialogTitle>
                <AlertDialogDescription>
                    {t('template.dialogDesc')}
                </AlertDialogDescription>
                <ScrollArea className="h-[90%]">
                    <form onSubmit={form.handleSubmit(onSubmit)} id="template-form">
                        <FieldGroup>
                            <FieldSet className="p-2">
                                <FieldLegend>{t('template.sectionInfo')}</FieldLegend>
                                <FieldDescription>
                                    {t('template.sectionInfoDesc')}
                                </FieldDescription>
                                <FieldGroup>
                                    <Field>
                                        <FieldLabel>{t('template.author')}</FieldLabel>
                                        <Avatar>
                                            <img src={usePath(userInfo?.avatar as string)} alt="" />
                                        </Avatar>
                                    </Field>
                                    <Controller
                                        name="name"
                                        control={form.control}
                                        render={({ field, fieldState }) => (
                                            <Field>
                                                <FieldLabel>{t('template.nameLabel')} *</FieldLabel>
                                                <Input {...field} placeholder={t('template.namePlaceholder')} disabled={busy} />
                                                {fieldState.error && (
                                                    <p className="text-sm text-destructive">{fieldState.error.message}</p>
                                                )}
                                            </Field>
                                        )}
                                    />
                                    <Controller
                                        name="cover"
                                        control={form.control}
                                        render={({ field }) => (
                                            <Field>
                                                <FieldLabel>{t('template.cover')}</FieldLabel>
                                                <FileUploader
                                                    value={coverFiles}
                                                    multiple={props.mode === 'space'}
                                                    maxFileCount={props.mode === 'page' ? 1 : 5}
                                                    disabled={busy}
                                                    onValueChange={(files) => {
                                                        coverFilesRef.current = files
                                                        setCoverFiles(files)
                                                        const uploadedNames = getUploadedCoverNames(
                                                            files,
                                                            uploadedCoverByFileRef.current,
                                                        )
                                                        if (uploadedNames.length > 0) {
                                                            field.onChange(uploadedNames)
                                                        } else if (files.length === 0) {
                                                            field.onChange(props.mode === 'space' ? initialCoverRef.current : [])
                                                        }
                                                    }}
                                                    onUpload={async (files) => {
                                                        const pendingFiles = files.filter(file =>
                                                            !uploadedCoverByFileRef.current.has(file)
                                                        )
                                                        if (pendingFiles.length === 0) return

                                                        setManualCoverUploading(true)
                                                        try {
                                                            const results = await Promise.allSettled(pendingFiles.map(uploadFile))
                                                            results.forEach((result, index) => {
                                                                if (result.status === 'fulfilled') {
                                                                    uploadedCoverByFileRef.current.set(
                                                                        pendingFiles[index],
                                                                        result.value.name,
                                                                    )
                                                                }
                                                            })

                                                            const selectedFiles = coverFilesRef.current.filter(file =>
                                                                uploadedCoverByFileRef.current.has(file)
                                                            )
                                                            coverFilesRef.current = selectedFiles
                                                            setCoverFiles(selectedFiles)
                                                            const selectedNames = getUploadedCoverNames(
                                                                selectedFiles,
                                                                uploadedCoverByFileRef.current,
                                                            )
                                                            field.onChange(
                                                                selectedNames.length > 0
                                                                    ? selectedNames
                                                                    : props.mode === 'space'
                                                                        ? initialCoverRef.current
                                                                        : []
                                                            )

                                                            const failedUpload = results.find(result => result.status === 'rejected')
                                                            if (failedUpload?.status === 'rejected') throw failedUpload.reason
                                                        } finally {
                                                            setManualCoverUploading(false)
                                                        }
                                                    }}
                                                />
                                                {props.mode === 'page' && (
                                                    <FieldDescription>{t('template.coverAutoHint')}</FieldDescription>
                                                )}
                                            </Field>
                                        )}
                                    />
                                    <Controller
                                        name="description"
                                        control={form.control}
                                        render={({ field }) => (
                                            <Field>
                                                <FieldLabel>{t('template.description')}</FieldLabel>
                                                <Textarea {...field} placeholder={t('template.descPlaceholder')} disabled={busy} />
                                            </Field>
                                        )}
                                    />
                                    {/* Categories deferred: backend Page has no category field yet. */}
                                </FieldGroup>
                            </FieldSet>
                        </FieldGroup>
                    </form>
                </ScrollArea>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={busy}>{t('template.cancel')}</AlertDialogCancel>
                    <AlertDialogAction
                        disabled={busy}
                        onClick={(event) => {
                            event.preventDefault()
                            form.handleSubmit(onSubmit)()
                        }}
                    >
                        {form.formState.isSubmitting && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
                        {t(form.formState.isSubmitting ? 'template.saving' : 'template.confirm')}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogHeader>
        </AlertDialogContent>
    </AlertDialog>
}
