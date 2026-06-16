import { useSelector } from "@kn/common";
import { GlobalState, useApi, useUploadFile } from "@kn/common";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel,
    AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
    AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger, Avatar, Controller, Field,
    FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet, FileUploader, Input, ScrollArea, Textarea, cn, toast, useForm, z, zodResolver
} from "@kn/ui";
import React, { PropsWithChildren, useState } from "react";
import { APIS } from "../../../api";


type PageMode = {
    mode: 'page'
    pageId: string
    defaultName?: string
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
    const { userInfo } = useSelector((state: GlobalState) => state)
    const { usePath, uploadFile } = useUploadFile()
    const [open, setOpen] = useState(false)

    const defaultValues = props.mode === 'space'
        ? {
            name: props.space.name || '',
            description: props.space.description || '',
            cover: props.space.cover || [],
            categories: props.space.categories || [],
        }
        : {
            name: props.defaultName || '',
            description: '',
            cover: [],
            categories: [],
        }

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
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
                await useApi(APIS.SAVE_AS_TEMPLATE, { id: props.pageId }, payload)
            }
            toast.success("保存模板成功")
            setOpen(false)
            form.reset(defaultValues)
        } catch (error) {
            console.error("Failed to save template:", error)
            toast.error("保存模板失败")
        }
    }

    return <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger className={className}>{props.children}</AlertDialogTrigger>
        <AlertDialogContent className={cn("max-w-none w-[80%] max-h-[90%] 3xl:w-[60%]")}>
            <AlertDialogHeader>
                <AlertDialogTitle>Save as Template</AlertDialogTitle>
                <AlertDialogDescription>
                    填写模板信息，方便后续快速使用
                </AlertDialogDescription>
                <ScrollArea className="h-[90%]">
                    <form onSubmit={form.handleSubmit(onSubmit)} id="template-form">
                        <FieldGroup>
                            <FieldSet className="p-2">
                                <FieldLegend>模板信息</FieldLegend>
                                <FieldDescription>
                                    设置模板名称、描述和封面等信息
                                </FieldDescription>
                                <FieldGroup>
                                    <Field>
                                        <FieldLabel>Author</FieldLabel>
                                        <Avatar>
                                            <img src={usePath(userInfo?.avatar as string)} alt="" />
                                        </Avatar>
                                    </Field>
                                    <Controller
                                        name="name"
                                        control={form.control}
                                        render={({ field, fieldState }) => (
                                            <Field>
                                                <FieldLabel>Template Name *</FieldLabel>
                                                <Input {...field} placeholder="输入模板名称" />
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
                                                <FieldLabel>Cover</FieldLabel>
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
                                                <FieldLabel>Description</FieldLabel>
                                                <Textarea {...field} placeholder="输入模板描述" />
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
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={(e) => {
                        e.preventDefault()
                        form.handleSubmit(onSubmit)()
                    }}>
                        Confirm
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogHeader>
        </AlertDialogContent>
    </AlertDialog>
}
