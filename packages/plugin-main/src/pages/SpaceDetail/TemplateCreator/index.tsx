import { useSelector } from "@kn/common";
import { GlobalState, useApi, useUploadFile, useTranslation } from "@kn/common";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel,
    AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
    AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger, Avatar, Controller, Field,
    FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet, FileUploader, Input, ScrollArea, Textarea, cn, toast, useForm, z, zodResolver
} from "@kn/ui";
import React, { PropsWithChildren, useState, useMemo } from "react";
import { APIS } from "../../../api";


type PageMode = {
    mode: 'page'
    pageId: string
    defaultName?: string
    beforeSave?: () => Promise<void>
}

type SpaceMode = {
    mode: 'space'
    space: any
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

export const TemplateCreator: React.FC<TemplateCreatorProps> = (props) => {
    const { className } = props
    const { t } = useTranslation()
    const { userInfo } = useSelector((state: GlobalState) => state)
    const { usePath, uploadFile } = useUploadFile()
    const [open, setOpen] = useState(false)

    // Localize the validation message (schema literals can't call t()).
    const localizedSchema = useMemo(
        () => formSchema.extend({ name: z.string().min(1, t('template.nameRequired')) }),
        [t]
    )

    // The backend stores cover as a single string, but the form schema expects
    // string[] — coerce so zod validation doesn't reject a space's existing cover.
    const toCoverArray = (cover: unknown): string[] =>
        Array.isArray(cover) ? cover as string[] : (cover ? [cover as string] : [])

    const defaultValues = props.mode === 'space'
        ? {
            name: props.space.name || '',
            description: props.space.description || '',
            cover: toCoverArray(props.space.cover),
            categories: props.space.categories || [],
        }
        : {
            name: props.defaultName || '',
            description: '',
            cover: [],
            categories: [],
        }

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(localizedSchema),
        defaultValues
    })

    const onSubmit = async (values: z.infer<typeof formSchema>) => {
        // Send both `title` and `name`: the form collects `name`, but the
        // template list reads `title`. Carrying both avoids a "saved but no
        // title in the list" mismatch regardless of which the backend stores.
        const payload = { ...values, title: values.name, name: values.name }
        try {
            if (props.mode === 'space') {
                await useApi(APIS.SAVE_SPACE_AS_TEMPLATE, null, {
                    ...payload,
                    // Backend TemplateDTO reads `screenShot` for the cover images.
                    screenShot: values.cover,
                    spaceId: props.space.id,
                })
            } else {
                await props.beforeSave?.()
                await useApi(APIS.SAVE_AS_TEMPLATE, { id: props.pageId }, payload)
            }
            toast.success(t('template.saveSuccess'))
            setOpen(false)
            form.reset(defaultValues)
        } catch (error) {
            console.error("Failed to save template:", error)
            toast.error(t('template.saveFailed'))
        }
    }

    return <AlertDialog open={open} onOpenChange={setOpen}>
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
                                                <Input {...field} placeholder={t('template.namePlaceholder')} />
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
                                                <FileUploader multiple maxFileCount={5} onUpload={(files) => {
                                                    return Promise.all(files.map(it => {
                                                        return uploadFile(it).then(res => {
                                                            return usePath(res.name)
                                                        })
                                                    })).then(res => {
                                                        field.onChange(res)
                                                    })
                                                }} />
                                            </Field>
                                        )}
                                    />
                                    <Controller
                                        name="description"
                                        control={form.control}
                                        render={({ field }) => (
                                            <Field>
                                                <FieldLabel>{t('template.description')}</FieldLabel>
                                                <Textarea {...field} placeholder={t('template.descPlaceholder')} />
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
                    <AlertDialogCancel>{t('template.cancel')}</AlertDialogCancel>
                    <AlertDialogAction onClick={(e) => {
                        e.preventDefault()
                        form.handleSubmit(onSubmit)()
                    }}>
                        {t('template.confirm')}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogHeader>
        </AlertDialogContent>
    </AlertDialog>
}
